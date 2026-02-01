import { Octokit } from "@octokit/rest";
// @ts-expect-error - untyped JS module
import { renderTopLanguages } from "github-readme-stats/src/cards/top-languages.js";
import type { Context } from "hono";

import { fetchTopLanguages } from "../api/github-stats";
import type { GitHubOAuthService } from "../services/github-oauth-service";
import { renderStatsConnect, renderStatsError } from "../views/stats-pages";

const PUBLIC_URL =
  process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 5123}`;

/**
 * Landing page for stats OAuth flow
 */
export function handleStatsConnect(c: Context) {
  return renderStatsConnect(c, `${PUBLIC_URL}/stats/connect/start`);
}

/**
 * Start OAuth flow for stats (non-Towns users)
 */
export async function handleStatsOAuthStart(
  c: Context,
  oauthService: GitHubOAuthService
) {
  // For stats-only OAuth, we use placeholder values since there's no Towns context.
  // No race condition: each OAuth flow is isolated by its unique `state` token (the primary key).
  // The placeholder townsUserId is replaced with `stats:${githubUserId}` in handleCallback.
  const authUrl = await oauthService.getAuthorizationUrl(
    "stats-user", // Placeholder - replaced with stats:${githubUserId} after OAuth
    "stats", // Placeholder channel
    undefined, // No space
    { action: "stats" }
  );

  return c.redirect(authUrl);
}

/**
 * Render top languages card
 */
export async function handleTopLanguages(
  c: Context,
  oauthService: GitHubOAuthService
) {
  const username = c.req.query("username");

  if (!username) {
    return renderStatsError(c, "Missing username parameter");
  }

  // Get token for this GitHub user
  const token = await oauthService.getTokenByGithubLogin(username);

  if (!token) {
    // User hasn't connected - redirect to connect page
    return c.redirect(`${PUBLIC_URL}/stats/connect`);
  }

  try {
    // Fetch language data via GraphQL
    const octokit = new Octokit({ auth: token });
    const topLangs = await fetchTopLanguages(octokit, username);

    // Parse query parameters for card options
    const theme = c.req.query("theme");
    const hide = c.req.query("hide");
    const hideTitle = c.req.query("hide_title") === "true";
    const hideBorder = c.req.query("hide_border") === "true";
    const customTitle = c.req.query("custom_title");

    // Validate layout against allowed values
    const allowedLayouts = [
      "normal",
      "compact",
      "donut",
      "donut-vertical",
      "pie",
    ] as const;
    const rawLayout = c.req.query("layout");
    const layout = allowedLayouts.includes(
      rawLayout as (typeof allowedLayouts)[number]
    )
      ? (rawLayout as (typeof allowedLayouts)[number])
      : undefined;

    // Parse and validate numeric params
    const rawLangsCount = c.req.query("langs_count");
    const parsedLangsCount = rawLangsCount
      ? parseInt(rawLangsCount, 10)
      : undefined;
    const langsCount = Number.isFinite(parsedLangsCount)
      ? parsedLangsCount
      : undefined;

    const rawCardWidth = c.req.query("card_width");
    const parsedCardWidth = rawCardWidth
      ? parseInt(rawCardWidth, 10)
      : undefined;
    const cardWidth = Number.isFinite(parsedCardWidth)
      ? parsedCardWidth
      : undefined;

    // Render SVG using github-readme-stats
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const svg = renderTopLanguages(topLangs, {
      theme,
      layout,
      langs_count: langsCount,
      hide: hide ? hide.split(",") : undefined,
      hide_title: hideTitle,
      hide_border: hideBorder,
      card_width: cardWidth,
      custom_title: customTitle,
    }) as string;

    c.header("Content-Type", "image/svg+xml");
    c.header("Cache-Control", "max-age=21600, s-maxage=21600"); // 6 hours
    return c.body(svg);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch languages";
    return renderStatsError(c, message);
  }
}
