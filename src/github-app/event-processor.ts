import { isMatch } from "picomatch";

import { BRANCH_FILTERABLE_EVENTS_SET, EventType } from "../constants";
import {
  formatCreate,
  formatDelete,
  formatFork,
  formatIssue,
  formatIssueComment,
  formatPullRequest,
  formatPullRequestReview,
  formatPullRequestReviewComment,
  formatPush,
  formatRelease,
  formatWatch,
  formatWorkflowRun,
} from "../formatters/webhook-events";
import type {
  BranchFilter,
  SubscriptionService,
} from "../services/subscription-service";
import type { AnchorType, ThreadService } from "../services/thread-service";
import type { TownsBot } from "../types/bot";
import type {
  CreatePayload,
  DeletePayload,
  ForkPayload,
  IssueCommentPayload,
  IssuesPayload,
  PullRequestPayload,
  PullRequestReviewCommentPayload,
  PullRequestReviewPayload,
  PushPayload,
  ReleasePayload,
  WatchPayload,
  WorkflowRunPayload,
} from "../types/webhooks";

/**
 * Threading context for events that can be grouped into threads
 */
interface ThreadingContext {
  anchorType: AnchorType;
  anchorNumber: number;
  isAnchor: boolean; // true for "opened" events that start a thread
}

/**
 * EventProcessor - Routes webhook events to formatters and sends to subscribed channels
 *
 * Maps webhook event types to subscription event types and filters by user preferences.
 * Supports threading: PR/issue opened events start threads, follow-up events reply to them.
 */
export class EventProcessor {
  private bot: TownsBot;
  private subscriptionService: SubscriptionService;
  private threadService: ThreadService;

  constructor(
    bot: TownsBot,
    subscriptionService: SubscriptionService,
    threadService: ThreadService
  ) {
    this.bot = bot;
    this.subscriptionService = subscriptionService;
    this.threadService = threadService;
  }

  /**
   * Generic helper to process GitHub webhook events
   * Handles channel filtering, message formatting, and distribution
   *
   * @param event - The webhook event payload
   * @param eventType - The subscription event type for filtering
   * @param formatter - Function to format the event as a message
   * @param logContext - Optional context string for logging
   * @param branchContext - Optional branch context for branch-specific filtering
   * @param threadingContext - Optional threading context for PR/issue grouping
   */
  private async processEvent<
    T extends { repository: { full_name: string; default_branch: string } },
  >(
    event: T,
    eventType: EventType,
    formatter: (event: T, isThreadReply?: boolean) => string,
    logContext?: string,
    branchContext?: { branch: string },
    threadingContext?: ThreadingContext
  ) {
    if (logContext) {
      console.log(`Processing ${logContext}`);
    }

    // Validate branchContext is provided for branch-filterable events
    const isBranchFilterable = BRANCH_FILTERABLE_EVENTS_SET.has(eventType);
    if (isBranchFilterable && !branchContext) {
      throw new Error(
        `${eventType} is branch-filterable but no branchContext provided`
      );
    }

    const repoFullName = event.repository.full_name;

    // Get subscribed channels for this repo (webhook mode only)
    const channels = await this.subscriptionService.getRepoSubscribers(
      repoFullName,
      "webhook"
    );

    // Filter by event preferences
    let interestedChannels = channels.filter(ch =>
      ch.eventTypes.includes(eventType)
    );

    // Apply branch filtering for branch-specific events
    if (branchContext) {
      const { branch } = branchContext;
      const defaultBranch = event.repository.default_branch;

      interestedChannels = interestedChannels.filter(ch =>
        matchesBranchFilter(branch, ch.branchFilter, defaultBranch)
      );
    }

    if (interestedChannels.length === 0) {
      const branchInfo = branchContext
        ? ` on branch ${branchContext.branch}`
        : "";
      console.log(`No interested channels for ${eventType} event${branchInfo}`);
      return;
    }

    // Determine if this is a follow-up event (not an anchor)
    const isFollowUpEvent = !!threadingContext && !threadingContext.isAnchor;

    // Send to all interested channels
    // For threaded events, look up or create thread mappings per channel
    const sendPromises = interestedChannels.map(async channel => {
      const { spaceId, channelId } = channel;

      try {
        // For follow-up events, look up existing thread (undefined if not found or anchor)
        const threadId = isFollowUpEvent
          ? ((await this.threadService.getThreadId(
              spaceId,
              channelId,
              repoFullName,
              threadingContext.anchorType,
              threadingContext.anchorNumber
            )) ?? undefined)
          : undefined;

        // Format message - use compact format only if we're actually replying to a thread
        const message = formatter(event, !!threadId);

        if (!message) {
          console.log(
            "Formatter returned empty message (event action not handled)"
          );
          return;
        }

        // Send message (threaded for follow-ups, top-level for anchors/no-context)
        const { eventId } = await this.bot.sendMessage(channelId, message, {
          threadId,
        });

        // Store thread mapping for anchor events
        if (threadingContext?.isAnchor && eventId) {
          await this.threadService.storeThread({
            spaceId,
            channelId,
            repoFullName,
            anchorType: threadingContext.anchorType,
            anchorNumber: threadingContext.anchorNumber,
            threadEventId: eventId,
          });
        }
      } catch (error) {
        console.error(`Failed to send to ${channel.channelId}:`, error);
      }
    });

    await Promise.allSettled(sendPromises);
  }

