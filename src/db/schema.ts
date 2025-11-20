import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  primaryKey,
  uniqueIndex,
  check,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { DEFAULT_EVENT_TYPES } from "../constants/event-types";

/**
 * Stores channel subscriptions to GitHub repositories
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: serial("id").primaryKey(),
    channelId: text("channel_id").notNull(),
    repo: text("repo").notNull(), // Format: "owner/repo"
    eventTypes: text("event_types").notNull().default(DEFAULT_EVENT_TYPES), // Comma-separated event types
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  table => ({
    uniqueChannelRepo: uniqueIndex("subscriptions_channel_repo_idx").on(
      table.channelId,
      table.repo
    ),
    channelIndex: index("idx_subscriptions_channel").on(table.channelId),
    repoIndex: index("idx_subscriptions_repo").on(table.repo),
  })
);

/**
 * Stores polling state for each subscribed repository
 * Tracks ETags and last seen event IDs for efficient polling
 */
export const repoPollingState = pgTable("repo_polling_state", {
  repo: text("repo").primaryKey(), // Format: "owner/repo"
  etag: text("etag"), // GitHub ETag for conditional requests
  lastEventId: text("last_event_id"), // Last seen event ID to avoid duplicates
  lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

/**
 * Stores GitHub App installations
 * Tracks which accounts have installed the GitHub App
 */
export const githubInstallations = pgTable(
  "github_installations",
  {
    installationId: integer("installation_id").primaryKey(),
    accountLogin: text("account_login").notNull(),
    accountType: text("account_type").notNull(), // "Organization" or "User"
    installedAt: timestamp("installed_at", { withTimezone: true }).notNull(),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    appSlug: text("app_slug").notNull().default("towns-github-bot"),
  },
  table => ({
    accountTypeCheck: check(
      "account_type_check",
      sql`${table.accountType} IN ('Organization', 'User')`
    ),
  })
);

/**
 * Stores repositories for each GitHub App installation
 * Normalized table - NO JSON columns (proper SQLite design)
 */
export const installationRepositories = pgTable(
  "installation_repositories",
  {
    installationId: integer("installation_id")
      .notNull()
      .references(() => githubInstallations.installationId, {
        onDelete: "cascade",
      }),
    repoFullName: text("repo_full_name").notNull(), // Format: "owner/repo"
    addedAt: timestamp("added_at", { withTimezone: true }).notNull(),
  },
  table => ({
    pk: primaryKey({ columns: [table.installationId, table.repoFullName] }),
    repoIndex: index("idx_installation_repos_by_name").on(table.repoFullName),
    installationIndex: index("idx_installation_repos_by_install").on(
      table.installationId
    ),
  })
);

/**
 * Stores webhook delivery tracking for idempotency
 * Uses X-GitHub-Delivery header as primary key
 */
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    deliveryId: text("delivery_id").primaryKey(), // X-GitHub-Delivery header value
    installationId: integer("installation_id"),
    eventType: text("event_type").notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("pending"), // "pending", "success", "failed"
    error: text("error"),
    retryCount: integer("retry_count").notNull().default(0),
  },
  table => ({
    statusCheck: check(
      "status_check",
      sql`${table.status} IN ('pending', 'success', 'failed')`
    ),
    statusIndex: index("idx_deliveries_status").on(
      table.status,
      table.deliveredAt
    ),
  })
);
