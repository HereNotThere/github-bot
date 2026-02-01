import type { Context } from "hono";

import { getOwnerIdFromUsername, parseRepo } from "../api/github-client";
import { formatBranchFilter } from "../formatters/subscription-messages";
import {
  generateInstallUrl,
  type InstallationService,
} from "../github-app/installation-service";
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
  bot: TownsBot,
  installationService: InstallationService
) {
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code || !state) {
    return renderError(c, "Missing code or state parameter", 400);
  }

  try {
    // Handle OAuth callback
    const { githubLogin, channelId, spaceId, townsUserId, redirect } =
      await oauthService.handleCallback(code, state);

    // All OAuth flows should have a redirect action
    if (!redirect) {
      throw new Error("OAuth state missing redirect action");
    }

    const { action } = redirect;

    const message = `✅ GitHub account @${githubLogin} connected successfully!`;
    // Check if we should edit an existing message or send a new one
    if (action === "subscribe" && redirect.messageEventId) {
      // Edit the OAuth prompt message to show success
      try {
        await bot.editMessage(channelId, redirect.messageEventId, message);
      } catch (error) {
        // If edit fails (message deleted, etc.), fall back to sending new message
        console.error("Failed to edit OAuth message:", error);
        await bot.sendMessage(channelId, message);
      }
    } else {
      // Send new success message (for fresh OAuth connections or old flow)
      await bot.sendMessage(channelId, message);
    }

    // Handle redirect action
    if (action === "subscribe") {
      const subResult = await subscriptionService.createSubscription({
        townsUserId,
        spaceId, // May be null for DMs
        channelId,
        repoIdentifier: redirect.repo,
        eventTypes: redirect.eventTypes,
        branchFilter: redirect.branchFilter,
      });

      if (subResult.success) {
        await subscriptionService.sendSubscriptionSuccess(
          subResult,
          redirect.eventTypes,
          redirect.branchFilter,
          channelId,
          bot
        );

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
        await bot.sendMessage(channelId, `❌ ${subResult.error}`);

        return renderSuccess(c, {
          action: "subscribe",
          subscriptionResult: subResult,
        });
      }
    }

    // Handle subscription update (add event types to existing subscription)
    if (action === "subscribe-update") {
      const updateResult = await subscriptionService.updateSubscription(
        townsUserId,
        channelId,
        redirect.repo,
        redirect.eventTypes,
        redirect.branchFilter
      );

      if (updateResult.success) {
        const branchInfo = formatBranchFilter(updateResult.branchFilter);
        await bot.sendMessage(
          channelId,
          `✅ **Updated subscription to ${redirect.repo}**\n\n` +
            `Events: **${updateResult.eventTypes.join(", ")}**\n` +
            `Branches: **${branchInfo}**`
        );
      } else {
        await bot.sendMessage(channelId, `❌ ${updateResult.error}`);
      }

      // Show basic success page (user should return to Towns)
      return renderSuccess(c);
    }

    // Handle unsubscribe update (remove event types from existing subscription)
    if (action === "unsubscribe-update") {
      const removeResult = await subscriptionService.removeEventTypes(
        townsUserId,
        channelId,
        redirect.repo,
        redirect.eventTypes
      );

      if (removeResult.success) {
        if (removeResult.deleted) {
          await bot.sendMessage(
            channelId,
            `✅ **Unsubscribed from ${redirect.repo}**`
          );
        } else {
          await bot.sendMessage(
            channelId,
            `✅ **Updated subscription to ${redirect.repo}**\n\n` +
              `Remaining event types: **${removeResult.eventTypes.join(", ")}**`
          );
        }
      } else {
        await bot.sendMessage(channelId, `❌ ${removeResult.error}`);
      }

      return renderSuccess(c);
    }

    // Handle query command redirect (gh_pr, gh_issue)
    // Check if app installation is needed for the repo
    if (action === "query") {
      const installationId = await installationService.isRepoInstalled(
        redirect.repo
      );

      if (!installationId) {
        // App not installed - show installation required page with auto-redirect
        const [owner] = parseRepo(redirect.repo);
        const ownerId = await getOwnerIdFromUsername(owner);
        const installUrl = generateInstallUrl(ownerId);

        return renderSuccess(c, {
          action: "query",
          requiresInstallation: true,
          repoFullName: redirect.repo,
          installUrl,
        });
      }
      // App installed - just show success page, user can run command again
    }

    return renderSuccess(c);
  } catch (error) {
    console.error("OAuth callback error:", error);

    // Return generic error to user, keep details in server logs
    return renderError(c, "Authorization failed. Please try again.", 400);
  }
}
