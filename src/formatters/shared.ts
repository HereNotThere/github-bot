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
