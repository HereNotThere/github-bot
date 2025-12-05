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
  DeliveryAction,
  EntityContext,
  MessageDeliveryService,
  ThreadingContext,
} from "../services/message-delivery-service";
import type {
  BranchFilter,
  SubscriptionService,
} from "../services/subscription-service";
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
 * EventProcessor - Routes webhook events to formatters and sends to subscribed channels
 *
 * Maps webhook event types to subscription event types and filters by user preferences.
 * Delegates message delivery (threading, editing, deleting) to MessageDeliveryService.
 */
export class EventProcessor {
  constructor(
    private subscriptionService: SubscriptionService,
    private messageDeliveryService: MessageDeliveryService
  ) {}

  /**
   * Generic helper to process GitHub webhook events
   * Handles channel filtering and delegates delivery to MessageDeliveryService
   */
  private async processEvent<
    T extends { repository: { full_name: string; default_branch: string } },
  >(
    event: T,
    eventType: EventType,
    action: "create" | "edit" | "delete" = "create",
    formatter: (event: T, isThreadReply?: boolean) => string,
    logContext?: string,
    branchContext?: { branch: string },
    threadingContext?: ThreadingContext,
    entityContext?: EntityContext
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

    // Deliver to all interested channels
    const deliveryPromises = interestedChannels.map(channel =>
      this.messageDeliveryService.deliver({
        spaceId: channel.spaceId,
        channelId: channel.channelId,
        repoFullName,
        action,
        threadingContext,
        entityContext,
        formatter: isThreadReply => formatter(event, isThreadReply),
      })
    );

    await Promise.allSettled(deliveryPromises);
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
      "create",
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
      "create",
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
      "create",
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
      "create",
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
      "create",
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
    const { action, issue, comment, repository } = event;
    // Determine if this is a comment on a PR or an issue
    // GitHub includes pull_request field in the issue object for PR comments
    const isPrComment = "pull_request" in issue && issue.pull_request != null;
    const deliveryAction = toDeliveryAction(action);
    if (!deliveryAction) return;

    await this.processEvent(
      event,
      "comments",
      deliveryAction,
      formatIssueComment,
      `issue comment event: ${action} - ${repository.full_name}#${issue.number}`,
      undefined,
      {
        anchorType: isPrComment ? "pr" : "issue",
        anchorNumber: issue.number,
        isAnchor: false,
      },
      {
        githubEntityType: "comment",
        githubEntityId: String(comment.id),
        parentType: isPrComment ? "pr" : "issue",
        parentNumber: issue.number,
        githubUpdatedAt: new Date(comment.updated_at),
      }
    );
  }

  /**
   * Process a pull request review webhook event
   * Branch filter applies to the PR's base branch (merge target)
   * Threading: reviews thread to parent PR
   */
  async onPullRequestReview(event: PullRequestReviewPayload) {
    const { action, review, pull_request, repository } = event;
    const baseBranch = pull_request.base.ref;

    const mappingAction =
      action === "submitted" ? "create" : action === "edited" ? "edit" : null;

    if (!mappingAction) return;

    await this.processEvent(
      event,
      "reviews",
      mappingAction,
      formatPullRequestReview,
      `PR review event: ${action} - ${repository.full_name}#${pull_request.number}`,
      { branch: baseBranch },
      {
        anchorType: "pr",
        anchorNumber: pull_request.number,
        isAnchor: false,
      },
      {
        githubEntityType: "review",
        githubEntityId: String(review.id),
        parentType: "pr",
        parentNumber: pull_request.number,
        githubUpdatedAt: new Date(review.submitted_at ?? Date.now()),
      }
    );
  }

  /**
   * Process a pull request review comment webhook event
   * Branch filter applies to the PR's base branch (merge target)
   */
  async onPullRequestReviewComment(event: PullRequestReviewCommentPayload) {
    const { action, comment, pull_request, repository } = event;
    const baseBranch = pull_request.base.ref;
    const deliveryAction = toDeliveryAction(action);
    if (!deliveryAction) return;

    await this.processEvent(
      event,
      "review_comments",
      deliveryAction,
      formatPullRequestReviewComment,
      `PR review comment event: ${action} - ${repository.full_name}#${pull_request.number}`,
      { branch: baseBranch },
      {
        anchorType: "pr",
        anchorNumber: pull_request.number,
        isAnchor: false,
      },
      {
        githubEntityType: "review_comment",
        githubEntityId: String(comment.id),
        parentType: "pr",
        parentNumber: pull_request.number,
        githubUpdatedAt: new Date(comment.updated_at),
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

    const branch = event.ref;
    await this.processEvent(
      event,
      "branches",
      "create",
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
      "create",
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
      "create",
      formatWatch,
      `watch event: ${event.repository.full_name}`
    );
  }
}

/**
 * Check if a branch matches a branch filter pattern
 */
export function matchesBranchFilter(
  branch: string,
  filter: BranchFilter,
  defaultBranch: string
): boolean {
  if (filter === null) {
    return branch === defaultBranch;
  }

  if (filter === "all") {
    return true;
  }

  const patterns = filter.split(",").map(p => p.trim());
  return patterns.some(pattern => isMatch(branch, pattern));
}

/** Map GitHub webhook action to delivery action */
function toDeliveryAction(action: string): DeliveryAction | null {
  if (action === "created") return "create";
  if (action === "edited") return "edit";
  if (action === "deleted") return "delete";
  return null;
}
