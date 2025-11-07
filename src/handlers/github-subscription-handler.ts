import type { BotHandler } from "@towns-protocol/bot";
import { validateRepo } from "../api/github-client";
import { stripMarkdown } from "../utils/stripper";

interface GithubSubscriptionEvent {
  channelId: string;
  args: string[];
}

export interface SubscriptionStorage {
  channelToRepos: Map<string, Set<string>>;
  repoToChannels: Map<string, Set<string>>;
}

export async function handleGithubSubscription(
  handler: BotHandler,
  event: GithubSubscriptionEvent,
  storage: SubscriptionStorage
): Promise<void> {
  const { channelId, args } = event;
  const [action, repoArg] = args;

  if (!action) {
    await handler.sendMessage(
      channelId,
      "**Usage:**\n" +
        "• `/github subscribe owner/repo`\n" +
        "• `/github unsubscribe`\n" +
        "• `/github status`"
    );
    return;
  }

  switch (action.toLowerCase()) {
    case "subscribe": {
      if (!repoArg) {
        await handler.sendMessage(
          channelId,
          "❌ Usage: `/github subscribe owner/repo`"
        );
        return;
      }

      // Strip markdown formatting from repo name
      const repo = stripMarkdown(repoArg);

      // Validate repo format
      if (!repo.includes("/") || repo.split("/").length !== 2) {
        await handler.sendMessage(
          channelId,
          "❌ Invalid format. Use: `owner/repo` (e.g., `facebook/react`)"
        );
        return;
      }

      // Validate repo exists
      const isValid = await validateRepo(repo);
      if (!isValid) {
        await handler.sendMessage(
          channelId,
          `❌ Repository **${repo}** not found or is not public`
        );
        return;
      }

      // Store subscription
      if (!storage.channelToRepos.has(channelId)) {
        storage.channelToRepos.set(channelId, new Set());
      }
      storage.channelToRepos.get(channelId)!.add(repo);

      if (!storage.repoToChannels.has(repo)) {
        storage.repoToChannels.set(repo, new Set());
      }
      storage.repoToChannels.get(repo)!.add(channelId);

      await handler.sendMessage(
        channelId,
        `✅ **Subscription registered for ${repo}**\n\n` +
          `⚠️ **Feature Incomplete**\n` +
          `Automatic webhook creation requires GitHub App or OAuth integration. This feature currently only stores your subscription preference.\n\n` +
          `💡 **Want automatic subscriptions?** Tip to fund GitHub App development! 🤑`
      );
      break;
    }

    case "unsubscribe": {
      const repos = storage.channelToRepos.get(channelId);
      if (!repos || repos.size === 0) {
        await handler.sendMessage(
          channelId,
          "❌ This channel has no subscriptions"
        );
        return;
      }

      // Remove from reverse mapping
      for (const repoName of repos) {
        const channels = storage.repoToChannels.get(repoName);
        if (channels) {
          channels.delete(channelId);
          if (channels.size === 0) {
            storage.repoToChannels.delete(repoName);
          }
        }
      }

      // Remove channel subscriptions
      storage.channelToRepos.delete(channelId);

      await handler.sendMessage(
        channelId,
        "✅ Unsubscribed from all repositories"
      );
      break;
    }

    case "status": {
      const repos = storage.channelToRepos.get(channelId);
      if (!repos || repos.size === 0) {
        await handler.sendMessage(
          channelId,
          "📭 **No subscriptions**\n\nUse `/github subscribe owner/repo` to get started"
        );
        return;
      }

      const repoList = Array.from(repos)
        .map(r => `• ${r}`)
        .join("\n");

      await handler.sendMessage(
        channelId,
        `📬 **Subscribed Repositories:**\n\n${repoList}`
      );
      break;
    }

    default:
      await handler.sendMessage(
        channelId,
        `❌ Unknown action: \`${action}\`\n\n` +
          "**Available actions:**\n" +
          "• `subscribe`\n" +
          "• `unsubscribe`\n" +
          "• `status`"
      );
  }
}
