import { sqliteTable, text, integer, unique } from "drizzle-orm/sqlite-core";
import { DEFAULT_EVENT_TYPES } from "../constants/event-types";

/**
 * Stores channel subscriptions to GitHub repositories
 */
export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    channelId: text("channel_id").notNull(),
    repo: text("repo").notNull(), // Format: "owner/repo"
    eventTypes: text("event_types").notNull().default(DEFAULT_EVENT_TYPES), // Comma-separated event types
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  table => ({
    uniqueChannelRepo: unique().on(table.channelId, table.repo),
  })
);

/**
 * Stores polling state for each subscribed repository
 * Tracks ETags and last seen event IDs for efficient polling
 */
export const repoPollingState = sqliteTable("repo_polling_state", {
  repo: text("repo").primaryKey(), // Format: "owner/repo"
  etag: text("etag"), // GitHub ETag for conditional requests
  lastEventId: text("last_event_id"), // Last seen event ID to avoid duplicates
  lastPolledAt: integer("last_polled_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

/**
 * Stores GitHub App installations
 * Tracks which accounts have installed the GitHub App
 */
export const githubInstallations = sqliteTable("github_installations", {
  installationId: integer("installation_id").primaryKey(),
  accountLogin: text("account_login").notNull(),
  accountType: text("account_type").notNull(), // "Organization" or "User"
  installedAt: integer("installed_at", { mode: "timestamp" }).notNull(),
  suspendedAt: integer("suspended_at", { mode: "timestamp" }),
  appSlug: text("app_slug").notNull().default("towns-github-bot"),
});

/**
 * Stores repositories for each GitHub App installation
 * Normalized table - NO JSON columns (proper SQLite design)
 */
export const installationRepositories = sqliteTable(
  "installation_repositories",
  {
    installationId: integer("installation_id")
      .notNull()
      .references(() => githubInstallations.installationId, {
        onDelete: "cascade",
      }),
    repoFullName: text("repo_full_name").notNull(), // Format: "owner/repo"
    addedAt: integer("added_at", { mode: "timestamp" }).notNull(),
  },
  table => ({
    pk: unique().on(table.installationId, table.repoFullName),
  })
);

/**
 * Stores webhook delivery tracking for idempotency
 * Uses X-GitHub-Delivery header as primary key
 */
export const webhookDeliveries = sqliteTable("webhook_deliveries", {
  deliveryId: text("delivery_id").primaryKey(), // X-GitHub-Delivery header value
  installationId: integer("installation_id"),
  eventType: text("event_type").notNull(),
  deliveredAt: integer("delivered_at", { mode: "timestamp" }).notNull(),
  status: text("status").notNull().default("pending"), // "pending", "success", "failed"
  error: text("error"),
  retryCount: integer("retry_count").notNull().default(0),
});
