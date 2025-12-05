import { and, eq, gt, lt } from "drizzle-orm";

import { MESSAGE_MAPPING_EXPIRY_DAYS } from "../constants";
import { db } from "../db";
import { eventThreads, messageMappings } from "../db/schema";
import type { TownsBot } from "../types/bot";

export type AnchorType = "pr" | "issue";
export type DeliveryAction = "create" | "edit" | "delete";
export type GithubEntityType =
  | "pr"
  | "issue"
  | "comment"
  | "review"
  | "review_comment";
export type ParentType = "pr" | "issue";

/**
 * Threading context for events that can be grouped into threads
 */
export interface ThreadingContext {
  anchorType: AnchorType;
  anchorNumber: number;
  isAnchor: boolean;
}

/**
 * Entity context for tracking GitHub entities to Towns messages
 * Field names match DB schema for easy spreading
 */
export interface EntityContext {
  githubEntityType: GithubEntityType;
  githubEntityId: string;
  parentType?: ParentType;
  parentNumber?: number;
  githubUpdatedAt?: Date;
}

/**
 * Parameters for delivering a message
 */
export interface DeliveryParams {
  spaceId: string;
  channelId: string;
  repoFullName: string;
  action: DeliveryAction;
  threadingContext?: ThreadingContext;
  entityContext?: EntityContext;
  formatter: (isThreadReply: boolean) => string;
}

/**
 * MessageDeliveryService - Handles all Towns message lifecycle
 *
 * Combines thread tracking (for grouping) and message tracking (for editing/deleting)
 * into a single service that manages sending, editing, and deleting messages.
 */
export class MessageDeliveryService {
  constructor(private bot: TownsBot) {}

  /**
   * Deliver a GitHub event to a Towns channel
   * Handles: thread lookup, formatting, send/edit/delete, mapping storage
   */
  async deliver(params: DeliveryParams): Promise<void> {
    const {
      spaceId,
      channelId,
      repoFullName,
      action,
      threadingContext,
      entityContext,
      formatter,
    } = params;

    try {
      // Delete doesn't need thread lookup or formatting
      if (action === "delete" && entityContext) {
        await this.handleDelete(
          spaceId,
          channelId,
          repoFullName,
          entityContext
        );
        return;
      }

      // Thread lookup for edit/create (determines compact format)
      const isFollowUpEvent = !!threadingContext && !threadingContext.isAnchor;
      const threadId =
        isFollowUpEvent && threadingContext
          ? ((await this.getThreadId(
              spaceId,
              channelId,
              repoFullName,
              threadingContext.anchorType,
              threadingContext.anchorNumber
            )) ?? undefined)
          : undefined;

      const message = formatter(!!threadId);
      if (!message) {
        console.log("Formatter returned empty message");
        return;
      }

      if (action === "edit" && entityContext) {
        await this.handleEdit(
          spaceId,
          channelId,
          repoFullName,
          entityContext,
          message
        );
        return;
      }

      // Handle create action
      await this.handleCreate(
        spaceId,
        channelId,
        repoFullName,
        threadingContext,
        entityContext,
        threadId,
        message
      );
    } catch (error) {
      console.error(`Failed to ${action} message for ${channelId}:`, error);
    }
  }

  private async handleDelete(
    spaceId: string,
    channelId: string,
    repoFullName: string,
    entityContext: EntityContext
  ): Promise<void> {
    const { githubEntityType, githubEntityId } = entityContext;
    const existingMessageId = await this.getMessageId(
      spaceId,
      channelId,
      repoFullName,
      githubEntityType,
      githubEntityId
    );

    if (existingMessageId) {
      await this.bot.removeEvent(channelId, existingMessageId);
      await this.deleteMapping(
        spaceId,
        channelId,
        repoFullName,
        githubEntityType,
        githubEntityId
      );
      console.log(
        `Deleted message ${existingMessageId} for ${githubEntityType}:${githubEntityId}`
      );
    }
  }

  private async handleEdit(
    spaceId: string,
    channelId: string,
    repoFullName: string,
    entityContext: EntityContext,
    message: string
  ): Promise<void> {
    const { githubEntityType, githubEntityId, githubUpdatedAt } = entityContext;
    const existingMessageId = await this.getMessageId(
      spaceId,
      channelId,
      repoFullName,
      githubEntityType,
      githubEntityId
    );

    if (!existingMessageId) {
      console.log(
        `No existing message to edit for ${githubEntityType}:${githubEntityId}`
      );
      return;
    }

    // Check if we should process this update
    if (githubUpdatedAt) {
      const shouldUpdate = await this.shouldUpdate(
        spaceId,
        channelId,
        repoFullName,
        githubEntityType,
        githubEntityId,
        githubUpdatedAt
      );
      if (!shouldUpdate) {
        console.log(
          `Skipping stale edit for ${githubEntityType}:${githubEntityId}`
        );
        return;
      }
    }

    await this.bot.editMessage(channelId, existingMessageId, message);

    // Update the mapping with new timestamp
    await this.storeMapping({
      spaceId,
      channelId,
      repoFullName,
      ...entityContext,
      townsMessageId: existingMessageId,
    });

    console.log(
      `Edited message ${existingMessageId} for ${githubEntityType}:${githubEntityId}`
    );
  }

  private async handleCreate(
    spaceId: string,
    channelId: string,
    repoFullName: string,
    threadingContext: ThreadingContext | undefined,
    entityContext: EntityContext | undefined,
    threadId: string | undefined,
    message: string
  ): Promise<void> {
    const { eventId } = await this.bot.sendMessage(channelId, message, {
      threadId,
    });

    // Store thread mapping for anchor events
    if (threadingContext?.isAnchor && eventId) {
      await this.storeThread({
        spaceId,
        channelId,
        repoFullName,
        anchorType: threadingContext.anchorType,
        anchorNumber: threadingContext.anchorNumber,
        threadEventId: eventId,
      });
    }

    // Store message mapping for editing/deleting
    if (entityContext && eventId) {
      await this.storeMapping({
        spaceId,
        channelId,
        repoFullName,
        ...entityContext,
        townsMessageId: eventId,
      });
    }
  }

