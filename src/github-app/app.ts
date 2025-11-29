import { App } from "@octokit/app";
import type { Octokit } from "@octokit/core";
import { Webhooks } from "@octokit/webhooks";

/**
 * GitHubApp - Core GitHub App integration
 *
 * Handles GitHub App authentication and webhook processing using Octokit.
 * Octokit internally manages JWT generation and installation token caching.
 */
export class GitHubApp {
  private app: App;
  public webhooks: Webhooks;

  constructor() {
    // GitHub App configuration from environment
    const appId = process.env.GITHUB_APP_ID;
    const privateKeyBase64 = process.env.GITHUB_APP_PRIVATE_KEY_BASE64;
    const clientId = process.env.GITHUB_APP_CLIENT_ID;
    const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

    // Require GitHub App configuration
    if (
      !appId ||
      !privateKeyBase64 ||
      !clientId ||
      !clientSecret ||
      !webhookSecret
    ) {
      throw new Error(
        "GitHub App not configured. Set GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY_BASE64, GITHUB_APP_CLIENT_ID, GITHUB_APP_CLIENT_SECRET, and GITHUB_WEBHOOK_SECRET"
      );
    }

    // Decode base64 private key
    const privateKey = Buffer.from(privateKeyBase64, "base64").toString();

    // Initialize Octokit App
    this.app = new App({
      appId,
      privateKey,
      oauth: { clientId, clientSecret },
    });

    // Initialize Webhooks handler
    this.webhooks = new Webhooks({
      secret: webhookSecret,
    });

    console.log("GitHub App initialized successfully");
  }

  /**
   * Get app-authenticated Octokit instance
   *
   * Uses JWT authentication for app-level operations such as:
   * - Getting installation details
   * - Listing installations
   * - App management endpoints
   *
   * @returns JWT-authenticated Octokit instance
   */
  getAppOctokit(): Octokit {
    return this.app.octokit;
  }

  /**
   * Get OAuth instance for user authentication
   */
  getOAuth() {
    return this.app.oauth;
  }
}
