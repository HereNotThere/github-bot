import type { GitHubEvent } from "../api/github-client";
import { fetchRepoEvents } from "../api/github-client";
import { dbService } from "../db";

/**
 * Format GitHub Events API events into human-readable messages
 * Events API has different structure than webhooks
 */
function formatEvent(event: GitHubEvent): string {
  const { type, payload, actor, repo } = event;

  switch (type) {
    case "PullRequestEvent": {
      const pr = payload.pull_request as any;
      const action = payload.action as string;

      if (action === "opened") {
        return (
          `🔔 **Pull Request Opened**\n` +
          `**${repo.name}** #${pr.number}\n\n` +
          `**${pr.title}**\n` +
          `👤 ${actor.login}\n` +
          `🔗 ${pr.html_url}`
        );
      }

      if (action === "closed" && pr.merged) {
        return (
          `✅ **Pull Request Merged**\n` +
          `**${repo.name}** #${pr.number}\n\n` +
          `**${pr.title}**\n` +
          `👤 ${actor.login}\n` +
          `🔗 ${pr.html_url}`
        );
      }

      if (action === "closed" && !pr.merged) {
        return (
          `❌ **Pull Request Closed**\n` +
          `**${repo.name}** #${pr.number}\n\n` +
          `**${pr.title}**\n` +
          `👤 ${actor.login}\n` +
          `🔗 ${pr.html_url}`
        );
      }
      return "";
    }

    case "IssuesEvent": {
      const issue = payload.issue as any;
      const action = payload.action as string;

      if (action === "opened") {
        return (
          `🐛 **Issue Opened**\n` +
          `**${repo.name}** #${issue.number}\n\n` +
          `**${issue.title}**\n` +
          `👤 ${actor.login}\n` +
          `🔗 ${issue.html_url}`
        );
      }

      if (action === "closed") {
        return (
          `✅ **Issue Closed**\n` +
          `**${repo.name}** #${issue.number}\n\n` +
          `**${issue.title}**\n` +
          `👤 ${actor.login}\n` +
          `🔗 ${issue.html_url}`
        );
      }
      return "";
    }

    case "PushEvent": {
      const commits = payload.commits as any[];
      const ref = payload.ref as string;
      const branch = ref?.replace("refs/heads/", "") || "unknown";
      const commitCount = commits?.length || 0;

      if (commitCount === 0) return "";

      let message =
        `📦 **Push to ${repo.name}**\n` +
        `🌿 Branch: \`${branch}\`\n` +
        `👤 ${actor.login}\n` +
        `📝 ${commitCount} commit${commitCount > 1 ? "s" : ""}\n\n`;

      // Show first 3 commits
      const displayCommits = commits.slice(0, 3);
      for (const commit of displayCommits) {
        const shortSha = commit.sha.substring(0, 7);
        const shortMessage = commit.message.split("\n")[0].substring(0, 60);
        message += `\`${shortSha}\` ${shortMessage}\n`;
      }

      if (commitCount > 3) {
        message += `\n_... and ${commitCount - 3} more commit${commitCount - 3 > 1 ? "s" : ""}_`;
      }

      return message;
    }

    case "ReleaseEvent": {
      const release = payload.release as any;
      const action = payload.action as string;

      if (action === "published") {
        return (
          `🚀 **Release Published**\n` +
          `**${repo.name}** ${release.tag_name}\n\n` +
          `**${release.name || release.tag_name}**\n` +
          `👤 ${actor.login}\n` +
          `🔗 ${release.html_url}`
        );
      }
      return "";
    }

    case "WorkflowRunEvent": {
      const workflowRun = payload.workflow_run as any;
      const action = payload.action as string;

      if (action === "completed") {
        const emoji = workflowRun.conclusion === "success" ? "✅" : "❌";
        const status =
          workflowRun.conclusion === "success" ? "Passed" : "Failed";

        return (
          `${emoji} **CI ${status}**\n` +
          `**${repo.name}**\n` +
          `🔧 ${workflowRun.name}\n` +
          `🌿 ${workflowRun.head_branch}\n` +
          `🔗 ${workflowRun.html_url}`
        );
      }
      return "";
    }

    case "IssueCommentEvent": {
      const issue = payload.issue as any;
      const comment = payload.comment as any;
      const action = payload.action as string;

      if (action === "created") {
        const shortComment = comment.body.split("\n")[0].substring(0, 100);

        return (
          `💬 **New Comment on Issue #${issue.number}**\n` +
          `**${repo.name}**\n\n` +
          `"${shortComment}${comment.body.length > 100 ? "..." : ""}"\n` +
          `👤 ${actor.login}\n` +
          `🔗 ${comment.html_url}`
        );
      }
      return "";
    }

    case "PullRequestReviewEvent": {
      const pr = payload.pull_request as any;
      const review = payload.review as any;
      const action = payload.action as string;

      if (action === "created") {
        let emoji = "👀";
        if (review.state === "approved") emoji = "✅";
        if (review.state === "changes_requested") emoji = "🔄";

        return (
          `${emoji} **PR Review: ${review.state.replace("_", " ")}**\n` +
          `**${repo.name}** #${pr.number}\n\n` +
          `**${pr.title}**\n` +
          `👤 ${actor.login}\n` +
          `🔗 ${review.html_url}`
        );
      }
      return "";
    }

    // Ignore other event types for now
    default:
      return "";
  }
}

