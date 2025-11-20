import type { BotHandler } from "@towns-protocol/bot";
import type { GitHubOAuthService } from "../services/github-oauth-service";

/**
 * Send OAuth connection prompt to user
 */
export async function sendOAuthPrompt(
  handler: BotHandler,
  channelId: string,
  oauthService: GitHubOAuthService,
  userId: string,
  spaceId: string
): Promise<void> {
  const authUrl = await oauthService.getAuthorizationUrl(
    userId,
    spaceId,
    channelId
  );
  await handler.sendMessage(
    channelId,
    "🔐 **GitHub Account Required**\n\n" +
      "This repository requires authentication.\n\n" +
      `[Connect GitHub Account](${authUrl})\n\n` +
      "Run the command again after connecting."
  );
}
