import type { BotHandler } from "@towns-protocol/bot";

import type { GitHubOAuthService } from "../services/github-oauth-service";
import type { RedirectAction, RedirectData } from "../types/oauth";

/**
 * Send OAuth prompt for query commands (gh_pr, gh_issue)
 * Uses two-phase pattern: sends "Checking..." message, then edits with OAuth URL
 *
 * @returns eventId of the sent message, or null if sending failed.
 *          Callers should handle null gracefully (message was not sent).
 */
export async function sendQueryOAuthPrompt(
  oauthService: GitHubOAuthService,
  handler: BotHandler,
  userId: string,
  channelId: string,
  spaceId: string,
  repo: string
): Promise<string | null> {
  return sendEditableOAuthPrompt(
    oauthService,
    handler,
    userId,
    channelId,
    spaceId,
    "🔐 **GitHub Account Required**\n\n" +
      "This repository requires authentication.\n\n" +
      "[Connect GitHub Account]({authUrl})\n\n" +
      "Run the command again after connecting.",
    "query",
    { repo }
  );
}

/**
 * Send editable OAuth prompt using two-phase pattern:
 * 1. Sends initial "Checking..." message and captures eventId
 * 2. Generates OAuth URL with eventId in redirectData
 * 3. Edits message to show OAuth prompt with URL placeholder replaced
 *
 * @param oauthService - OAuth service for generating auth URL
 * @param handler - Bot handler for sending messages
 * @param userId - Towns user ID
 * @param channelId - Channel to send message to
 * @param spaceId - Space ID
 * @param message - Message to display, with `{authUrl}` as placeholder
 * @param redirectAction - Action to perform after OAuth completion
 * @param redirectData - Data for redirect action (must include repo)
 * @returns eventId of the sent message, or null if validation/sending failed.
 *          Callers should handle null gracefully - it means no message was
 *          successfully sent/edited and the user was not prompted.
 */
export async function sendEditableOAuthPrompt(
  oauthService: GitHubOAuthService,
  handler: BotHandler,
  userId: string,
  channelId: string,
  spaceId: string,
  message: string,
  redirectAction: RedirectAction,
  redirectData: Omit<RedirectData, "messageEventId">
): Promise<string | null> {
  // Validate placeholder exists
  if (!message.includes("{authUrl}")) {
    console.error(
      "sendEditableOAuthPrompt: message must contain {authUrl} placeholder"
    );
    return null;
  }

  try {
    // Phase 1: Send initial checking message and capture eventId
    const { eventId } = await handler.sendMessage(
      channelId,
      "🔄 Checking GitHub authentication..."
    );

    // Phase 2: Generate OAuth URL with eventId included in redirectData
    const authUrl = await oauthService.getAuthorizationUrl(
      userId,
      channelId,
      spaceId,
      redirectAction,
      {
        ...redirectData,
        messageEventId: eventId,
      }
    );

    // Phase 3: Edit message with OAuth URL replacing placeholder
    const finalMessage = message.replace(/{authUrl}/g, authUrl);

    await handler.editMessage(channelId, eventId, finalMessage);

    return eventId;
  } catch (error) {
    console.error("Failed to send editable OAuth prompt:", {
      userId,
      spaceId,
      channelId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