/**
 * Polling service that checks GitHub repositories for new events
 */
export class PollingService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;
  private sendMessageFn:
    | ((channelId: string, message: string) => Promise<void>)
    | null = null;

  constructor(private pollIntervalMs: number = 5 * 60 * 1000) {}

  /**
   * Set the function used to send messages to Towns channels
   */
  setSendMessageFunction(
    fn: (channelId: string, message: string) => Promise<void>
  ): void {
    this.sendMessageFn = fn;
  }

  /**
   * Start the polling service
   */
  start(): void {
    if (this.intervalId) {
      console.log("Polling service already running");
      return;
    }

    console.log(
      `Starting polling service (interval: ${this.pollIntervalMs}ms)`
    );

    // Poll immediately on start
    void this.poll();

    // Then poll on interval
    this.intervalId = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
  }

  /**
   * Stop the polling service
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("Polling service stopped");
    }
  }

  /**
   * Poll all subscribed repositories for new events
   */
  private async poll(): Promise<void> {
    if (this.isPolling) {
      console.log("Poll already in progress, skipping...");
      return;
    }

    if (!this.sendMessageFn) {
      console.error("Send message function not set, cannot poll");
      return;
    }

    this.isPolling = true;

    try {
      const repos = await dbService.getAllSubscribedRepos();

      if (repos.length === 0) {
        console.log("No subscribed repos to poll");
        this.isPolling = false;
        return;
      }

      console.log(`Polling ${repos.length} repositories...`);

      for (const repo of repos) {
        try {
          await this.pollRepo(repo);
        } catch (error) {
          console.error(`Error polling ${repo}:`, error);
        }
      }

      console.log(`Finished polling ${repos.length} repositories`);
    } catch (error) {
      console.error("Error in polling service:", error);
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Poll a single repository for new events
   */
  private async pollRepo(repo: string): Promise<void> {
    // Get polling state (ETag and last seen event ID)
    const state = await dbService.getPollingState(repo);
    const etag = state?.etag;
    const lastEventId = state?.lastEventId;

    // Fetch events with ETag
    const result = await fetchRepoEvents(repo, etag);

    // 304 Not Modified - no new events
    if (result.notModified) {
      console.log(`${repo}: No changes (304 Not Modified)`);
      await dbService.updatePollingState(repo, {
        lastPolledAt: new Date(),
      });
      return;
    }

    const { events, etag: newEtag } = result;

    if (events.length === 0) {
      console.log(`${repo}: No events returned`);
      await dbService.updatePollingState(repo, {
        etag: newEtag,
        lastPolledAt: new Date(),
      });
      return;
    }

    // Filter out events we've already seen
    let newEvents = events;
    if (lastEventId) {
      const lastSeenIndex = events.findIndex(e => e.id === lastEventId);
      if (lastSeenIndex >= 0) {
        // Only include events after the last seen event
        newEvents = events.slice(0, lastSeenIndex);
      }
    }

    console.log(
      `${repo}: ${events.length} total events, ${newEvents.length} new`
    );

    if (newEvents.length > 0) {
      // Get all channels subscribed to this repo
      const channels = await dbService.getRepoSubscribers(repo);

      // Process events in chronological order (oldest first)
      const eventsToSend = newEvents.reverse();

      for (const event of eventsToSend) {
        const message = formatEvent(event);

        if (message) {
          // Send to all subscribed channels
          for (const channelId of channels) {
            try {
              await this.sendMessageFn!(channelId, message);
            } catch (error) {
              console.error(
                `Failed to send event to channel ${channelId}:`,
                error
              );
            }
          }
        }
      }

      // Update polling state with new ETag and last seen event ID
      await dbService.updatePollingState(repo, {
        etag: newEtag,
        lastEventId: events[0].id, // Most recent event ID
        lastPolledAt: new Date(),
      });
    } else {
      // No new events, just update ETag and timestamp
      await dbService.updatePollingState(repo, {
        etag: newEtag,
        lastPolledAt: new Date(),
      });
    }
  }
}

export const pollingService = new PollingService();
