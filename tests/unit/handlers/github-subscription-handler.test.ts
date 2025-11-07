import { describe, expect, test, beforeEach, spyOn } from "bun:test";
import {
  handleGithubSubscription,
  type SubscriptionStorage,
} from "../../../src/handlers/github-subscription-handler";
import { createMockBotHandler } from "../../fixtures/mock-bot-handler";
import * as githubClient from "../../../src/api/github-client";

describe("github subscription handler", () => {
  let mockHandler: ReturnType<typeof createMockBotHandler>;
  let storage: SubscriptionStorage;

  beforeEach(() => {
    mockHandler = createMockBotHandler();
    mockHandler.sendMessage.mockClear();

    // Fresh storage for each test
    storage = {
      channelToRepos: new Map(),
      repoToChannels: new Map(),
    };
  });

  describe("general", () => {
    test("should send usage message when no action provided", async () => {
      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "test-channel",
          args: [],
        },
        storage
      );

      expect(mockHandler.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockHandler.sendMessage).toHaveBeenCalledWith(
        "test-channel",
        "**Usage:**\n" +
          "• `/github subscribe owner/repo`\n" +
          "• `/github unsubscribe owner/repo`\n" +
          "• `/github status`"
      );
    });

    test("should send error for unknown action", async () => {
      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "test-channel",
          args: ["unknown"],
        },
        storage
      );

      expect(mockHandler.sendMessage).toHaveBeenCalledTimes(1);
      const message = mockHandler.sendMessage.mock.calls[0][1];
      expect(message).toContain("❌ Unknown action: `unknown`");
      expect(message).toContain("**Available actions:**");
      expect(message).toContain("• `subscribe`");
      expect(message).toContain("• `unsubscribe`");
      expect(message).toContain("• `status`");
    });

    test("should handle case-insensitive actions - subscribe", async () => {
      const validateRepoSpy = spyOn(
        githubClient,
        "validateRepo"
      ).mockResolvedValue(true);

      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "test-channel",
          args: ["SUBSCRIBE", "owner/repo"],
        },
        storage
      );

      expect(validateRepoSpy).toHaveBeenCalledWith("owner/repo");
      expect(mockHandler.sendMessage).toHaveBeenCalledTimes(1);
      const message = mockHandler.sendMessage.mock.calls[0][1];
      expect(message).toContain(
        "✅ **Subscription registered for owner/repo**"
      );

      validateRepoSpy.mockRestore();
    });

    test("should handle case-insensitive actions - unsubscribe", async () => {
      // Set up a subscription first
      storage.channelToRepos.set("test-channel", new Set(["owner/repo"]));
      storage.repoToChannels.set("owner/repo", new Set(["test-channel"]));

      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "test-channel",
          args: ["UNSUBSCRIBE", "owner/repo"],
        },
        storage
      );

      expect(mockHandler.sendMessage).toHaveBeenCalledWith(
        "test-channel",
        "✅ **Unsubscribed from owner/repo**"
      );
    });

    test("should handle case-insensitive actions - status", async () => {
      // Set up a subscription first
      storage.channelToRepos.set("test-channel", new Set(["owner/repo"]));

      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "test-channel",
          args: ["STATUS"],
        },
        storage
      );

      const message = mockHandler.sendMessage.mock.calls[0][1];
      expect(message).toContain("📬 **Subscribed Repositories:**");
      expect(message).toContain("• owner/repo");
    });
  });

  describe("subscribe action", () => {
    test("should send error for missing repo argument", async () => {
      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "test-channel",
          args: ["subscribe"],
        },
        storage
      );

      expect(mockHandler.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockHandler.sendMessage).toHaveBeenCalledWith(
        "test-channel",
        "❌ Usage: `/github subscribe owner/repo`"
      );
    });

    test("should send error for invalid repo format (no slash)", async () => {
      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "test-channel",
          args: ["subscribe", "invalidrepo"],
        },
        storage
      );

      expect(mockHandler.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockHandler.sendMessage).toHaveBeenCalledWith(
        "test-channel",
        "❌ Invalid format. Use: `owner/repo` (e.g., `facebook/react`)"
      );
    });

    test("should send error for invalid repo format (multiple slashes)", async () => {
      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "test-channel",
          args: ["subscribe", "owner/repo/extra"],
        },
        storage
      );

      expect(mockHandler.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockHandler.sendMessage).toHaveBeenCalledWith(
        "test-channel",
        "❌ Invalid format. Use: `owner/repo` (e.g., `facebook/react`)"
      );
    });

    test("should send error when repo doesn't exist (validateRepo fails)", async () => {
      const validateRepoSpy = spyOn(
        githubClient,
        "validateRepo"
      ).mockResolvedValue(false);

      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "test-channel",
          args: ["subscribe", "owner/nonexistent"],
        },
        storage
      );

      expect(validateRepoSpy).toHaveBeenCalledWith("owner/nonexistent");
      expect(mockHandler.sendMessage).toHaveBeenCalledWith(
        "test-channel",
        "❌ Repository **owner/nonexistent** not found or is not public"
      );

      validateRepoSpy.mockRestore();
    });

    test("should successfully subscribe to valid repo", async () => {
      const validateRepoSpy = spyOn(
        githubClient,
        "validateRepo"
      ).mockResolvedValue(true);

      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "test-channel",
          args: ["subscribe", "facebook/react"],
        },
        storage
      );

      expect(validateRepoSpy).toHaveBeenCalledWith("facebook/react");
      expect(mockHandler.sendMessage).toHaveBeenCalledTimes(1);

      const message = mockHandler.sendMessage.mock.calls[0][1];
      expect(message).toContain(
        "✅ **Subscription registered for facebook/react**"
      );

      validateRepoSpy.mockRestore();
    });

    test("should add repo to both channelToRepos and repoToChannels", async () => {
      const validateRepoSpy = spyOn(
        githubClient,
        "validateRepo"
      ).mockResolvedValue(true);

      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "test-channel",
          args: ["subscribe", "owner/repo"],
        },
        storage
      );

      // Check channelToRepos
      expect(storage.channelToRepos.has("test-channel")).toBe(true);
      expect(
        storage.channelToRepos.get("test-channel")?.has("owner/repo")
      ).toBe(true);

      // Check repoToChannels
      expect(storage.repoToChannels.has("owner/repo")).toBe(true);
      expect(
        storage.repoToChannels.get("owner/repo")?.has("test-channel")
      ).toBe(true);

      validateRepoSpy.mockRestore();
    });

    test("should handle multiple subscriptions to same repo", async () => {
      const validateRepoSpy = spyOn(
        githubClient,
        "validateRepo"
      ).mockResolvedValue(true);

      // Subscribe from first channel
      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "channel-1",
          args: ["subscribe", "owner/repo"],
        },
        storage
      );

      // Subscribe from second channel
      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "channel-2",
          args: ["subscribe", "owner/repo"],
        },
        storage
      );

      // Both channels should be subscribed
      expect(storage.channelToRepos.get("channel-1")?.has("owner/repo")).toBe(
        true
      );
      expect(storage.channelToRepos.get("channel-2")?.has("owner/repo")).toBe(
        true
      );

      // Repo should have both channels
      const channels = storage.repoToChannels.get("owner/repo");
      expect(channels?.has("channel-1")).toBe(true);
      expect(channels?.has("channel-2")).toBe(true);
      expect(channels?.size).toBe(2);

      validateRepoSpy.mockRestore();
    });

    test("should strip markdown from repo name", async () => {
      const validateRepoSpy = spyOn(
        githubClient,
        "validateRepo"
      ).mockResolvedValue(true);

      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "test-channel",
          args: ["subscribe", "**owner/repo**"],
        },
        storage
      );

      // Should call validateRepo with stripped name
      expect(validateRepoSpy).toHaveBeenCalledWith("owner/repo");

      // Should store stripped name
      expect(
        storage.channelToRepos.get("test-channel")?.has("owner/repo")
      ).toBe(true);

      validateRepoSpy.mockRestore();
    });

    test("should strip various markdown formats from repo name", async () => {
      const validateRepoSpy = spyOn(
        githubClient,
        "validateRepo"
      ).mockResolvedValue(true);

      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "test-channel",
          args: ["subscribe", "`owner/repo`"],
        },
        storage
      );

      expect(validateRepoSpy).toHaveBeenCalledWith("owner/repo");

      validateRepoSpy.mockRestore();
    });

    test("should include feature incomplete notice in response", async () => {
      const validateRepoSpy = spyOn(
        githubClient,
        "validateRepo"
      ).mockResolvedValue(true);

      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "test-channel",
          args: ["subscribe", "owner/repo"],
        },
        storage
      );

      const message = mockHandler.sendMessage.mock.calls[0][1];
      expect(message).toContain(
        "✅ **Subscription registered for owner/repo**"
      );
      expect(message).toContain("⚠️ **Feature Incomplete**");
      expect(message).toContain(
        "Automatic webhook creation requires GitHub App or OAuth integration"
      );

      validateRepoSpy.mockRestore();
    });

    test("should allow multiple repos per channel", async () => {
      const validateRepoSpy = spyOn(
        githubClient,
        "validateRepo"
      ).mockResolvedValue(true);

      // Subscribe to first repo
      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "test-channel",
          args: ["subscribe", "owner/repo1"],
        },
        storage
      );

      // Subscribe to second repo
      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "test-channel",
          args: ["subscribe", "owner/repo2"],
        },
        storage
      );

      const repos = storage.channelToRepos.get("test-channel");
      expect(repos?.size).toBe(2);
      expect(repos?.has("owner/repo1")).toBe(true);
      expect(repos?.has("owner/repo2")).toBe(true);

      validateRepoSpy.mockRestore();
    });
  });

  describe("unsubscribe action", () => {
    test("should send error for missing repo argument", async () => {
      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "test-channel",
          args: ["unsubscribe"],
        },
        storage
      );

      expect(mockHandler.sendMessage).toHaveBeenCalledWith(
        "test-channel",
        "❌ Usage: `/github unsubscribe owner/repo`"
      );
    });

    test("should send error for invalid repo format (no slash)", async () => {
      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "test-channel",
          args: ["unsubscribe", "invalidrepo"],
        },
        storage
      );

      expect(mockHandler.sendMessage).toHaveBeenCalledWith(
        "test-channel",
        "❌ Invalid format. Use: `owner/repo` (e.g., `facebook/react`)"
      );
    });

    test("should send error for invalid repo format (multiple slashes)", async () => {
      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "test-channel",
          args: ["unsubscribe", "owner/repo/extra"],
        },
        storage
      );

      expect(mockHandler.sendMessage).toHaveBeenCalledWith(
        "test-channel",
        "❌ Invalid format. Use: `owner/repo` (e.g., `facebook/react`)"
      );
    });

    test("should send error when channel has no subscriptions", async () => {
      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "test-channel",
          args: ["unsubscribe", "owner/repo"],
        },
        storage
      );

      expect(mockHandler.sendMessage).toHaveBeenCalledWith(
        "test-channel",
        "❌ This channel has no subscriptions"
      );
    });

    test("should send error when not subscribed to specified repo", async () => {
      // Set up subscription to a different repo
      storage.channelToRepos.set("test-channel", new Set(["owner/other"]));
      storage.repoToChannels.set("owner/other", new Set(["test-channel"]));

      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "test-channel",
          args: ["unsubscribe", "owner/repo"],
        },
        storage
      );

      const message = mockHandler.sendMessage.mock.calls[0][1];
      expect(message).toContain("❌ Not subscribed to **owner/repo**");
      expect(message).toContain(
        "Use `/github status` to see your subscriptions"
      );
    });

    test("should successfully unsubscribe from specific repo", async () => {
      // Set up subscriptions
      storage.channelToRepos.set("test-channel", new Set(["owner/repo"]));
      storage.repoToChannels.set("owner/repo", new Set(["test-channel"]));

      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "test-channel",
          args: ["unsubscribe", "owner/repo"],
        },
        storage
      );

      expect(mockHandler.sendMessage).toHaveBeenCalledWith(
        "test-channel",
        "✅ **Unsubscribed from owner/repo**"
      );

      // Channel should be removed when it has no more subscriptions
      expect(storage.channelToRepos.has("test-channel")).toBe(false);
    });

    test("should remove channel from repoToChannels mapping", async () => {
      // Set up subscriptions with multiple channels
      storage.channelToRepos.set("test-channel", new Set(["owner/repo"]));
      storage.channelToRepos.set("other-channel", new Set(["owner/repo"]));
      storage.repoToChannels.set(
        "owner/repo",
        new Set(["test-channel", "other-channel"])
      );

      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "test-channel",
          args: ["unsubscribe", "owner/repo"],
        },
        storage
      );

      // Check that test-channel is removed but other-channel remains
      const channels = storage.repoToChannels.get("owner/repo");
      expect(channels?.has("test-channel")).toBe(false);
      expect(channels?.has("other-channel")).toBe(true);
    });

    test("should clean up empty repo entries in repoToChannels", async () => {
      // Set up subscription with only one channel
      storage.channelToRepos.set("test-channel", new Set(["owner/repo"]));
      storage.repoToChannels.set("owner/repo", new Set(["test-channel"]));

      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "test-channel",
          args: ["unsubscribe", "owner/repo"],
        },
        storage
      );

      // Repo entry should be completely removed
      expect(storage.repoToChannels.has("owner/repo")).toBe(false);
    });

    test("should preserve other channels' subscriptions", async () => {
      // Set up multiple channels subscribed to same repo
      storage.channelToRepos.set("channel-1", new Set(["owner/repo"]));
      storage.channelToRepos.set("channel-2", new Set(["owner/repo"]));
      storage.repoToChannels.set(
        "owner/repo",
        new Set(["channel-1", "channel-2"])
      );

      // Unsubscribe channel-1
      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "channel-1",
          args: ["unsubscribe", "owner/repo"],
        },
        storage
      );

      // channel-1 should be unsubscribed
      expect(storage.channelToRepos.has("channel-1")).toBe(false);

      // channel-2 should still be subscribed
      expect(storage.channelToRepos.has("channel-2")).toBe(true);

      // Repo should only have channel-2
      const channels = storage.repoToChannels.get("owner/repo");
      expect(channels?.has("channel-1")).toBe(false);
      expect(channels?.has("channel-2")).toBe(true);
      expect(channels?.size).toBe(1);
    });

    test("should preserve other repos when unsubscribing from one", async () => {
      // Set up multiple subscriptions for same channel
      storage.channelToRepos.set(
        "test-channel",
        new Set(["owner/repo1", "owner/repo2"])
      );
      storage.repoToChannels.set("owner/repo1", new Set(["test-channel"]));
      storage.repoToChannels.set("owner/repo2", new Set(["test-channel"]));

      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "test-channel",
          args: ["unsubscribe", "owner/repo1"],
        },
        storage
      );

      // repo1 should be removed but repo2 should remain
      expect(storage.repoToChannels.has("owner/repo1")).toBe(false);
      expect(storage.repoToChannels.has("owner/repo2")).toBe(true);

      // Channel should still exist with repo2
      const channelRepos = storage.channelToRepos.get("test-channel");
      expect(channelRepos?.has("owner/repo1")).toBe(false);
      expect(channelRepos?.has("owner/repo2")).toBe(true);
      expect(channelRepos?.size).toBe(1);
    });

    test("should strip markdown from repo name", async () => {
      // Set up subscription
      storage.channelToRepos.set("test-channel", new Set(["owner/repo"]));
      storage.repoToChannels.set("owner/repo", new Set(["test-channel"]));

      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "test-channel",
          args: ["unsubscribe", "**owner/repo**"],
        },
        storage
      );

      expect(mockHandler.sendMessage).toHaveBeenCalledWith(
        "test-channel",
        "✅ **Unsubscribed from owner/repo**"
      );

      // Should have removed the subscription
      expect(storage.channelToRepos.has("test-channel")).toBe(false);
      expect(storage.repoToChannels.has("owner/repo")).toBe(false);
    });
  });

  describe("status action", () => {
    test("should show 'No subscriptions' when channel has no repos", async () => {
      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "test-channel",
          args: ["status"],
        },
        storage
      );

      expect(mockHandler.sendMessage).toHaveBeenCalledWith(
        "test-channel",
        "📭 **No subscriptions**\n\nUse `/github subscribe owner/repo` to get started"
      );
    });

    test("should list all subscribed repos", async () => {
      // Set up subscription
      storage.channelToRepos.set("test-channel", new Set(["facebook/react"]));

      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "test-channel",
          args: ["status"],
        },
        storage
      );

      const message = mockHandler.sendMessage.mock.calls[0][1];
      expect(message).toContain("📬 **Subscribed Repositories:**");
      expect(message).toContain("• facebook/react");
    });

    test("should format multiple repos correctly", async () => {
      // Set up multiple subscriptions
      storage.channelToRepos.set(
        "test-channel",
        new Set(["facebook/react", "microsoft/vscode", "vercel/next.js"])
      );

      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "test-channel",
          args: ["status"],
        },
        storage
      );

      const message = mockHandler.sendMessage.mock.calls[0][1];
      expect(message).toContain("📬 **Subscribed Repositories:**");
      expect(message).toContain("• facebook/react");
      expect(message).toContain("• microsoft/vscode");
      expect(message).toContain("• vercel/next.js");
    });

    test("should only show repos for the requesting channel", async () => {
      // Set up subscriptions for multiple channels
      storage.channelToRepos.set("channel-1", new Set(["owner/repo1"]));
      storage.channelToRepos.set("channel-2", new Set(["owner/repo2"]));

      await handleGithubSubscription(
        mockHandler,
        {
          channelId: "channel-1",
          args: ["status"],
        },
        storage
      );

      const message = mockHandler.sendMessage.mock.calls[0][1];
      expect(message).toContain("• owner/repo1");
      expect(message).not.toContain("• owner/repo2");
    });
  });
});
