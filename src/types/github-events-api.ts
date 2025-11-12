/**
 * Type definitions for GitHub Events API
 * https://docs.github.com/en/rest/activity/events
 */

/**
 * Base event structure from GitHub Events API
 */
interface BaseGitHubEvent {
  id: string;
  actor: {
    login: string;
    avatar_url: string;
  };
  repo: {
    name: string;
  };
  created_at: string;
}

/**
 * Pull Request Event Payload
 */
export interface PullRequestPayload {
  action: string;
  number?: number;
  pull_request?: {
    number: number;
    title: string;
    html_url: string;
    user: {
      login: string;
    };
    merged: boolean;
  };
}

export interface PullRequestEvent extends BaseGitHubEvent {
  type: "PullRequestEvent";
  payload: PullRequestPayload;
}

/**
 * Issues Event Payload
 */
export interface IssuesPayload {
  action: string;
  issue?: {
    number: number;
    title: string;
    html_url: string;
    user: {
      login: string;
    };
  };
}

export interface IssuesEvent extends BaseGitHubEvent {
  type: "IssuesEvent";
  payload: IssuesPayload;
}

/**
 * Push Event Payload
 */
export interface PushPayload {
  ref?: string;
  commits?: Array<{
    sha: string;
    message: string;
  }>;
}

export interface PushEvent extends BaseGitHubEvent {
  type: "PushEvent";
  payload: PushPayload;
}

/**
 * Release Event Payload
 */
export interface ReleasePayload {
  action: string;
  release?: {
    tag_name: string;
    name: string | null;
    html_url: string;
    author: {
      login: string;
    };
  };
}

export interface ReleaseEvent extends BaseGitHubEvent {
  type: "ReleaseEvent";
  payload: ReleasePayload;
}

/**
 * Workflow Run Event Payload
 */
export interface WorkflowRunPayload {
  action: string;
  workflow_run?: {
    name: string;
    conclusion: string | null;
    head_branch: string;
    html_url: string;
  };
}

export interface WorkflowRunEvent extends BaseGitHubEvent {
  type: "WorkflowRunEvent";
  payload: WorkflowRunPayload;
}

/**
 * Issue Comment Event Payload
 */
export interface IssueCommentPayload {
  action: string;
  issue?: {
    number: number;
  };
  comment?: {
    body: string;
    html_url: string;
    user: {
      login: string;
    };
  };
}

export interface IssueCommentEvent extends BaseGitHubEvent {
  type: "IssueCommentEvent";
  payload: IssueCommentPayload;
}

/**
 * Pull Request Review Event Payload
 */
export interface PullRequestReviewPayload {
  action: string;
  pull_request?: {
    number: number;
    title: string;
  };
  review?: {
    state: string;
    html_url: string;
    user: {
      login: string;
    };
  };
}

export interface PullRequestReviewEvent extends BaseGitHubEvent {
  type: "PullRequestReviewEvent";
  payload: PullRequestReviewPayload;
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
  | PullRequestReviewEvent;
