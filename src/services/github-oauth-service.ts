import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

import { Octokit } from "@octokit/rest";
import { eq, lt } from "drizzle-orm";

import {
  OAUTH_STATE_CLEANUP_INTERVAL_MS,
  OAUTH_TOKEN_REFRESH_BUFFER_MS,
} from "../constants";
import { db } from "../db";
import { githubUserTokens, oauthStates } from "../db/schema";
import { GitHubApp } from "../github-app/app";
import { OAuthRedirectSchema, type OAuthRedirect } from "../types/oauth";

/**
 * Result returned from handleCallback after OAuth completion
 */
export interface OAuthCallbackResult {
  townsUserId: string;
  channelId: string;
  spaceId: string | undefined; // Undefined for DM channels
  redirect: OAuthRedirect;
  githubLogin: string;
}

/**
 * Token validation status result
 */
export enum TokenStatus {
  NotLinked = "not-linked",
  Invalid = "invalid",
  Valid = "valid",
  Unknown = "unknown",
}

/**
 * GitHubOAuthService - Manages GitHub App user authentication for Towns users
 *
 * GitHub App User Access Token:
 * - Identifies the GitHub user
 * - Validates user's repository access
 * - Permissions inherited from GitHub App installation (not OAuth scopes)
 * - Does NOT read repository contents or receive webhook events
 *
 * GitHub App Installation Token:
 * - Reads repository contents and metadata
 * - Receives webhook events for subscribed repositories
 * - Handles private repository event delivery
 *
 * Uses Octokit app's built-in OAuth support (app.oauth) to:
 * - Generate authorization URLs
 * - Exchange codes for user access tokens
 * - Get user-authenticated Octokit instances
 *
 * Tokens are encrypted at rest using AES-256-GCM derived from JWT_SECRET.
 */
export class GitHubOAuthService {
  private githubApp: GitHubApp;
  private readonly redirectUrl: string;
  private readonly encryptionKey: Buffer;
  /** In-flight refresh promises to prevent concurrent refresh race conditions */
  private refreshPromises = new Map<string, Promise<string | null>>();

