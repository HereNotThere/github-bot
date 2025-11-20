import type { Context } from "hono";
import type { GitHubOAuthService } from "../services/github-oauth-service";
import type { TownsBot } from "../types/bot";
import { escapeHtml } from "../utils/html-escape";

/**
 * OAuth callback route handler
 *
 * Handles the GitHub OAuth callback after user authorizes the app.
 * Exchanges the authorization code for an access token and stores it.
 */
export async function handleOAuthCallback(
  c: Context,
  oauthService: GitHubOAuthService,
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

    // If there was a redirect action (e.g., subscribe), notify user
    if (result.redirectAction === "subscribe" && result.redirectData) {
      const data = result.redirectData as { repo?: string };
      if (data.repo) {
        await bot.sendMessage(
          result.channelId,
          `You can now run \`/github subscribe ${data.repo}\``
        );
      }
    }

    return renderSuccess(c);
  } catch (error) {
    console.error("OAuth callback error:", error);

    // Return generic error to user, keep details in server logs
    return renderError(c, "Authorization failed. Please try again.", 400);
  }
}

/**
 * Render success page after OAuth completion
 */
function renderSuccess(c: Context) {
  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>GitHub Connected</title>
      </head>
      <body>
        <h1>Success!</h1>
        <p>Your GitHub account has been connected.</p>
        <p>You can close this window and return to Towns.</p>
      </body>
    </html>
  `);
}

/**
 * Render error page with HTML-escaped message
 */
function renderError(c: Context, message: string, status: number) {
  const safeMessage = escapeHtml(message);

  return c.html(
    `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>OAuth Error</title>
      </head>
      <body>
        <h1>OAuth Error</h1>
        <p>${safeMessage}</p>
      </body>
    </html>
    `,
    status as any
  );
}
