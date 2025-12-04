/**
 * Type definitions for GitHub Events API
 * Extends Octokit's official types with discriminated payload unions
 * Includes Zod schemas for runtime validation
 * https://docs.github.com/en/rest/activity/events
 */

import type { Endpoints } from "@octokit/types";
import { z } from "zod";

/**
 * Base event structure from Octokit's official types
 * We use this as the foundation and only refine the payload types
 */
type OctokitEvent =
  Endpoints["GET /repos/{owner}/{repo}/events"]["response"]["data"][number];

type BaseGitHubEvent = Omit<OctokitEvent, "payload">;

/**
 * Base event schema for runtime validation
 * Validates common fields present in all GitHub events
 */
const BaseEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  actor: z.object({
    login: z.string(),
  }),
  repo: z.object({
    name: z.string(),
  }),
});

/** Create action schema with known actions */
function actionSchema<T extends readonly string[]>(
  actions: T,
  eventType: string
) {
  return z
    .string()
    .refine(
      (action): action is T[number] =>
        (actions as readonly string[]).includes(action),
      {
        error: issue =>
          `Unknown ${eventType} action: "${String(issue.input)}". Expected one of: ${actions.join(", ")}`,
      }
    );
}

/** PR actions for Events API (includes `merged` which webhooks sends as `closed` with merged flag) */
const PR_ACTIONS = [
  "assigned",
  "unassigned",
  "labeled",
  "unlabeled",
  "opened",
  "edited",
  "closed",
  "reopened",
  "synchronize",
  "converted_to_draft",
  "locked",
  "unlocked",
  "milestoned",
  "demilestoned",
  "ready_for_review",
  "review_requested",
  "review_request_removed",
  "auto_merge_enabled",
  "auto_merge_disabled",
  "merged",
] as const;

/**
 * Pull Request Event Payload
 */
export const PullRequestPayloadSchema = z.object({
  action: actionSchema(PR_ACTIONS, "PullRequestEvent"),
  number: z.number().optional(),
  pull_request: z
    .object({
      number: z.number(),
      title: z.string().optional(),
      html_url: z.string().optional(),
      user: z
        .object({
          login: z.string(),
        })
        .optional(),
      merged: z.boolean().optional(),
      base: z.object({ ref: z.string() }).optional(),
    })
    .optional(),
});

export type PullRequestPayload = z.infer<typeof PullRequestPayloadSchema>;

export interface PullRequestEvent extends BaseGitHubEvent {
  type: "PullRequestEvent";
  payload: PullRequestPayload;
}

/** Issue actions for Events API */
const ISSUES_ACTIONS = [
  "opened",
  "edited",
  "deleted",
  "transferred",
  "pinned",
  "unpinned",
  "closed",
  "reopened",
  "assigned",
  "unassigned",
  "labeled",
  "unlabeled",
  "locked",
  "unlocked",
  "milestoned",
  "demilestoned",
  "typed",
  "untyped",
] as const;

/**
 * Issues Event Payload
 */
export const IssuesPayloadSchema = z.object({
  action: actionSchema(ISSUES_ACTIONS, "IssuesEvent"),
  issue: z
    .object({
      number: z.number(),
      title: z.string(),
      html_url: z.string(),
      user: z.object({
        login: z.string(),
      }),
    })
    .optional(),
});

export type IssuesPayload = z.infer<typeof IssuesPayloadSchema>;

export interface IssuesEvent extends BaseGitHubEvent {
  type: "IssuesEvent";
  payload: IssuesPayload;
}

/**
 * Push Event Payload
 */
export const PushPayloadSchema = z.object({
  ref: z.string().optional(),
  commits: z
    .array(
      z.object({
        sha: z.string(),
        message: z.string(),
      })
    )
    .optional(),
});

export type PushPayload = z.infer<typeof PushPayloadSchema>;

export interface PushEvent extends BaseGitHubEvent {
  type: "PushEvent";
  payload: PushPayload;
}

/** Release actions */
const RELEASE_ACTIONS = [
  "published",
  "unpublished",
  "created",
  "edited",
  "deleted",
  "prereleased",
  "released",
] as const;

/**
 * Release Event Payload
 */
export const ReleasePayloadSchema = z.object({
  action: actionSchema(RELEASE_ACTIONS, "ReleaseEvent"),
  release: z
    .object({
      tag_name: z.string(),
      name: z.string().nullable(),
      html_url: z.string(),
      author: z.object({
        login: z.string(),
      }),
    })
    .optional(),
});

export type ReleasePayload = z.infer<typeof ReleasePayloadSchema>;

export interface ReleaseEvent extends BaseGitHubEvent {
  type: "ReleaseEvent";
  payload: ReleasePayload;
}

