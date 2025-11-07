import type { BotHandler } from "@towns-protocol/bot";
import { getPullRequest } from "../api/github-client";
import { stripMarkdown } from "../utils/stripper";

interface GhPrEvent {
  channelId: string;
  args: string[];
}

export async function handleGhPr(
  handler: BotHandler,
  event: GhPrEvent
): Promise<void> {
  const { channelId, args } = event;

  if (args.length < 2) {
    await handler.sendMessage(
      channelId,
      "❌ Usage: `/gh_pr owner/repo #123` or `/gh_pr owner/repo 123`"
    );
    return;
  }

  // Strip markdown formatting from arguments
  const repo = stripMarkdown(args[0]);
  const prNumber = stripMarkdown(args[1]).replace("#", "");

  try {
    const pr = await getPullRequest(repo, prNumber);

    const message =
      `**Pull Request #${pr.number}**\n` +
      `**${repo}**\n\n` +
      `**${pr.title}**\n\n` +
      `📊 Status: ${pr.state === "open" ? "🟢 Open" : pr.merged ? "✅ Merged" : "❌ Closed"}\n` +
      `👤 Author: ${pr.user.login}\n` +
      `📝 Changes: +${pr.additions} -${pr.deletions}\n` +
      `💬 Comments: ${pr.comments}\n` +
      `🔗 ${pr.html_url}`;

    await handler.sendMessage(channelId, message);
  } catch (error: any) {
    await handler.sendMessage(channelId, `❌ Error: ${error.message}`);
  }
}
