import type { BotHandler } from "@towns-protocol/bot";
import { getIssue } from "../api/github-client";
import { stripMarkdown } from "../utils/stripper";

interface GhIssueEvent {
  channelId: string;
  args: string[];
}

export async function handleGhIssue(
  handler: BotHandler,
  event: GhIssueEvent,
): Promise<void> {
  const { channelId, args } = event;

  if (args.length < 2) {
    await handler.sendMessage(
      channelId,
      "❌ Usage: `/gh_issue owner/repo #123` or `/gh_issue owner/repo 123`",
    );
    return;
  }

  // Strip markdown formatting from arguments
  const repo = stripMarkdown(args[0]);
  const issueNumber = stripMarkdown(args[1]).replace("#", "");

  try {
    const issue = await getIssue(repo, issueNumber);

    const labels = issue.labels.map((l: any) => l.name).join(", ");

    const message =
      `**Issue #${issue.number}**\n` +
      `**${repo}**\n\n` +
      `**${issue.title}**\n\n` +
      `📊 Status: ${issue.state === "open" ? "🟢 Open" : "✅ Closed"}\n` +
      `👤 Author: ${issue.user.login}\n` +
      `💬 Comments: ${issue.comments}\n` +
      (labels ? `🏷️ Labels: ${labels}\n` : "") +
      `🔗 ${issue.html_url}`;

    await handler.sendMessage(channelId, message);
  } catch (error: any) {
    await handler.sendMessage(channelId, `❌ Error: ${error.message}`);
  }
}