  // ============================================================================
  // Thread Management (from ThreadService)
  // ============================================================================

  private async getThreadId(
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
          gt(eventThreads.expiresAt, new Date())
        )
      )
      .limit(1);

    return results[0]?.threadEventId ?? null;
  }

  private async storeThread(
    params: {
      spaceId: string;
      channelId: string;
      repoFullName: string;
      anchorType: AnchorType;
      anchorNumber: number;
      threadEventId: string;
    },
    expiryDays = MESSAGE_MAPPING_EXPIRY_DAYS
  ): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

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

  // ============================================================================
  // Message Mapping Management (from MessageMappingService)
  // ============================================================================

  private async getMessageId(
    spaceId: string,
    channelId: string,
    repoFullName: string,
    entityType: GithubEntityType,
    entityId: string
  ): Promise<string | null> {
    const results = await db
      .select({ townsMessageId: messageMappings.townsMessageId })
      .from(messageMappings)
      .where(
        and(
          eq(messageMappings.spaceId, spaceId),
          eq(messageMappings.channelId, channelId),
          eq(messageMappings.repoFullName, repoFullName),
          eq(messageMappings.githubEntityType, entityType),
          eq(messageMappings.githubEntityId, entityId),
          gt(messageMappings.expiresAt, new Date())
        )
      )
      .limit(1);

    return results[0]?.townsMessageId ?? null;
  }

  private async storeMapping(
    params: {
      spaceId: string;
      channelId: string;
      repoFullName: string;
      githubEntityType: GithubEntityType;
      githubEntityId: string;
      parentType?: ParentType;
      parentNumber?: number;
      townsMessageId: string;
      githubUpdatedAt?: Date;
    },
    expiryDays = MESSAGE_MAPPING_EXPIRY_DAYS
  ): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

    await db
      .insert(messageMappings)
      .values({
        ...params,
        createdAt: now,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [
          messageMappings.spaceId,
          messageMappings.channelId,
          messageMappings.repoFullName,
          messageMappings.githubEntityType,
          messageMappings.githubEntityId,
        ],
        set: {
          townsMessageId: params.townsMessageId,
          githubUpdatedAt: params.githubUpdatedAt,
          expiresAt,
        },
      });
  }

  private async shouldUpdate(
    spaceId: string,
    channelId: string,
    repoFullName: string,
    entityType: GithubEntityType,
    entityId: string,
    newUpdatedAt: Date
  ): Promise<boolean> {
    const results = await db
      .select({ githubUpdatedAt: messageMappings.githubUpdatedAt })
      .from(messageMappings)
      .where(
        and(
          eq(messageMappings.spaceId, spaceId),
          eq(messageMappings.channelId, channelId),
          eq(messageMappings.repoFullName, repoFullName),
          eq(messageMappings.githubEntityType, entityType),
          eq(messageMappings.githubEntityId, entityId)
        )
      )
      .limit(1);

    const existing = results[0]?.githubUpdatedAt;
    if (!existing) return true;

    return newUpdatedAt > existing;
  }

  private async deleteMapping(
    spaceId: string,
    channelId: string,
    repoFullName: string,
    entityType: GithubEntityType,
    entityId: string
  ): Promise<void> {
    await db
      .delete(messageMappings)
      .where(
        and(
          eq(messageMappings.spaceId, spaceId),
          eq(messageMappings.channelId, channelId),
          eq(messageMappings.repoFullName, repoFullName),
          eq(messageMappings.githubEntityType, entityType),
          eq(messageMappings.githubEntityId, entityId)
        )
      );
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Delete expired records from both tables
   */
  async cleanupExpired(): Promise<{ threads: number; messages: number }> {
    const now = new Date();

    const threadResults = await db
      .delete(eventThreads)
      .where(lt(eventThreads.expiresAt, now))
      .returning({ id: eventThreads.id });

    const messageResults = await db
      .delete(messageMappings)
      .where(lt(messageMappings.expiresAt, now))
      .returning({
        channelId: messageMappings.channelId,
        entityId: messageMappings.githubEntityId,
      });

    return {
      threads: threadResults.length,
      messages: messageResults.length,
    };
  }

  /**
   * Start periodic cleanup of expired records
   */
  startPeriodicCleanup(
    intervalMs: number = 24 * 60 * 60 * 1000
  ): ReturnType<typeof setInterval> {
    console.log(
      `[Message Delivery Cleanup] Starting periodic cleanup (every ${intervalMs / 1000 / 60 / 60} hours)`
    );

    // Run cleanup immediately on start
    this.cleanupExpired()
      .then(({ threads, messages }) => {
        if (threads > 0 || messages > 0) {
          console.log(
            `[Message Delivery Cleanup] Removed ${threads} threads, ${messages} message mappings`
          );
        }
      })
      .catch(error => {
        console.error(
          "[Message Delivery Cleanup] Initial cleanup failed:",
          error
        );
      });

    // Schedule periodic cleanup
    return setInterval(() => {
      this.cleanupExpired()
        .then(({ threads, messages }) => {
          if (threads > 0 || messages > 0) {
            console.log(
              `[Message Delivery Cleanup] Removed ${threads} threads, ${messages} message mappings`
            );
          }
        })
        .catch(error => {
          console.error(
            "[Message Delivery Cleanup] Periodic cleanup failed:",
            error
          );
        });
    }, intervalMs);
  }
}