/** Workflow run actions */
const WORKFLOW_RUN_ACTIONS = ["requested", "in_progress", "completed"] as const;

/**
 * Workflow Run Event Payload
 */
export const WorkflowRunPayloadSchema = z.object({
  action: actionSchema(WORKFLOW_RUN_ACTIONS, "WorkflowRunEvent"),
  workflow_run: z
    .object({
      name: z.string(),
      conclusion: z.string().nullable(),
      head_branch: z.string(),
      html_url: z.string(),
    })
    .optional(),
});

export type WorkflowRunPayload = z.infer<typeof WorkflowRunPayloadSchema>;

export interface WorkflowRunEvent extends BaseGitHubEvent {
  type: "WorkflowRunEvent";
  payload: WorkflowRunPayload;
}

/** Issue comment actions */
const ISSUE_COMMENT_ACTIONS = ["created", "edited", "deleted"] as const;

/**
 * Issue Comment Event Payload
 */
export const IssueCommentPayloadSchema = z.object({
  action: actionSchema(ISSUE_COMMENT_ACTIONS, "IssueCommentEvent"),
  issue: z
    .object({
      number: z.number(),
    })
    .optional(),
  comment: z
    .object({
      body: z.string(),
      html_url: z.string(),
      user: z.object({
        login: z.string(),
      }),
    })
    .optional(),
});

export type IssueCommentPayload = z.infer<typeof IssueCommentPayloadSchema>;

export interface IssueCommentEvent extends BaseGitHubEvent {
  type: "IssueCommentEvent";
  payload: IssueCommentPayload;
}

/** PR Review actions for Events API */
const PR_REVIEW_ACTIONS = ["submitted", "edited", "dismissed"] as const;

/**
 * Pull Request Review Event Payload
 */
export const PullRequestReviewPayloadSchema = z.object({
  action: actionSchema(PR_REVIEW_ACTIONS, "PullRequestReviewEvent"),
  pull_request: z
    .object({
      number: z.number(),
      title: z.string().optional(),
    })
    .optional(),
  review: z
    .object({
      state: z.string(),
      html_url: z.string().optional(),
      user: z
        .object({
          login: z.string(),
        })
        .optional(),
    })
    .optional(),
});

export type PullRequestReviewPayload = z.infer<
  typeof PullRequestReviewPayloadSchema
>;

export interface PullRequestReviewEvent extends BaseGitHubEvent {
  type: "PullRequestReviewEvent";
  payload: PullRequestReviewPayload;
}

/**
 * Create Event Payload (branch/tag creation)
 */
export const CreatePayloadSchema = z.object({
  ref: z.string().optional(),
  ref_type: z.enum(["branch", "tag"]).optional(),
  master_branch: z.string().optional(),
  description: z.string().nullable().optional(),
  pusher_type: z.string().optional(),
});

export type CreatePayload = z.infer<typeof CreatePayloadSchema>;

export interface CreateEvent extends BaseGitHubEvent {
  type: "CreateEvent";
  payload: CreatePayload;
}

/**
 * Delete Event Payload (branch/tag deletion)
 */
export const DeletePayloadSchema = z.object({
  ref: z.string().optional(),
  ref_type: z.enum(["branch", "tag"]).optional(),
  pusher_type: z.string().optional(),
});

export type DeletePayload = z.infer<typeof DeletePayloadSchema>;

export interface DeleteEvent extends BaseGitHubEvent {
  type: "DeleteEvent";
  payload: DeletePayload;
}

/** PR review comment actions */
const PR_REVIEW_COMMENT_ACTIONS = ["created", "edited", "deleted"] as const;

/**
 * Pull Request Review Comment Event Payload (code review comments)
 */
export const PullRequestReviewCommentPayloadSchema = z.object({
  action: actionSchema(
    PR_REVIEW_COMMENT_ACTIONS,
    "PullRequestReviewCommentEvent"
  ),
  pull_request: z
    .object({
      number: z.number(),
    })
    .optional(),
  comment: z
    .object({
      body: z.string(),
      path: z.string().optional(),
      position: z.number().nullable().optional(),
      line: z.number().nullable().optional(),
      html_url: z.string(),
      user: z
        .object({
          login: z.string(),
        })
        .optional(),
    })
    .optional(),
});

export type PullRequestReviewCommentPayload = z.infer<
  typeof PullRequestReviewCommentPayloadSchema
>;

export interface PullRequestReviewCommentEvent extends BaseGitHubEvent {
  type: "PullRequestReviewCommentEvent";
  payload: PullRequestReviewCommentPayload;
}

/** Watch actions */
const WATCH_ACTIONS = ["started"] as const;

/**
 * Watch Event Payload (stars)
 */
