/**
 * GitHub webhook event formatters
 * Converts GitHub webhook payloads into human-readable messages for Towns channels
 */

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
import {
  buildMessage,
  getIssueEventEmoji,
  getIssueEventHeader,
  getPrEventEmoji,
  getPrEventHeader,
} from "./shared";

/**
 * Extract a clean preview from markdown/HTML content
 * Strips HTML comments, joins lines, truncates to maxLength
 * Keeps markdown formatting since Towns renders it
 */
function extractPreview(
  body: string | null | undefined,
  maxLength = 100
): string {
  if (!body) return "";
  const cleaned = body
    .replace(/<!--[\s\S]*?-->/g, "") // Strip HTML comments
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join(" ");
  return cleaned.length > maxLength
    ? cleaned.substring(0, maxLength) + "..."
    : cleaned;
}

export function formatPullRequest(payload: PullRequestPayload): string {
  const { action, pull_request, repository } = payload;

  const emoji = getPrEventEmoji(action, pull_request.merged ?? false);
  const header = getPrEventHeader(action, pull_request.merged ?? false);

  if (!emoji || !header) return "";

  // Always include stats for anchor messages
  const metadata = [
    `📊 +${pull_request.additions || 0} -${pull_request.deletions || 0}`,
  ];

  return buildMessage({
    emoji,
    header,
    repository: repository.full_name,
    number: pull_request.number,
    title: pull_request.title,
    user: pull_request.user?.login || "unknown",
    metadata,
    url: pull_request.html_url,
  });
}

export function formatIssue(payload: IssuesPayload): string {
  const { action, issue, repository } = payload;

  const emoji = getIssueEventEmoji(action, issue.state_reason);
  const header = getIssueEventHeader(action, issue.state_reason);

  if (!emoji || !header) return "";

  return buildMessage({
    emoji,
    header,
    repository: repository.full_name,
    number: issue.number,
    title: issue.title,
    user: issue.user?.login || "unknown",
    url: issue.html_url,
  });
}

export function formatPush(payload: PushPayload): string {
  const { ref, commits, pusher, repository, compare } = payload;
  const branch = ref.replace("refs/heads/", "");
  const commitCount = commits?.length || 0;

  if (commitCount === 0) return "";

  let message =
    `📦 **Push to ${repository.full_name}**\n` +
    `🌿 Branch: \`${branch}\`\n` +
    `👤 ${pusher.name}\n` +
    `📝 ${commitCount} commit${commitCount > 1 ? "s" : ""}\n\n`;

  // Show first 3 commits
  const displayCommits = commits.slice(0, 3);
  for (const commit of displayCommits) {
    const shortSha = commit.id.substring(0, 7);
    const firstLine = commit.message.split("\n")[0];
    const shortMessage =
      firstLine.length > 60 ? firstLine.substring(0, 60) + "..." : firstLine;
    message += `\`${shortSha}\` ${shortMessage}\n`;
  }

  if (commitCount > 3) {
    message += `\n_... and ${commitCount - 3} more commit${commitCount - 3 > 1 ? "s" : ""}_\n`;
  }

  message += `\n🔗 ${compare}`;

  return message;
}

export function formatRelease(payload: ReleasePayload): string {
  const { action, release, repository } = payload;

  if (action === "published") {
    return buildMessage({
      emoji: "🚀",
      header: "Release Published",
      repository: repository.full_name,
      title: release.name || release.tag_name,
      user: release.author?.login || "unknown",
      metadata: [`📦 ${release.tag_name}`],
      url: release.html_url,
    });
  }

  return "";
}

export function formatWorkflowRun(payload: WorkflowRunPayload): string {
  const { action, workflow_run, repository } = payload;

  if (action === "completed") {
    const emoji = workflow_run.conclusion === "success" ? "✅" : "❌";
    const status = workflow_run.conclusion === "success" ? "Passed" : "Failed";

    return (
      `${emoji} **CI ${status}**\n` +
      `**${repository.full_name}**\n` +
      `🔧 ${workflow_run.name}\n` +
      `🌿 ${workflow_run.head_branch}\n` +
      `🔗 ${workflow_run.html_url}`
    );
  }

  return "";
}