  /**
   * Process a pull request webhook event
   * Branch filter applies to base branch (merge target)
   * Threading: "opened" starts thread, other actions reply to it
   */
  async onPullRequest(event: PullRequestPayload) {
    const { pull_request, repository, action } = event;
    const baseBranch = pull_request.base.ref;
    await this.processEvent(
      event,
      "pr",
      formatPullRequest,
      `PR event: ${action} - ${repository.full_name}#${pull_request.number}`,
      { branch: baseBranch },
      {
        anchorType: "pr",
        anchorNumber: pull_request.number,
        isAnchor: action === "opened",
      }
    );
  }

  /**
   * Process a push webhook event (commits)
   * Branch filter applies to the branch being pushed to
   */
  async onPush(event: PushPayload) {
    const { repository, ref, commits } = event;
    // Extract branch name from ref (e.g., "refs/heads/main" -> "main")
    const branch = ref.replace(/^refs\/heads\//, "");
    await this.processEvent(
      event,
      "commits",
      formatPush,
      `push event: ${repository.full_name} - ${ref} (${commits?.length || 0} commits)`,
      { branch }
    );
  }

  /**
   * Process an issues webhook event
   * Threading: "opened" starts thread, other actions reply to it
   */
  async onIssues(event: IssuesPayload) {
    const { issue, repository, action } = event;
    await this.processEvent(
      event,
      "issues",
      formatIssue,
      `issue event: ${action} - ${repository.full_name}#${issue.number}`,
      undefined,
      {
        anchorType: "issue",
        anchorNumber: issue.number,
        isAnchor: action === "opened",
      }
    );
  }

  /**
   * Process a release webhook event
   */
  async onRelease(event: ReleasePayload) {
    const { release, repository } = event;
    await this.processEvent(
      event,
      "releases",
      formatRelease,
      `release event: ${event.action} - ${repository.full_name} ${release.tag_name}`
    );
  }

  /**
   * Process a workflow run webhook event (CI)
   * Branch filter applies to the branch that triggered the workflow
   */
  async onWorkflowRun(event: WorkflowRunPayload) {
    const { workflow_run, repository } = event;
    // head_branch can be null for workflows triggered by tags or other non-branch refs
    const branch = workflow_run.head_branch ?? repository.default_branch;
    await this.processEvent(
      event,
      "ci",
      formatWorkflowRun,
      `workflow run event: ${event.action} - ${repository.full_name} ${workflow_run.name}`,
      { branch }
    );
  }

  /**
   * Process an issue comment webhook event
   * Threading: comments thread to parent PR or issue
   * Note: GitHub fires issue_comment for both issues AND PRs
   */
  async onIssueComment(event: IssueCommentPayload) {
    const { issue, repository } = event;
    // Determine if this is a comment on a PR or an issue
    // GitHub includes pull_request field in the issue object for PR comments
    const isPrComment = "pull_request" in issue && issue.pull_request != null;
    await this.processEvent(
      event,
      "comments",
      formatIssueComment,
      `issue comment event: ${event.action} - ${repository.full_name}#${issue.number}`,
      undefined,
      {
        anchorType: isPrComment ? "pr" : "issue",
        anchorNumber: issue.number,
        isAnchor: false, // Comments are never anchors
      }
    );
  }

  /**
   * Process a pull request review webhook event
   * Branch filter applies to the PR's base branch (merge target)
   * Threading: reviews thread to parent PR
   */
  async onPullRequestReview(event: PullRequestReviewPayload) {
    const { pull_request, repository } = event;
    const baseBranch = pull_request.base.ref;
    await this.processEvent(
      event,
      "reviews",
      formatPullRequestReview,
      `PR review event: ${event.action} - ${repository.full_name}#${pull_request.number}`,
      { branch: baseBranch },
      {
        anchorType: "pr",
        anchorNumber: pull_request.number,
        isAnchor: false, // Reviews are never anchors
      }
    );
  }

  /**
   * Process a pull request review comment webhook event
   * Branch filter applies to the PR's base branch (merge target)
   */
  async onPullRequestReviewComment(event: PullRequestReviewCommentPayload) {
    const { pull_request, repository } = event;
    const baseBranch = pull_request.base.ref;
    await this.processEvent(
      event,
      "review_comments",
      formatPullRequestReviewComment,
      `PR review comment event: ${event.action} - ${repository.full_name}#${pull_request.number}`,
      { branch: baseBranch },
      {
        anchorType: "pr",
        anchorNumber: pull_request.number,
        isAnchor: false,
      }
    );
  }

  /**
   * Process branch create/delete events
   * Branch filter applies to the branch being created/deleted
   */
  async onBranchEvent(
    event: CreatePayload | DeletePayload,
    eventType: "create" | "delete"
  ) {
    const formatter = (e: CreatePayload | DeletePayload) =>
      eventType === "create"
        ? formatCreate(e as CreatePayload)
        : formatDelete(e as DeletePayload);

    // ref is the branch/tag name being created or deleted
    const branch = event.ref;
    await this.processEvent(
      event,
      "branches",
      formatter,
      `${eventType} event: ${event.repository.full_name}`,
      { branch }
    );
  }

  /**
   * Process fork webhook event
   */
  async onFork(event: ForkPayload) {
    await this.processEvent(
      event,
      "forks",
      formatFork,
      `fork event: ${event.repository.full_name}`
    );
  }

  /**
   * Process watch webhook event (star)
   */
  async onWatch(event: WatchPayload) {
    await this.processEvent(
      event,
      "stars",
      formatWatch,
      `watch event: ${event.repository.full_name}`
    );
  }
}

/**
 * Check if a branch matches a branch filter pattern
 *
 * @param branch - The actual branch name (e.g., "main", "feature/foo")
 * @param filter - Branch filter value from subscription
 * @param defaultBranch - Repository's default branch for null filter
 * @returns true if the branch should be included
 */
export function matchesBranchFilter(
  branch: string,
  filter: BranchFilter,
  defaultBranch: string
): boolean {
  // null = default branch only
  if (filter === null) {
    return branch === defaultBranch;
  }

  // "all" = all branches
  if (filter === "all") {
    return true;
  }

  // Specific patterns (comma-separated, glob support)
  const patterns = filter.split(",").map(p => p.trim());
  return patterns.some(pattern => isMatch(branch, pattern));
}
