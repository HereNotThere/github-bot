/**
 * Shared formatting utilities for GitHub events
 */

/**
 * Common message section structure
 */
export interface MessageSection {
  emoji: string;
  header: string;
  repository: string;
  number?: number;
  title?: string;
  user: string;
  metadata?: string[];
  url: string;
}

/**
 * Build a formatted message from sections
 */
export function buildMessage(section: MessageSection): string {
  const parts: string[] = [];

  // Header with emoji
  parts.push(`${section.emoji} **${section.header}**`);

  // Repository line with optional number
  const repoLine = section.number
    ? `**${section.repository}** #${section.number}`
    : `**${section.repository}**`;
  parts.push(repoLine);

  // Title (with empty line before if there's content after repo)
  if (section.title) {
    parts.push("");
    parts.push(`**${section.title}**`);
  }

  // User
  parts.push(`👤 ${section.user}`);

  // Optional metadata
  if (section.metadata) {
    parts.push(...section.metadata);
  }

  // URL
  parts.push(`🔗 ${section.url}`);

  return parts.join("\n");
}

/**
 * Get emoji for PR event based on action and merge status
 */
export function getPrEventEmoji(action: string, merged: boolean): string {
  if (action === "opened") return "🔔";
  if (action === "closed" && merged) return "✅";
  if (action === "closed" && !merged) return "❌";
  if (action === "reopened") return "🔄";
  return "";
}

/**
 * Get header text for PR event based on action and merge status
 */
export function getPrEventHeader(action: string, merged: boolean): string {
  if (action === "opened") return "Pull Request Opened";
  if (action === "closed" && merged) return "Pull Request Merged";
  if (action === "closed" && !merged) return "Pull Request Closed";
  if (action === "reopened") return "Pull Request Reopened";
  return "";
}

/**
 * Get emoji for issue event based on action
 */
export function getIssueEventEmoji(action: string): string {
  if (action === "opened") return "🐛";
  if (action === "closed") return "✅";
  if (action === "reopened") return "🔄";
  return "";
}

/**
 * Get header text for issue event based on action
 */
export function getIssueEventHeader(action: string): string {
  if (action === "opened") return "Issue Opened";
  if (action === "closed") return "Issue Closed";
  if (action === "reopened") return "Issue Reopened";
  return "";
}
