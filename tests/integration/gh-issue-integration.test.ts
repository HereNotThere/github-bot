import { describe, expect, mock, test } from "bun:test";

import { handleGhIssue } from "../../src/handlers/gh-issue-handler";
import { createMockBotHandler } from "../fixtures/mock-bot-handler";

/**
 * Integration test for gh_issue handler
 * This test makes REAL API calls to GitHub to verify actual behavior
 */
describe("gh_issue handler - Integration", () => {
  test("should fetch real GitHub issue from towns-protocol/towns #4030", async () => {
    const mockHandler = createMockBotHandler();
    const mockOAuthService = {
      getUserOctokit: mock(() => Promise.resolve(null)),
      getAuthorizationUrl: mock(() =>
        Promise.resolve("https://oauth.example.com")
      ),
    } as any;

    await handleGhIssue(
      mockHandler,
      {
        channelId: "test-channel",
        spaceId: "test-space",
        userId: "0x123",
        args: ["towns-protocol/towns", "#4030"],
        eventId: "test-event",
        createdAt: new Date(),
      },
      mockOAuthService
    );

    // Should have sent exactly one message
    expect(mockHandler.sendMessage).toHaveBeenCalledTimes(1);

    const [channelId, message] = mockHandler.sendMessage.mock.calls[0];

    // Verify it's sending to the right channel
    expect(channelId).toBe("test-channel");

    // If we got an error message, log it for debugging
    if (message.startsWith("❌ Error:")) {
      console.error("GitHub API Error:", message);
      console.error("GITHUB_TOKEN set:", !!process.env.GITHUB_TOKEN);
      console.error(
        "GITHUB_TOKEN length:",
        process.env.GITHUB_TOKEN?.length || 0
      );
    }

    // Should contain the actual issue data
    expect(message).toContain("**Issue #4030**");
    expect(message).toContain("**towns-protocol/towns**");
    expect(message).toContain("Bot building documentation"); // Real issue title

    // Should contain the description (truncated to 100 chars)
    expect(message).toContain(
      "Is there any documentation on how to build bots for towns?"
    );

    // Should have formatted fields
    expect(message).toContain("📊 Status:");
    expect(message).toContain("👤 Author:");
    expect(message).toContain("💬 Comments:");
    expect(message).toContain("🔗 https://github.com/towns-protocol/towns");

    // Log the actual message for inspection
    console.log("\n📋 Actual message sent:");
    console.log(message);
  }, 10000); // 10 second timeout for API call

  test("should handle non-existent issue gracefully", async () => {
    const mockHandler = createMockBotHandler();
    const mockOAuthService = {
      getUserOctokit: mock(() => Promise.resolve(null)), // Return null, not error
      getAuthorizationUrl: mock(() =>
        Promise.resolve("https://oauth.example.com")
      ),
    } as any;

    await handleGhIssue(
      mockHandler,
      {
        channelId: "test-channel",
        spaceId: "test-space",
        userId: "0x123",
        args: ["towns-protocol/towns", "#999999"],
        eventId: "test-event",
        createdAt: new Date(),
      },
      mockOAuthService
    );

    // sendEditableOAuthPrompt sends a preliminary message, then edits it
    expect(mockHandler.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockHandler.editMessage).toHaveBeenCalledTimes(1);

    const [, , message] = mockHandler.editMessage.mock.calls[0];

    // Should get OAuth prompt (🔐) since bot token can't access this
    expect(message).toMatch(/🔐/);

    console.log("\n🔐 OAuth prompt for non-existent issue:");
    console.log(message);
  }, 10000);

  test("should handle invalid repository gracefully", async () => {
    const mockHandler = createMockBotHandler();
    const mockOAuthService = {
      getUserOctokit: mock(() => Promise.resolve(null)), // Return null, not error
      getAuthorizationUrl: mock(() =>
        Promise.resolve("https://oauth.example.com")
      ),
    } as any;

    await handleGhIssue(
      mockHandler,
      {
        channelId: "test-channel",
        spaceId: "test-space",
        userId: "0x123",
        args: ["this-repo/does-not-exist-12345", "#1"],
        eventId: "test-event",
        createdAt: new Date(),
      },
      mockOAuthService
    );

    // sendEditableOAuthPrompt sends a preliminary message, then edits it
    expect(mockHandler.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockHandler.editMessage).toHaveBeenCalledTimes(1);

    const [, , message] = mockHandler.editMessage.mock.calls[0];

    // Should get OAuth prompt (🔐) since bot token can't access this
    expect(message).toMatch(/🔐/);

    console.log("\n🔐 OAuth prompt for invalid repo:");
    console.log(message);
  }, 10000);
});
