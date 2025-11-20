import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq, and } from "drizzle-orm";
import { resolve } from "node:path";
import { subscriptions, repoPollingState } from "./schema";
import { DEFAULT_EVENT_TYPES } from "../constants/event-types";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://localhost:5432/github-bot";

if (!process.env.DATABASE_URL) {
  console.warn(
    "[db] DATABASE_URL not set. Falling back to local postgres://localhost:5432/github-bot"
  );
}

const sslRequired =
  process.env.DATABASE_SSL === "true" ||
  process.env.RENDER === "true" ||
  process.env.NODE_ENV === "production";

const maxConnections = Number.parseInt(
  process.env.DATABASE_POOL_SIZE ?? "",
  10
);

const client = postgres(connectionString, {
  ssl: sslRequired ? { rejectUnauthorized: false } : undefined,
  max: Number.isFinite(maxConnections) ? maxConnections : undefined,
});

export const db = drizzle(client);

const migrationsFolder = process.env.DRIZZLE_MIGRATIONS_PATH
  ? resolve(process.cwd(), process.env.DRIZZLE_MIGRATIONS_PATH)
  : resolve(process.cwd(), "drizzle");

/**
 * Automatically run database migrations on startup so we don't rely on manual CLI steps.
 * Exported promise allows callers to await readiness.
 */
export const dbReady = migrate(db, {
  migrationsFolder,
}).catch(error => {
  console.error("Failed to run database migrations", error);
  throw error;
});

/**
 * Database service for managing subscriptions and polling state
 */
export class DatabaseService {
  /**
   * Subscribe a channel to a repository
   * Handles concurrent requests gracefully with UNIQUE constraint
   * @param eventTypes - Comma-separated event types
   */
  async subscribe(
    channelId: string,
    repo: string,
    eventTypes: string = DEFAULT_EVENT_TYPES
  ): Promise<void> {
    await db
      .insert(subscriptions)
      .values({
        channelId,
        repo,
        eventTypes,
        createdAt: new Date(),
      })
      .onConflictDoNothing({
        target: [subscriptions.channelId, subscriptions.repo],
      });
  }

  /**
   * Unsubscribe a channel from a repository
   */
  async unsubscribe(channelId: string, repo: string): Promise<boolean> {
    const result = await db
      .delete(subscriptions)
      .where(
        and(
          eq(subscriptions.channelId, channelId),
          eq(subscriptions.repo, repo)
        )
      )
      .returning({ id: subscriptions.id });

    return result.length > 0;
  }

  /**
   * Get all repositories a channel is subscribed to with event type preferences
   */
  async getChannelSubscriptions(
    channelId: string
  ): Promise<Array<{ repo: string; eventTypes: string }>> {
    const results = await db
      .select({
        repo: subscriptions.repo,
        eventTypes: subscriptions.eventTypes,
      })
      .from(subscriptions)
      .where(eq(subscriptions.channelId, channelId));

    // Ensure eventTypes is never null (default to common event types)
    return results.map(r => ({
      repo: r.repo,
      eventTypes: r.eventTypes || DEFAULT_EVENT_TYPES,
    }));
  }

  /**
   * Get all channels subscribed to a repository with their event type preferences
   */
  async getRepoSubscribers(
    repo: string
  ): Promise<Array<{ channelId: string; eventTypes: string }>> {
    const results = await db
      .select({
        channelId: subscriptions.channelId,
        eventTypes: subscriptions.eventTypes,
      })
      .from(subscriptions)
      .where(eq(subscriptions.repo, repo));

    // Ensure eventTypes is never null (default to common event types)
    return results.map(r => ({
      channelId: r.channelId,
      eventTypes: r.eventTypes || DEFAULT_EVENT_TYPES,
    }));
  }

  /**
   * Get all unique repositories that have at least one subscriber
   */
  async getAllSubscribedRepos(): Promise<string[]> {
    const results = await db
      .selectDistinct({ repo: subscriptions.repo })
      .from(subscriptions);

    return results.map(r => r.repo);
  }

  /**
   * Get polling state for a repository
   */
  async getPollingState(repo: string): Promise<{
    etag?: string;
    lastEventId?: string;
    lastPolledAt?: Date;
  } | null> {
    const results = await db
      .select()
      .from(repoPollingState)
      .where(eq(repoPollingState.repo, repo))
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    const state = results[0];
    return {
      etag: state.etag ?? undefined,
      lastEventId: state.lastEventId ?? undefined,
      lastPolledAt: state.lastPolledAt ?? undefined,
    };
  }

  /**
   * Update polling state for a repository
   */
  async updatePollingState(
    repo: string,
    state: {
      etag?: string;
      lastEventId?: string;
      lastPolledAt?: Date;
    }
  ): Promise<void> {
    const existing = await db
      .select()
      .from(repoPollingState)
      .where(eq(repoPollingState.repo, repo))
      .limit(1);

    if (existing.length === 0) {
      // Insert new state
      await db.insert(repoPollingState).values({
        repo,
        etag: state.etag ?? null,
        lastEventId: state.lastEventId ?? null,
        lastPolledAt: state.lastPolledAt ?? null,
        updatedAt: new Date(),
      });
    } else {
      // Update existing state
      await db
        .update(repoPollingState)
        .set({
          etag: state.etag ?? existing[0].etag,
          lastEventId: state.lastEventId ?? existing[0].lastEventId,
          lastPolledAt: state.lastPolledAt ?? existing[0].lastPolledAt,
          updatedAt: new Date(),
        })
        .where(eq(repoPollingState.repo, repo));
    }
  }

  /**
   * Check if a channel is subscribed to a repository
   */
  async isSubscribed(channelId: string, repo: string): Promise<boolean> {
    const results = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.channelId, channelId),
          eq(subscriptions.repo, repo)
        )
      )
      .limit(1);

    return results.length > 0;
  }
}

export const dbService = new DatabaseService();
