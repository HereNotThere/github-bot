import { and, eq, gte, lt } from "drizzle-orm";

import { db } from "../db";
import { eventThreads } from "../db/schema";

export type AnchorType = "pr" | "issue";

/** Default thread expiration: 30 days */
const DEFAULT_EXPIRY_DAYS = 30;

/**
 * ThreadService - Manages thread mappings for GitHub event grouping
 *
 * Stores mappings from (repo, PR/issue number) to Towns thread IDs,
 * enabling related events to be sent as thread replies.
 */
export class ThreadService {
  /**
   * Get the thread event ID for a PR or issue
   * Returns null if no thread exists (anchor wasn't seen or expired)
   */
  async getThreadId(
    spaceId: string,
    channelId: string,
    repoFullName: string,
    anchorType: AnchorType,
    anchorNumber: number
  ): Promise<string | null> {
    const results = await db
      .select({ threadEventId: eventThreads.threadEventId })
      .from(eventThreads)
      .where(
        and(
          eq(eventThreads.spaceId, spaceId),
          eq(eventThreads.channelId, channelId),
          eq(eventThreads.repoFullName, repoFullName),
          eq(eventThreads.anchorType, anchorType),
          eq(eventThreads.anchorNumber, anchorNumber),
          gte(eventThreads.expiresAt, new Date()) // Exclude expired threads
        )
      )
      .limit(1);

    return results[0]?.threadEventId ?? null;
  }

  /**
   * Store a thread mapping when an anchor event (PR/issue opened) is sent
   */
  async storeThread(
    params: {
      spaceId: string;
      channelId: string;
      repoFullName: string;
      anchorType: AnchorType;
      anchorNumber: number;
      threadEventId: string;
    },
    expiryDays = DEFAULT_EXPIRY_DAYS
  ): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

    // Upsert: update if exists, insert if not
    await db
      .insert(eventThreads)
      .values({
        ...params,
        createdAt: now,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [
          eventThreads.spaceId,
          eventThreads.channelId,
          eventThreads.repoFullName,
          eventThreads.anchorType,
          eventThreads.anchorNumber,
        ],
        set: {
          threadEventId: params.threadEventId,
          expiresAt,
        },
      });
  }

  /**
   * Delete expired thread mappings
   * Should be called periodically (e.g., daily cleanup job)
   */
  async cleanupExpired(): Promise<number> {
    const result = await db
      .delete(eventThreads)
      .where(lt(eventThreads.expiresAt, new Date()))
      .returning({ id: eventThreads.id });

    return result.length;
  }

  /**
   * Start periodic cleanup of expired thread mappings
   *
   * @param intervalMs - Cleanup interval in milliseconds (default: 24 hours)
   * @returns Timer ID that can be used to stop the cleanup
   */
  startPeriodicCleanup(
    intervalMs: number = 24 * 60 * 60 * 1000
  ): ReturnType<typeof setInterval> {
    console.log(
      `[Thread Cleanup] Starting periodic cleanup (every ${intervalMs / 1000 / 60 / 60} hours)`
    );

    // Run cleanup immediately on start
    this.cleanupExpired()
      .then(count => {
        if (count > 0) {
          console.log(
            `[Thread Cleanup] Removed ${count} expired thread mappings`
          );
        }
      })
      .catch(error => {
        console.error("[Thread Cleanup] Initial cleanup failed:", error);
      });

    // Schedule periodic cleanup
    return setInterval(() => {
      this.cleanupExpired()
        .then(count => {
          if (count > 0) {
            console.log(
              `[Thread Cleanup] Removed ${count} expired thread mappings`
            );
          }
        })
        .catch(error => {
          console.error("[Thread Cleanup] Periodic cleanup failed:", error);
        });
    }, intervalMs);
  }
}
