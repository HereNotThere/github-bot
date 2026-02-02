import type { Context } from "hono";

import { escapeHtml } from "../utils/html-escape";

/**
 * Landing page for stats OAuth flow
 */
export function renderStatsConnect(c: Context, startUrl: string) {
  const safeStartUrl = escapeHtml(startUrl);

  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Connect GitHub - Stats Card</title>
        ${renderStyles()}
      </head>
      <body>
        <div class="container">
          <h1>GitHub Stats Card</h1>
          <p>Connect your GitHub account to generate a language stats card for your profile README.</p>
          <a href="${safeStartUrl}" class="btn">Connect GitHub</a>
        </div>
      </body>
    </html>
  `);
}

/**
 * Stats OAuth success page (non-Towns users)
 * Shows embed code for the language card and streak card
 */
export function renderStatsSuccess(c: Context, githubLogin: string) {
  const safeLogin = escapeHtml(githubLogin);
  const publicUrl =
    process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 5123}`;
  const langsUrl = `${publicUrl}/stats/top-langs?username=${safeLogin}`;
  const streakUrl = `${publicUrl}/stats/streak?username=${safeLogin}`;

  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Connected! - GitHub Stats</title>
        ${renderStyles()}
        <style>
          pre {
            background: #1e293b;
            color: #e2e8f0;
            padding: 16px;
            border-radius: 8px;
            font-size: 13px;
            overflow-x: auto;
          }
          .card-section {
            margin: 32px 0;
            padding-top: 24px;
            border-top: 1px solid #e2e8f0;
          }
          .card-section:first-of-type {
            border-top: none;
            padding-top: 0;
          }
          h2 {
            color: #2d3748;
            margin-bottom: 16px;
            font-size: 1.25em;
          }
        </style>
      </head>
      <body>
        <div class="container" style="max-width: 600px;">
          <h1>Connected as @${safeLogin}!</h1>
          <p>Your GitHub stats cards are ready. Add them to your profile README:</p>

          <div class="card-section">
            <h2>🔥 Streak Stats</h2>
            <div style="margin: 16px 0; text-align: center;">
              <img src="${streakUrl}" alt="GitHub Streak" style="max-width: 100%; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);" />
            </div>
            <p><strong>Markdown:</strong></p>
            <pre>![GitHub Streak](${streakUrl})</pre>
            <p style="margin-top: 12px;"><strong>With options:</strong></p>
            <pre>![GitHub Streak](${streakUrl}&amp;theme=dark)</pre>
          </div>

          <div class="card-section">
            <h2>📊 Top Languages</h2>
            <div style="margin: 16px 0; text-align: center;">
              <img src="${langsUrl}" alt="Top Languages" style="max-width: 100%; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);" />
            </div>
            <p><strong>Markdown:</strong></p>
            <pre>![Top Languages](${langsUrl})</pre>
            <p style="margin-top: 12px;"><strong>With options:</strong></p>
            <pre>![Top Languages](${langsUrl}&amp;theme=dark&amp;layout=compact)</pre>
          </div>
        </div>
      </body>
    </html>
  `);
}

/**
 * Error SVG for stats card
 */
export function renderStatsError(c: Context, message: string) {
  const safeMessage = escapeHtml(message);

  const svg = `
    <svg width="300" height="100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#1e293b" rx="8"/>
      <text x="150" y="55" text-anchor="middle" fill="#f87171" font-family="sans-serif" font-size="14">
        ${safeMessage}
      </text>
    </svg>
  `;

  c.header("Content-Type", "image/svg+xml");
  c.header("Cache-Control", "no-cache");
  return c.body(svg);
}

/**
 * Shared styles for stats pages
 */
function renderStyles() {
  return `
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      .container {
        background: white;
        border-radius: 12px;
        padding: 40px;
        max-width: 500px;
        width: 100%;
        text-align: center;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      }
      h1 { color: #1a202c; margin-bottom: 16px; }
      p { color: #4a5568; margin-bottom: 24px; line-height: 1.6; }
      .btn {
        display: inline-block;
        background: #2d3748;
        color: white;
        padding: 14px 28px;
        border-radius: 8px;
        text-decoration: none;
        font-weight: 600;
        transition: background 0.2s;
      }
      .btn:hover { background: #1a202c; }
    </style>
  `;
}
