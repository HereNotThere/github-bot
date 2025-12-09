import { and, eq, gt, lt } from "drizzle-orm";

import { MESSAGE_MAPPING_EXPIRY_DAYS } from "../constants";
import { db } from "../db";
import { messageMappings } from "../db/schema";
import type { TownsBot } from "../types/bot";

export type AnchorType = "pr" | "issue";
export type DeliveryAction = "create" | "edit" | "delete";
export type GithubEntityType =
  | "pr"
  | "issue"
  | "comment"
  | "review"
  | "review_comment";

/**
 * Entity context for tracking GitHub entities to Towns messages
 * Unified context for both threading and message tracking
 */
export interface EntityContext {
  githubEntityType: GithubEntityType;
  githubEntityId: string;
  isAnchor: boolean; // true = starts a thread (PR/issue opened)
  parentType?: AnchorType; // for threading - the parent anchor
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
  entityContext?: EntityContext; // required for edit/delete, optional for create
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
      entityContext,
      formatter,
    } = params;

    try {
      // Thread lookup: non-anchors reply to their parent anchor
      const threadId =
        entityContext &&
        !entityContext.isAnchor &&
        entityContext.parentType &&
        entityContext.parentNumber != null
          ? ((await this.getMessageId(
              spaceId,
              channelId,
              repoFullName,
              entityContext.parentType,
              String(entityContext.parentNumber)
            )) ?? undefined)
          : undefined;

      switch (action) {
        case "delete":
          if (!entityContext) {
            console.log("Delete action requires entityContext");
            return;
          }
          await this.handleDelete(
            spaceId,
            channelId,
            repoFullName,
            entityContext
          );
          return;

        case "edit": {
          if (!entityContext) {
            console.log("Edit action requires entityContext");
            return;
          }
          const message = formatter(!!threadId);
          if (!message) {
            console.log("Formatter returned empty message");
            return;
          }
          await this.handleEdit(
            spaceId,
            channelId,
            repoFullName,
            entityContext,
            message
          );
          return;
        }

        case "create":
        default: {
          const message = formatter(!!threadId);
          if (!message) {
            console.log("Formatter returned empty message");
            return;
          }
          await this.handleCreate(
            spaceId,
            channelId,
            repoFullName,
            entityContext,
            threadId,
            message
          );
        }
      }
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
      // Retroactive anchor: if this is an anchor edit but no anchor exists,
      // create it (happens when PR base branch changes to match filter)
      if (entityContext.isAnchor) {
        console.log(
          `Creating retroactive anchor for ${githubEntityType}:${githubEntityId}`
        );
        await this.handleCreate(
          spaceId,
          channelId,
          repoFullName,
          entityContext,
          undefined,
          message
        );
        return;
      }
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
      githubEntityType,
      githubEntityId,
      parentType: entityContext.parentType,
      parentNumber: entityContext.parentNumber,
      githubUpdatedAt,
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
    entityContext: EntityContext | undefined,
    threadId: string | undefined,
    message: string
  ): Promise<void> {
    const { eventId } = await this.bot.sendMessage(channelId, message, {
      threadId,
    });

    if (!eventId || !entityContext) return;

    // Store entity mapping (for both threading and editing)
    await this.storeMapping({
      spaceId,
      channelId,
      repoFullName,
      githubEntityType: entityContext.githubEntityType,
      githubEntityId: entityContext.githubEntityId,
      parentType: entityContext.parentType,
      parentNumber: entityContext.parentNumber,
      githubUpdatedAt: entityContext.githubUpdatedAt,
      townsMessageId: eventId,
    });
  }

  // ============================================================================
  // Message Mapping Management
  // ============================================================================

  /**
   * Get Towns message ID for a GitHub entity.
   * Uses gt(expiresAt, now) so expired rows are ignored even before cleanup runs.
   */
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
      parentType?: AnchorType;
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
   * Delete expired records from messageMappings.
   * Uses lt(expiresAt, now) to clean up rows that lookups already ignore.
   */
  private async cleanupExpired(): Promise<void> {
    try {
      const results = await db
        .delete(messageMappings)
        .where(lt(messageMappings.expiresAt, new Date()))
        .returning({
          channelId: messageMappings.channelId,
          entityId: messageMappings.githubEntityId,
        });

      if (results.length > 0) {
        console.log(
          `[Message Delivery Cleanup] Removed ${results.length} expired mappings`
        );
      }
    } catch (error) {
      console.error("[Message Delivery Cleanup] Cleanup failed:", error);
    }
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

    void this.cleanupExpired();
    return setInterval(() => {
      void this.cleanupExpired();
    }, intervalMs);
  }
}