  constructor(githubApp: GitHubApp) {
    this.githubApp = githubApp;

    // Validate redirect URL configuration
    const oauthRedirectUrl = process.env.OAUTH_REDIRECT_URL;
    const publicUrl = process.env.PUBLIC_URL;

    if (oauthRedirectUrl) {
      this.redirectUrl = oauthRedirectUrl;
    } else if (publicUrl) {
      this.redirectUrl = `${publicUrl}/oauth/callback`;
    } else {
      throw new Error(
        "OAUTH_REDIRECT_URL or PUBLIC_URL must be configured for OAuth callbacks"
      );
    }

    // Derive 32-byte encryption key from JWT_SECRET using SHA-256
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error("JWT_SECRET not configured");
    }
    this.encryptionKey = createHash("sha256").update(jwtSecret).digest();
  }

  /**
   * Generate OAuth authorization URL for a Towns user
   *
   * @param townsUserId - Towns user ID
   * @param channelId - Current channel ID
   * @param spaceId - Current space ID (undefined for DM channels)
   * @param redirect - Redirect action and data after OAuth completion
   * @returns Authorization URL to send to user
   */
  async getAuthorizationUrl(
    townsUserId: string,
    channelId: string,
    spaceId: string | undefined,
    redirect: OAuthRedirect
  ): Promise<string> {
    // Generate secure state token
    const state = randomBytes(32).toString("hex");

    // Store state in database with 15-minute expiration
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await db.insert(oauthStates).values({
      state,
      townsUserId,
      channelId,
      spaceId: spaceId ?? null,
      redirect: JSON.stringify(redirect),
      expiresAt,
      createdAt: new Date(),
    });

    // Use Octokit's OAuth to generate authorization URL
    const { url } = this.githubApp.getOAuth().getWebFlowAuthorizationUrl({
      state,
      redirectUrl: this.redirectUrl,
    });

    return url;
  }

  /**
   * Handle OAuth callback - exchange code for token and store
   *
   * @param code - OAuth authorization code
   * @param state - State parameter for validation
   * @returns OAuth state data with redirect information
   */
  async handleCallback(
    code: string,
    state: string
  ): Promise<OAuthCallbackResult> {
    // Atomically consume state to prevent race conditions and replay attacks
    const stateData = await this.consumeOAuthState(state);

    if (!stateData) {
      throw new Error("Invalid or expired state parameter");
    }

    // Check expiration (state already deleted, just need to reject)
    if (new Date() > stateData.expiresAt) {
      throw new Error("OAuth state expired");
    }

    // Exchange code for token using Octokit
    const oauth = this.githubApp.getOAuth();
    const { authentication } = await oauth.createToken({
      code,
      state,
    });

    // Get user profile using the new token
    const userOctokit = await oauth.getUserOctokit({
      token: authentication.token,
    });
    const { data: user } = await userOctokit.request("GET /user");

    // Encrypt access token
    const encryptedToken = this.encryptToken(authentication.token);
    const encryptedRefreshToken = authentication.refreshToken
      ? this.encryptToken(authentication.refreshToken)
      : null;

    // Auto-transfer: If this GitHub account is linked to a different Towns user, remove that link first
    // This allows the same GitHub account to be re-linked to a new Towns user
    await db
      .delete(githubUserTokens)
      .where(eq(githubUserTokens.githubUserId, user.id));

    // Store or update user token
    const now = new Date();
    const tokenFields = {
      githubUserId: user.id,
      githubLogin: user.login,
      accessToken: encryptedToken,
      tokenType: authentication.tokenType,
      expiresAt: authentication.expiresAt
        ? new Date(authentication.expiresAt)
        : null,
      refreshToken: encryptedRefreshToken,
      refreshTokenExpiresAt: authentication.refreshTokenExpiresAt
        ? new Date(authentication.refreshTokenExpiresAt)
        : null,
      updatedAt: now,
    };

    await db
      .insert(githubUserTokens)
      .values({
        townsUserId: stateData.townsUserId,
        createdAt: now,
        ...tokenFields,
      })
      .onConflictDoUpdate({
        target: githubUserTokens.townsUserId,
        set: tokenFields,
      });

    // Parse redirect data from database (all OAuth flows must have a redirect action)
    if (!stateData.redirect) {
      throw new Error("OAuth state missing redirect data");
    }

    let redirectJson: unknown;
    try {
      redirectJson = JSON.parse(stateData.redirect);
    } catch {
      throw new Error("OAuth state has malformed redirect JSON");
    }

    const parsed = OAuthRedirectSchema.safeParse(redirectJson);
    if (!parsed.success) {
      throw new Error(`Invalid OAuth redirect data: ${parsed.error.message}`);
    }

    // Return state data for redirect handling
    return {
      townsUserId: stateData.townsUserId,
      channelId: stateData.channelId,
      spaceId: stateData.spaceId ?? undefined,
      redirect: parsed.data,
      githubLogin: user.login,
    };
  }

  /**
   * Get stored GitHub user token for a Towns user
   *
   * @param townsUserId - Towns user ID
   * @returns User token data or null if not linked
   */
  async getUserToken(townsUserId: string) {
    const [token] = await db
      .select()
      .from(githubUserTokens)
      .where(eq(githubUserTokens.townsUserId, townsUserId))
      .limit(1);

    if (!token) {
      return null;
    }

    // Decrypt token
    return {
      ...token,
      accessToken: this.decryptToken(token.accessToken),
      refreshToken: token.refreshToken
        ? this.decryptToken(token.refreshToken)
        : null,
    };
  }

  /**
   * Get decrypted access token for a Towns user, automatically refreshing if expired
   *
   * @param townsUserId - Towns user ID
   * @returns Decrypted access token or null if not linked
   */
  async getToken(townsUserId: string): Promise<string | null> {
    const tokenData = await this.getUserToken(townsUserId);
    if (!tokenData) {
      return null;
    }

    // Check if token is expired and refresh if needed
    if (this.isTokenExpired(tokenData.expiresAt)) {
      console.log(
        `[OAuth] Access token expired for user ${townsUserId}, attempting refresh`
      );
      return this.refreshAccessToken(townsUserId);
    }

    return tokenData.accessToken;
  }

  /**
   * Get decrypted access token by GitHub login (username)
   *
   * @param githubLogin - GitHub username
   * @returns Decrypted access token or null if not found
   */
  async getTokenByGithubLogin(githubLogin: string): Promise<string | null> {
    const [token] = await db
      .select()
      .from(githubUserTokens)
      .where(eq(githubUserTokens.githubLogin, githubLogin))
      .limit(1);

    if (!token) {
      return null;
    }

    // Check if token is expired and refresh if needed
    if (this.isTokenExpired(token.expiresAt)) {
      console.log(
        `[OAuth] Access token expired for GitHub user ${githubLogin}, attempting refresh`
      );
      return this.refreshAccessToken(token.townsUserId);
    }

    return this.decryptToken(token.accessToken);
  }

  /**
   * Get user-scoped Octokit instance for API calls, automatically refreshing token if expired
   *
   * @param townsUserId - Towns user ID
   * @returns Authenticated Octokit instance or null if not linked
   */
  async getUserOctokit(townsUserId: string): Promise<Octokit | null> {
    const token = await this.getToken(townsUserId);
    if (!token) {
      return null;
    }

    // Create Octokit REST instance with user's access token
    return new Octokit({ auth: token });
  }

  /**
   * Disconnect GitHub account for a Towns user
   *
   * @param townsUserId - Towns user ID
   */
  async disconnect(townsUserId: string) {
    const token = await this.getUserToken(townsUserId);
    if (!token) {
      return;
    }

    // Revoke token on GitHub (optional - token will be invalidated anyway)
    try {
      await this.githubApp.getOAuth().deleteToken({ token: token.accessToken });
    } catch (error) {
      console.error("Failed to revoke token on GitHub:", error);
      // Continue with local deletion even if revocation fails
    }

    await this.deleteUserToken(townsUserId);
  }

  /**
   * Validate that a user's stored GitHub token exists and is still valid.
   *
   * Note: This method will automatically delete invalid tokens from the database
   * when GitHub returns a 401 response, indicating the token has been revoked or expired.
   *
   * @param townsUserId - Towns user ID
   * @returns Token validation status
   */
  async validateToken(townsUserId: string): Promise<TokenStatus> {
    try {
      const octokit = await this.getUserOctokit(townsUserId);
      if (!octokit) {
        return TokenStatus.NotLinked;
      }

      await octokit.users.getAuthenticated();
      return TokenStatus.Valid;
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const status = (error as any)?.status;

      if (status === 401) {
        // Token is invalid/revoked - delete it from database
        console.log(
          `Removing invalid OAuth token for Towns user ${townsUserId}`
        );
        await this.deleteUserToken(townsUserId);
        return TokenStatus.Invalid;
      }

      if (status === 403) {
        // Could be insufficient permissions, rate limit, or account lockout
        // Don't delete token - let user retry or reconnect
        console.warn(
          `GitHub returned 403 for ${townsUserId} - insufficient permissions, rate limit, or lockout`
        );
        return TokenStatus.Unknown;
      }

      // Other errors (network issues, DB errors, decryption failures, etc.)
      console.warn(`Error validating token for ${townsUserId}:`, error);
      return TokenStatus.Unknown;
    }
  }

  /**
   * Delete stored token for a Towns user
   *
   * @param townsUserId - Towns user ID
   */
  private async deleteUserToken(townsUserId: string): Promise<void> {
    await db
      .delete(githubUserTokens)
      .where(eq(githubUserTokens.townsUserId, townsUserId));
  }

  /**
   * Atomically consume OAuth state record (delete and return)
   * Prevents race conditions where two requests could both succeed
   *
   * @param state - OAuth state token
   * @returns The deleted state record, or undefined if not found
   */
  private async consumeOAuthState(state: string) {
    const [deleted] = await db
      .delete(oauthStates)
      .where(eq(oauthStates.state, state))
      .returning();
    return deleted;
  }

  /**
   * Refresh an expired access token using the refresh token.
   * Uses in-flight promise deduplication to prevent race conditions when
   * multiple concurrent requests detect an expired token simultaneously.
   *
   * @param townsUserId - Towns user ID
   * @returns New access token or null if refresh failed
   */
  private async refreshAccessToken(
    townsUserId: string
  ): Promise<string | null> {
    // If a refresh is already in progress for this user, wait for it
    const existingPromise = this.refreshPromises.get(townsUserId);
    if (existingPromise) {
      return existingPromise;
    }

    const refreshPromise = this.doRefreshAccessToken(townsUserId);
    this.refreshPromises.set(townsUserId, refreshPromise);

    try {
      return await refreshPromise;
    } finally {
      this.refreshPromises.delete(townsUserId);
    }
  }

  /**
   * Actual token refresh logic.
   * GitHub access tokens expire after 8 hours, refresh tokens after 6 months.
   */
  private async doRefreshAccessToken(
    townsUserId: string
  ): Promise<string | null> {
    const tokenData = await this.getUserToken(townsUserId);
    const { refreshToken, refreshTokenExpiresAt } = tokenData ?? {};

    if (!refreshToken) {
      console.log(`[OAuth] No refresh token available for user ${townsUserId}`);
      return null;
    }

    // Check if refresh token itself is expired
    if (refreshTokenExpiresAt && new Date() >= refreshTokenExpiresAt) {
      console.log(`[OAuth] Refresh token expired for user ${townsUserId}`);
      return null;
    }

    try {
      // Use Octokit's refreshToken method
      const { authentication } = await this.githubApp
        .getOAuth()
        .refreshToken({ refreshToken });

      // Update stored tokens
      await db
        .update(githubUserTokens)
        .set({
          accessToken: this.encryptToken(authentication.token),
          expiresAt: new Date(authentication.expiresAt),
          refreshToken: this.encryptToken(authentication.refreshToken),
          refreshTokenExpiresAt: new Date(authentication.refreshTokenExpiresAt),
          updatedAt: new Date(),
        })
        .where(eq(githubUserTokens.townsUserId, townsUserId));

      console.log(
        `[OAuth] Successfully refreshed token for user ${townsUserId}`
      );
      return authentication.token;
    } catch (error) {
      console.error(
        `[OAuth] Failed to refresh token for user ${townsUserId}:`,
        error
      );
      await this.deleteUserToken(townsUserId);
      return null;
    }
  }

  /**
   * Check if access token is expired or about to expire
   *
   * @param expiresAt - Token expiration date
   * @returns True if token is expired or expires within OAUTH_TOKEN_REFRESH_BUFFER_MS
   */
  private isTokenExpired(expiresAt: Date | null): boolean {
    // If no expiration date, assume token doesn't expire (shouldn't happen with GitHub App OAuth)
    return (
      !!expiresAt &&
      expiresAt.getTime() <= Date.now() + OAUTH_TOKEN_REFRESH_BUFFER_MS
    );
  }

  /**
   * Encrypt token using AES-256-GCM
   */
  private encryptToken(token: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);

    let encrypted = cipher.update(token, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encrypted
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  }

  /**
   * Decrypt token using AES-256-GCM
   */
  private decryptToken(encryptedToken: string): string {
    const [ivHex, authTagHex, encrypted] = encryptedToken.split(":");

    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  /**
   * Clean up expired OAuth states from the database
   *
   * Removes all OAuth state entries where expiresAt is in the past.
   * Should be called periodically (e.g., every hour).
   *
   * @returns Number of expired states deleted
   */
  private async cleanupExpiredStates(): Promise<number> {
    const now = new Date();

    try {
      const result = await db
        .delete(oauthStates)
        .where(lt(oauthStates.expiresAt, now))
        .returning({ state: oauthStates.state });

      const count = result.length;

      if (count > 0) {
        console.log(`[OAuth Cleanup] Removed ${count} expired OAuth states`);
      }

      return count;
    } catch (error) {
      console.error(
        "[OAuth Cleanup] Failed to clean up expired states:",
        error
      );
      throw error;
    }
  }

  /**
   * Start periodic cleanup of expired OAuth states
   *
   * @param intervalMs - Cleanup interval in milliseconds (default: 1 hour)
   * @returns Timer ID that can be used to stop the cleanup
   */
  startOAuthStateCleanup(
    intervalMs: number = OAUTH_STATE_CLEANUP_INTERVAL_MS
  ): NodeJS.Timeout {
    console.log(
      `[OAuth Cleanup] Starting periodic state cleanup (every ${intervalMs / 1000 / 60} minutes)`
    );

    // Run cleanup immediately on start
    this.cleanupExpiredStates().catch(error => {
      console.error("[OAuth Cleanup] Initial cleanup failed:", error);
    });

    // Schedule periodic cleanup
    return setInterval(() => {
      this.cleanupExpiredStates().catch(error => {
        console.error("[OAuth Cleanup] Periodic cleanup failed:", error);
      });
    }, intervalMs);
  }
}
