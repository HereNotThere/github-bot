import type { Context } from "hono";

import { DEFAULT_EVENT_TYPES } from "../constants";
import type { GitHubOAuthService } from "../services/github-oauth-service";
import type { SubscriptionService } from "../services/subscription-service";
import type { TownsBot } from "../types/bot";
import { renderError, renderSuccess } from "../views/oauth-pages";

/**
 * OAuth callback route handler
 *
 * Handles the GitHub OAuth callback after user authorizes the app.
 * Exchanges the authorization code for an access token and stores it.
 * If the user was redirected from a subscription attempt, completes the subscription.
 */
export async function handleOAuthCallback(
  c: Context,
  oauthService: GitHubOAuthService,
  subscriptionService: SubscriptionService,
  bot: TownsBot
) {
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code || !state) {
    return renderError(c, "Missing code or state parameter", 400);
  }

  try {
    // Handle OAuth callback
    const result = await oauthService.handleCallback(code, state);

    // Send success message to the channel
    await bot.sendMessage(
      result.channelId,
      `✅ GitHub account @${result.githubLogin} connected successfully!`
    );

    // If there was a redirect action (e.g., subscribe), complete the subscription
    if (result.redirectAction === "subscribe" && result.redirectData) {
      if (result.redirectData.repo && result.spaceId && result.townsUserId) {
        // Attempt subscription now that OAuth is complete
        const subResult = await subscriptionService.createSubscription({
          townsUserId: result.townsUserId,
          spaceId: result.spaceId,
          channelId: result.channelId,
          repoIdentifier: result.redirectData.repo,
          eventTypes: result.redirectData.eventTypes || DEFAULT_EVENT_TYPES,
        });

        if (subResult.success) {
          // Success - notify in Towns
          const deliveryInfo =
            subResult.deliveryMode === "webhook"
              ? "⚡ Real-time webhook delivery enabled!"
              : `⏱️ Events checked every 5 minutes\n\n💡 Install the GitHub App for real-time delivery:\n[Install](<${subResult.installUrl}>)`;

          const { eventId } = await bot.sendMessage(
            result.channelId,
            `✅ **Subscribed to [${subResult.repoFullName}](https://github.com/${subResult.repoFullName})**\n\n${deliveryInfo}`
          );

          // Track polling messages for potential upgrade to webhook
          if (subResult.deliveryMode === "polling" && eventId) {
            subscriptionService.registerPendingMessage(
              result.channelId,
              subResult.repoFullName,
              eventId
            );
          }

          // Return success page with subscription data
          return renderSuccess(c, {
            action: "subscribe",
            subscriptionResult: subResult,
          });
        } else if (!subResult.success && subResult.requiresInstallation) {
          // Private repo - show installation page (no Towns message)
          return renderSuccess(c, {
            action: "subscribe",
            subscriptionResult: subResult,
          });
        } else {
          // Other error - notify in Towns
          await bot.sendMessage(result.channelId, `❌ ${subResult.error}`);

          return renderSuccess(c, {
            action: "subscribe",
            subscriptionResult: subResult,
          });
        }
      }
    }

    return renderSuccess(c);
  } catch (error) {
    console.error("OAuth callback error:", error);

    // Return generic error to user, keep details in server logs
    return renderError(c, "Authorization failed. Please try again.", 400);
  }
}