export function formatIssueComment(
  payload: IssueCommentPayload,
  isThreadReply: boolean
): string {
  const { action, issue, comment, repository } = payload;

  if (action === "created" || action === "edited") {
    const preview = extractPreview(comment.body);
    const user = comment.user?.login || "unknown";
    const editedIndicator = action === "edited" ? " _(edited)_" : "";

    if (isThreadReply) {
      return `💬 "${preview}"${editedIndicator} 👤 ${user} 🔗 ${comment.html_url}`;
    }

    const header =
      action === "edited"
        ? `💬 **Comment Edited on Issue #${issue.number}**`
        : `💬 **New Comment on Issue #${issue.number}**`;

    return (
      `${header}\n` +
      `**${repository.full_name}**\n\n` +
      `"${preview}"\n` +
      `👤 ${user}\n` +
      `🔗 ${comment.html_url}`
    );
  }

  return "";
}

export function formatPullRequestReview(
  payload: PullRequestReviewPayload,
  isThreadReply: boolean
): string {
  const { action, review, pull_request, repository } = payload;

  if (action === "submitted" || action === "edited") {
    let emoji = "👀";
    if (review.state === "approved") emoji = "✅";
    if (review.state === "changes_requested") emoji = "🔄";

    const state = review.state.replace("_", " ");
    const user = review.user?.login || "unknown";
    const editedIndicator = action === "edited" ? " _(edited)_" : "";

    if (isThreadReply) {
      const preview = extractPreview(review.body);
      return preview
        ? `${emoji} ${state}: "${preview}"${editedIndicator} 👤 ${user} 🔗 ${review.html_url}`
        : `${emoji} ${state}${editedIndicator} 👤 ${user} 🔗 ${review.html_url}`;
    }

    const header =
      action === "edited"
        ? `${emoji} **PR Review Edited: ${state}**`
        : `${emoji} **PR Review: ${state}**`;

    return (
      `${header}\n` +
      `**${repository.full_name}** #${pull_request.number}\n\n` +
      `**${pull_request.title}**\n` +
      `👤 ${user}\n` +
      `🔗 ${review.html_url}`
    );
  }

  return "";
}

export function formatPullRequestReviewComment(
  payload: PullRequestReviewCommentPayload,
  isThreadReply: boolean
): string {
  const { action, comment, pull_request, repository } = payload;

  if (action === "created" || action === "edited") {
    const preview = extractPreview(comment.body);
    const user = comment.user?.login || "unknown";
    const editedIndicator = action === "edited" ? " _(edited)_" : "";

    if (isThreadReply) {
      return `💬 "${preview}"${editedIndicator} 👤 ${user} 🔗 ${comment.html_url}`;
    }

    const header =
      action === "edited"
        ? `💬 **Review Comment Edited on PR #${pull_request.number}**`
        : `💬 **Review Comment on PR #${pull_request.number}**`;

    return (
      `${header}\n` +
      `**${repository.full_name}**\n\n` +
      `"${preview}"\n` +
      `👤 ${user}\n` +
      `🔗 ${comment.html_url}`
    );
  }

  return "";
}

export function formatFork(payload: ForkPayload): string {
  const { forkee, repository, sender } = payload;

  return (
    `🍴 **Repository Forked**\n` +
    `**${repository.full_name}** → **${forkee.full_name}**\n` +
    `👤 ${sender.login}\n` +
    `🔗 ${forkee.html_url}`
  );
}

export function formatWatch(payload: WatchPayload): string {
  const { action, repository, sender } = payload;

  if (action === "started") {
    return (
      `⭐ **Repository Starred**\n` +
      `**${repository.full_name}**\n` +
      `👤 ${sender.login}\n` +
      `🔗 ${repository.html_url}`
    );
  }

  return "";
}

export function formatCreate(payload: CreatePayload): string {
  const { ref, ref_type, repository } = payload;
  const refValue = ref || "unknown";
  const refTypeValue = ref_type || "branch";

  return (
    `🌿 **Created ${refTypeValue}** in ${repository.full_name}\n` +
    `\`${refValue}\`\n` +
    `${repository.html_url}`
  );
}

export function formatDelete(payload: DeletePayload): string {
  const { ref, ref_type, repository } = payload;
  const refValue = ref || "unknown";
  const refTypeValue = ref_type || "branch";

  return (
    `🗑️ **Deleted ${refTypeValue}** in ${repository.full_name}\n` +
    `\`${refValue}\`\n` +
    `${repository.html_url}`
  );
}