export const WatchPayloadSchema = z.object({
  action: actionSchema(WATCH_ACTIONS, "WatchEvent"),
});

export type WatchPayload = z.infer<typeof WatchPayloadSchema>;

export interface WatchEvent extends BaseGitHubEvent {
  type: "WatchEvent";
  payload: WatchPayload;
}

/**
 * Fork Event Payload
 */
export const ForkPayloadSchema = z.object({
  forkee: z
    .object({
      full_name: z.string(),
      html_url: z.string().optional(),
    })
    .optional(),
});

export type ForkPayload = z.infer<typeof ForkPayloadSchema>;

export interface ForkEvent extends BaseGitHubEvent {
  type: "ForkEvent";
  payload: ForkPayload;
}

/**
 * Discriminated union of all supported GitHub Events
 */
export type GitHubEvent =
  | PullRequestEvent
  | IssuesEvent
  | PushEvent
  | ReleaseEvent
  | WorkflowRunEvent
  | IssueCommentEvent
  | PullRequestReviewEvent
  | CreateEvent
  | DeleteEvent
  | PullRequestReviewCommentEvent
  | WatchEvent
  | ForkEvent;

const SUPPORTED_EVENT_TYPES = [
  "PullRequestEvent",
  "IssuesEvent",
  "PushEvent",
  "ReleaseEvent",
  "WorkflowRunEvent",
  "IssueCommentEvent",
  "PullRequestReviewEvent",
  "CreateEvent",
  "DeleteEvent",
  "PullRequestReviewCommentEvent",
  "WatchEvent",
  "ForkEvent",
] as const;

const SUPPORTED_EVENT_TYPE_SET = new Set<string>(SUPPORTED_EVENT_TYPES);

/**
 * Zod schema for validating GitHub Events
 * Discriminated union based on the event type
 */
export const GitHubEventSchema = z.discriminatedUnion("type", [
  BaseEventSchema.extend({
    type: z.literal("PullRequestEvent"),
    payload: PullRequestPayloadSchema,
  }),
  BaseEventSchema.extend({
    type: z.literal("IssuesEvent"),
    payload: IssuesPayloadSchema,
  }),
  BaseEventSchema.extend({
    type: z.literal("PushEvent"),
    payload: PushPayloadSchema,
  }),
  BaseEventSchema.extend({
    type: z.literal("ReleaseEvent"),
    payload: ReleasePayloadSchema,
  }),
  BaseEventSchema.extend({
    type: z.literal("WorkflowRunEvent"),
    payload: WorkflowRunPayloadSchema,
  }),
  BaseEventSchema.extend({
    type: z.literal("IssueCommentEvent"),
    payload: IssueCommentPayloadSchema,
  }),
  BaseEventSchema.extend({
    type: z.literal("PullRequestReviewEvent"),
    payload: PullRequestReviewPayloadSchema,
  }),
  BaseEventSchema.extend({
    type: z.literal("CreateEvent"),
    payload: CreatePayloadSchema,
  }),
  BaseEventSchema.extend({
    type: z.literal("DeleteEvent"),
    payload: DeletePayloadSchema,
  }),
  BaseEventSchema.extend({
    type: z.literal("PullRequestReviewCommentEvent"),
    payload: PullRequestReviewCommentPayloadSchema,
  }),
  BaseEventSchema.extend({
    type: z.literal("WatchEvent"),
    payload: WatchPayloadSchema,
  }),
  BaseEventSchema.extend({
    type: z.literal("ForkEvent"),
    payload: ForkPayloadSchema,
  }),
]);

/**
 * Validate a GitHub event against the schema
 * @param event - Raw event from GitHub API
 * @returns Validated event or null if validation fails
 */
export function validateGitHubEvent(event: unknown): GitHubEvent | null {
  const result = GitHubEventSchema.safeParse(event);

  if (!result.success) {
    const rawType = (event as Record<string, unknown>)?.type;
    const eventType = typeof rawType === "string" ? rawType : undefined;

    if (!eventType || !SUPPORTED_EVENT_TYPE_SET.has(eventType)) {
      return null;
    }

    const rawEventId = (event as Record<string, unknown>)?.id;
    const eventId = typeof rawEventId === "string" ? rawEventId : "unknown";
    const payload = (event as Record<string, unknown>)?.payload as
      | Record<string, unknown>
      | undefined;
    const rawAction = payload?.action;
    const action = typeof rawAction === "string" ? rawAction : undefined;

    console.error(
      `GitHub event validation failed for ${eventType} (ID: ${eventId})` +
        (action ? ` with action="${action}"` : "") +
        `:`,
      result.error.format()
    );
    return null;
  }

  return result.data as GitHubEvent;
}
