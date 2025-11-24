import type { BotHandler } from "@towns-protocol/bot";

import type {
  GitHubOAuthService,
  SubscriptionRedirectData,
} from "../services/github-oauth-service";

/**
 * Send OAuth connection prompt to user
 */
export async function sendOAuthPrompt(
  oauthService: GitHubOAuthService,
  handler: BotHandler,
  userId: string,
  channelId: string,
  spaceId: string
): Promise<void> {
  try {
    const authUrl = await oauthService.getAuthorizationUrl(
      userId,
      channelId,
      spaceId
    );
    await handler.sendMessage(
      channelId,
      "🔐 **GitHub Account Required**\n\n" +
        "This repository requires authentication.\n\n" +
        `[Connect GitHub Account](${authUrl})\n\n` +
        "Run the command again after connecting."
    );
  } catch (error) {
    console.error("Failed to send OAuth prompt:", {
      userId,
      spaceId,
      channelId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Send editable OAuth prompt using two-phase pattern
 * 1. Sends initial "Checking..." message and captures eventId
 * 2. Generates OAuth URL with eventId in redirectData
 * 3. Edits message to show OAuth prompt with URL placeholder replaced
 * @param oauthService - OAuth service for generating auth URL
 * @param handler - Bot handler for sending messages
 * @param userId - Towns user ID
 * @param channelId - Channel to send message to
 * @param spaceId - Space ID
 * @param message - Message to display, with `\{authUrl\}` as placeholder
 * @param redirectAction - Optional action to perform after OAuth
 * @param redirectData - Optional data for redirect action
 * @returns The eventId of the message for potential further edits
 */
export async function sendEditableOAuthPrompt(
  oauthService: GitHubOAuthService,
  handler: BotHandler,
  userId: string,
  channelId: string,
  spaceId: string,
  message: string,
  redirectAction?: string,
  redirectData?: Omit<SubscriptionRedirectData, "messageEventId">
): Promise<string | null> {
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
      } as SubscriptionRedirectData
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
