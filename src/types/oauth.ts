import { z } from "zod";

import { ALLOWED_EVENT_TYPES } from "../constants";

/** Event type schema for validation */
export const EventTypeSchema = z.enum(ALLOWED_EVENT_TYPES);

/**
 * OAuth redirect state - discriminated union by action type
 *
 * Each action has only the fields it requires, enabling proper type narrowing.
 */
export const OAuthRedirectSchema = z.discriminatedUnion("action", [
  // Subscribe to a new repo
  z.object({
    action: z.literal("subscribe"),
    repo: z.string(),
    eventTypes: z.array(EventTypeSchema),
    branchFilter: z.string().nullable(),
    messageEventId: z.string().optional(),
  }),

  // Update existing subscription (add/change events)
  z.object({
    action: z.literal("subscribe-update"),
    repo: z.string(),
    eventTypes: z.array(EventTypeSchema),
    branchFilter: z.string().nullable(),
  }),

  // Remove event types from subscription
  z.object({
    action: z.literal("unsubscribe-update"),
    repo: z.string(),
    eventTypes: z.array(EventTypeSchema),
  }),

  // Query command (gh_pr, gh_issue)
  z.object({
    action: z.literal("query"),
    repo: z.string(),
  }),

  // Stats card OAuth (non-Towns users, no messaging)
  z.object({
    action: z.literal("stats"),
  }),
]);

export type OAuthRedirect = z.infer<typeof OAuthRedirectSchema>;
