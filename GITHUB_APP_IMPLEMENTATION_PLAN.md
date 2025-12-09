# GitHub App Implementation Plan

## Overview

This document describes the GitHub App integration for the Towns Protocol bot, which bridges GitHub activity with Towns channels through real-time webhooks and fallback polling.

### Towns Protocol Context

**Towns Protocol** is a decentralized communication platform where users organize into **spaces** (communities) containing **channels** (topic-specific streams). Users interact via:

- **Slash commands** (e.g., `/github subscribe owner/repo`)
- **Messages** with bot mentions and replies
- **Reactions** and threaded conversations

The bot receives Towns events via webhooks at `/webhook`, processes them, and sends formatted messages back to channels.

## Problem: Events API Limitations

GitHub's Events API has critical limitations:

| Issue                   | Impact                                      |
| ----------------------- | ------------------------------------------- |
| Missing PR merge events | No notifications when PRs are closed/merged |
| Empty commit data       | Push events contain `commits: []`           |
| 5-minute polling delay  | Not real-time                               |
| Best-effort delivery    | No guarantees on completeness               |

**Root cause**: Events API is designed for activity feeds, not reliable event delivery.

## Solution: GitHub App with Dual-Mode Operation

### Architecture

```
┌─────────────────────────────────────────────┐
│          Single Hono Application            │
├─────────────────────────────────────────────┤
│                                             │
│  POST /webhook         ← Towns Protocol     │
│  POST /github-webhook  ← GitHub App         │
│  GET  /health         ← Health checks       │
│                                             │
│  • Single process, single database          │
│  • Deployed on Render                       │
│  • Dual-mode: webhooks OR polling           │
└─────────────────────────────────────────────┘
```

### Delivery Modes

**Real-time Webhooks (Preferred):**

- Requires GitHub App installation on repository
- Instant delivery (< 1 second latency)
- Works for public AND private repos
- Complete event data guaranteed

**Polling Fallback (Legacy):**

- No installation required
- 5-minute polling interval
- Only works for **public** repos
- Missing events (PR merges, commit data)

### Key Design Decisions

1. **Dual-mode architecture**: Automatically use webhooks when app installed, fall back to polling otherwise
2. **No manual webhook configuration**: GitHub App manages webhooks automatically
3. **Idempotency**: Track webhook deliveries by `X-GitHub-Delivery` header to prevent duplicates
4. **Database-backed state**: Installation and delivery state persisted in PostgreSQL (Drizzle ORM)
5. **Foreign key CASCADE**: Auto-cleanup when installations deleted

## Database Schema

### github_installations

```sql
CREATE TABLE github_installations (
  installation_id INTEGER PRIMARY KEY,
  account_login TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK(account_type IN ('Organization', 'User')),
  installed_at TIMESTAMPTZ NOT NULL,
  suspended_at TIMESTAMPTZ,
  app_slug TEXT NOT NULL DEFAULT 'towns-github-bot'
);
```

### installation_repositories

```sql
CREATE TABLE installation_repositories (
  installation_id INTEGER NOT NULL,
  repo_full_name TEXT NOT NULL,
  added_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (installation_id, repo_full_name),
  FOREIGN KEY (installation_id)
    REFERENCES github_installations(installation_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_installation_repos_by_name ON installation_repositories(repo_full_name);
```

### github_subscriptions

```sql
CREATE TABLE github_subscriptions (
  id SERIAL PRIMARY KEY,
  space_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  repo_full_name TEXT NOT NULL,
  delivery_mode TEXT NOT NULL CHECK (delivery_mode IN ('webhook', 'polling')),
  is_private BOOLEAN NOT NULL,
  created_by_towns_user_id TEXT NOT NULL
    REFERENCES github_user_tokens(towns_user_id) ON DELETE CASCADE,
  created_by_github_login TEXT,
  installation_id INTEGER
    REFERENCES github_installations(installation_id) ON DELETE SET NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  event_types TEXT NOT NULL DEFAULT 'pr,issues,commits,releases',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(space_id, channel_id, repo_full_name)
);

CREATE INDEX idx_subscriptions_by_repo ON github_subscriptions(repo_full_name);
CREATE INDEX idx_subscriptions_by_channel ON github_subscriptions(channel_id);
```

`github_user_tokens` (see `src/db/schema.ts`) stores the encrypted user OAuth credentials referenced by `created_by_towns_user_id`.

### webhook_deliveries

```sql
CREATE TABLE webhook_deliveries (
  delivery_id TEXT PRIMARY KEY,  -- X-GitHub-Delivery header
  installation_id INTEGER,
  event_type TEXT NOT NULL,
  delivered_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'success', 'failed')),
  error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_deliveries_status ON webhook_deliveries(status, delivered_at);
```

**Note**: `installation_id` in `webhook_deliveries` is nullable because some webhook events don't have installation context. No foreign key constraint to preserve audit trail.

## Component Architecture

### Core Components

**Implemented in `src/github-app/`:**

1. **GitHubApp** (`app.ts`)
   - Octokit App initialization
   - Webhook event registration
   - Public `webhooks` property for route registration

2. **EventProcessor** (`event-processor.ts`)
   - Routes webhook events to formatters
   - Filters by channel event type preferences
   - Sends to subscribed Towns channels

3. **InstallationService** (`installation-service.ts`)
   - Handles installation lifecycle (created/deleted)
   - Manages repository additions/removals
   - Checks installation status per repo
   - Notifies Towns channels of mode changes

4. **WebhookProcessor** (`webhook-processor.ts`)
   - Idempotency tracking via deliveryId
   - Cleanup of old webhook records
   - Database-backed (no in-memory state)

### Event Flow

```
GitHub Event
  → POST /github-webhook
  → JWT verify + HMAC signature check (Octokit)
  → Check idempotency (webhook_deliveries table)
  → EventProcessor routes to formatter
  → Filter by channel preferences
  → Send to Towns channels
  → Mark as processed (success only)
```

**Critical**: Failed webhooks are NOT marked as processed, allowing GitHub's retry mechanism to work.

## Type System

### Webhook Types

Using `@octokit/webhooks` official types:

```typescript
import type {
  EmitterWebhookEvent,
  EmitterWebhookEventName,
} from "@octokit/webhooks";

type WebhookPayload<T extends EmitterWebhookEventName> =
  EmitterWebhookEvent<T>["payload"];

export type PullRequestPayload = WebhookPayload<"pull_request">;
export type IssuesPayload = WebhookPayload<"issues">;
// ... etc
```

**Why not `@octokit/webhooks-types`?** That package is legacy (community JSON schemas). `@octokit/webhooks` uses official OpenAPI types.

## Subscription Flow

### Single OAuth Flow (Shipped)

**Status:** Live in production — users only leave Towns once and the subscription is created automatically during the OAuth callback.

### Public Repository Flow

```text
/github subscribe owner/repo
  ↓
User has OAuth token?
  ├─ No → Show OAuth URL → User authorizes → Callback stores token
  └─ Yes → Continue
  ↓
Check if GitHub App installed on repo
  ├─ Installed → delivery_mode = 'webhook'
  └─ Not installed → delivery_mode = 'polling'
  ↓
Create subscription immediately
  ↓
Success message in Towns + browser success page
  ↓
[If polling] Auto-redirect to GitHub App installation page (5s countdown)
  ↓
[Optional] User installs GitHub App → Webhook upgrades subscription automatically
```

### Private Repository Flow

Private repos **require** the GitHub App to be installed before subscribing.

```text
/github subscribe owner/repo
  ↓
User has OAuth token?
  ├─ No → Show OAuth URL → User authorizes → Callback stores token
  └─ Yes → Continue
  ↓
Check if GitHub App installed on repo
  ├─ Installed → Create subscription with delivery_mode = 'webhook' → Success
  └─ Not installed ↓
        Store pending subscription in `pending_subscriptions` table
        Show "Installation Required" page with redirect to GitHub App install
        ↓
        User installs GitHub App
        ↓
        Installation webhook fires → `completePendingSubscriptions()` runs
        ↓
        Subscription created automatically + notification sent to channel
```

**Pending Subscriptions:**

- Stored in `pending_subscriptions` table with 1-hour expiration
- Auto-completed when installation webhook fires for the target repo
- Cleaned up periodically by `cleanupExpiredPendingSubscriptions()`

### OAuth State

State parameter passed through OAuth flow:

```json
{
  "action": "subscribe",
  "townsUserId": "0x...",
  "spaceId": "...",
  "channelId": "...",
  "repo": "owner/repo",
  "eventTypes": "pr,issues,commits,..."
}
```

### Installation Webhook Handler

**Purpose:** Upgrade polling subscriptions and complete pending subscriptions

Implemented in `InstallationService`:

- Triggered by `installation.created` and `installation_repositories.added` events
- Upgrades existing polling subscriptions to webhook mode
- Completes pending subscriptions for private repos
- Sends notification to affected channels

## Query Command Flow

### `/gh_pr` and `/gh_issue` for Private Repos

Query commands require **2 invocations** for private repos (vs 1 for public):

```text
/gh_pr owner/repo #123
  ↓
User has OAuth token?
  ├─ No → Show editable OAuth prompt → User authorizes → Callback
  │         ↓
  │       OAuth Success → Edit message to "✅ GitHub connected"
  │         ↓
  │       Check if GitHub App installed on repo
  │         ├─ Installed → Show success page
  │         └─ Not installed → Show "Installation Required" page
  │                              Auto-redirect to GitHub App install (3s)
  │                              ↓
  │                            User installs app → Returns to Towns
  │
  └─ Yes → Check if GitHub App installed
              ├─ Installed → Fetch and display result
              └─ Not installed → Show install prompt
```

**Second invocation after OAuth + install:**

```text
/gh_pr owner/repo #123
  ↓
OAuth token valid ✓
GitHub App installed ✓
  ↓
Fetch and display result → SUCCESS
```

**Key differences from subscriptions:**

- Query commands cannot be "pended" and auto-completed by webhooks
- Results must be returned synchronously to the user
- Users must re-run the command after OAuth + install complete

### OAuth State for Query Commands

```json
{
  "action": "query",
  "townsUserId": "0x...",
  "spaceId": "...",
  "channelId": "...",
  "repo": "owner/repo",
  "messageEventId": "..." // For editing the OAuth prompt message
}
```

## Threading & Branch Filtering

### Branch-Specific Event Filtering

Filter events by branch to reduce noise from feature branches.

**Syntax:**

```bash
/github subscribe owner/repo --events commits --branches main,develop
/github subscribe owner/repo --events commits,ci --branches release/*
/github subscribe owner/repo --events commits --branches all  # Opt-in to all branches (or *)
```

**Scope - Events affected by `--branches` flag:**

| Event    | Branch Context             | Example Use Case         |
| -------- | -------------------------- | ------------------------ |
| commits  | Branch pushed to           | Only main/develop pushes |
| ci       | Workflow trigger branch    | Only prod CI results     |
| pr       | Base branch (merge target) | Only PRs targeting main  |
| reviews  | PR's base branch           | Same as pr               |
| branches | Branch created/deleted     | Only release/\* events   |

**Not branch-specific:** issues, comments, releases, stars, forks

**Design Decisions:**

- Default: **Default branch only** (breaking change from current "all branches")
- Patterns: **Glob support** (`release/*`, `feature/*`)
- `--branches all` opts into all branches (preserves old behavior)

**Storage:**

New `branch_filter` column in `github_subscriptions`:

- `NULL` = default branch only
- `'all'` = all branches
- `'main,develop,release/*'` = specific branches/patterns

**Files to modify:**

1. `db/schema.ts` - Add `branch_filter` column
2. `github-subscription-handler.ts` - Parse `--branches` flag
3. `event-processor.ts` - Filter in specific handlers (`onPush`, `onWorkflowRun`, `onPullRequest`, `onPullRequestReview`, `onBranchEvent`) using typed payloads from `@octokit/webhooks`
4. `subscription-service.ts` - Store/retrieve filter

**Migration:**

Breaking change: existing subscriptions get default-branch-only behavior.
Option: migrate existing commits subscriptions to `branch_filter = 'all'` to preserve old behavior.

### Thread-Based Event Grouping

Group related GitHub events into threads to reduce channel noise while preserving context.

**Core Concept:**

When a PR is opened, subsequent events (commits, CI runs, reviews, comments) are sent as thread replies instead of top-level messages. This keeps the channel clean while grouping all PR activity together.

**Event Grouping Strategy:**

| Thread Anchor     | Grouped Events                                                                     |
| ----------------- | ---------------------------------------------------------------------------------- |
| PR opened         | Commits pushed, CI status, reviews, review comments, PR comments, PR merged/closed |
| Issue opened      | Issue comments, issue closed/reopened                                              |
| Release published | (standalone - no grouping needed)                                                  |
| Branch created    | Commits pushed to branch (optional)                                                |

**Implementation Approach:**

1. **Unified Message Mappings Table** (implemented as `messageMappings`):
   - Stores both anchor and child entity mappings
   - Fields: `spaceId, channelId, repoFullName, githubEntityType, githubEntityId, parentType, parentNumber, townsMessageId, githubUpdatedAt, expiresAt`
   - Composite primary key on (spaceId, channelId, repoFullName, githubEntityType, githubEntityId)

2. **Event Processing Flow:**

```
Incoming webhook event
  ↓
Is this a PR/issue event?
  ├─ PR opened / Issue opened → Send as top-level, store in messageMappings
  └─ PR push / PR review / PR comment / etc.
       ↓
     Lookup parent anchor in messageMappings
       ├─ Found → Send as reply with threadId
       └─ Not found → Send as top-level (anchor was before bot joined or filtered)
```

3. **Architecture:**
   - `EventProcessor` - Routes webhook events, handles entity context
   - `MessageDeliveryService` - Manages send/edit/delete, thread lookup, mapping storage
   - `handleAnchorEvent()` - Unified handler for PR/issue open/edit/close/reopen

**Message Format in Thread:**

```text
# Anchor message (top-level)
🔀 **PR #123 opened** by @user
feat: Add dark mode support
[View PR](https://github.com/...)

# Thread replies
💬 @reviewer commented on PR #123
"Looks good! Just one suggestion..."

✅ CI passed on PR #123
All 45 tests passing

🔍 @reviewer approved PR #123
"LGTM!"

🎉 PR #123 merged by @user
```

**Configuration Options:**

```bash
/github subscribe owner/repo --threads=on   # Enable threading (default)
/github subscribe owner/repo --threads=off  # All events top-level
```

Or per-event-type:

```bash
/github subscribe owner/repo --thread-pr --no-thread-issues
```

**Edge Cases:**

1. **Late joins**: If bot wasn't present when PR opened, send as top-level
2. **Thread expiration**: Clean up mappings after 30 days (configurable via `MESSAGE_MAPPING_EXPIRY_DAYS`)
3. **Cross-channel**: Same PR subscribed in multiple channels = separate threads
4. **Branch-filtered PR**: PR on non-matching branch → no anchor → child events filtered
5. **Base branch change**: PR retargeted to matching branch → create anchor retroactively

**Data Retention:**

- Thread mappings expire after 30 days (configurable)
- Cleanup job runs daily to remove expired entries
- No impact on message history (Towns retains messages independently)

**Limitations:**

- Requires Towns Protocol thread support (verified working)
- Thread lookup adds ~1 DB query per event (indexed)

### PR Comment Branch Filtering

GitHub fires `issue_comment` for both issue and PR comments. Unlike `pull_request_review` events, the `issue_comment` payload doesn't include `pull_request.base.ref`.

**Solution: In-memory PR Branch Cache**

- Cache: `Map<string, { branch: string, updatedAt: Date }>` keyed by `${repo}#${prNumber}`
- Populated by: `onPullRequest`, `onPullRequestReview`, `onPullRequestReviewComment`
- Read by: `onIssueComment` (cache hit → use cached branch, miss → fetch via API)
- Timestamp ordering: Only update if incoming `pull_request.updated_at` >= existing
- Cleanup: Delete entry on PR close; lazy TTL on read (>24h old = treat as miss, refetch)

**API Fallback:**

- On cache miss or stale entry, fetch PR via installation Octokit
- Rate limit: 5,000 req/hour per installation (rarely hit since PR events populate cache)

### PR Anchor Dynamic Updates

Update the anchor message when PR metadata changes, keeping the thread anchor current without creating new top-level messages.

**Fields That Trigger Anchor Refresh:**

| Field        | Source Event                       | Example Change                      |
| ------------ | ---------------------------------- | ----------------------------------- |
| Title        | `pull_request.edited`              | "feat: Add X" → "feat: Add X and Y" |
| State        | `pull_request.closed/reopened`     | open → closed/merged                |
| Labels       | `pull_request.labeled/unlabeled`   | Added `bug`, removed `wip`          |
| Assignees    | `pull_request.assigned/unassigned` | @alice assigned                     |
| Review State | `pull_request_review.submitted`    | → approved / changes_requested      |
| CI Status    | `check_suite.completed` (optional) | ✅ passing / ❌ failing             |

**Implementation:**

1. **Store anchor message ID** in `messageMappings` with `isAnchor: true` context
2. **Detect metadata changes** via `handleAnchorEvent()`:
   - `pull_request` events: `edited`, `closed`, `reopened`
   - Thread replies created for `closed`/`reopened`, anchor updated in place
3. **Update message** via `bot.editMessage(channelId, townsMessageId, newMessage)`
4. **Timestamp ordering**: Use `githubUpdatedAt` to prevent stale overwrites

**Base Branch Change (Retarget) Handling:**

When a PR's base branch changes from non-matching to matching:

1. On `pull_request.edited`, check if anchor exists via `MessageDeliveryService.anchorExists()`
2. If no anchor AND branch now matches filter → create anchor retroactively (treat as late `opened`)
3. If anchor exists → normal edit flow (update anchor)
4. Pre-existing orphaned messages (sent before anchor) remain top-level; future events thread to new anchor

**Anchor Card Format:**

```text
🔀 **PR #123** open → merged
feat: Add dark mode support

👤 @user  📊 +340 -120
🏷️ enhancement, ui
👥 @reviewer1, @reviewer2
✅ 2 approvals  ⏳ CI passing

🔗 https://github.com/...
```

**Interaction with Thread Replies:**

- Thread replies continue to be added as new messages
- Only the anchor (first message) is updated
- Thread context preserved

**Webhook Ordering:**

- GitHub webhooks may arrive out of order
- Use `pull_request.updated_at` to compare with stored `githubUpdatedAt`
- Only process edit if incoming timestamp >= stored timestamp
- Branch cache uses same ordering to prevent stale branch overwrites

**Idempotency:**

- `X-GitHub-Delivery` header tracked in `webhookDeliveries` table
- Same event delivered twice is skipped
- Anchor regeneration deterministic based on PR state in payload

## Configuration

> **See `CONTRIBUTING.md` for complete environment variables reference.**

### GitHub App Manifest

Located at `github-app-manifest.json`. Key settings:

- `public: true` - Anyone can install
- `default_permissions`: read-only access to repos
- `default_events`: repo-level events only (NOT installation events)
- `redirect_url`: Required field (points to `/health`)

**Note**: Installation/repository events are app-level and automatically enabled.

## Implementation Status

### ✅ Completed

**Core Infrastructure:**

- GitHub App core with Octokit integration
- Webhook endpoint with signature verification
- Database schema with foreign key CASCADE
- CHECK constraints for data integrity
- Event processor routing to formatters
- Installation lifecycle management
- Idempotency tracking (database-backed)
- Type-safe handlers with consolidated types
- Dual-mode polling service (skips repos with app)

**User Experience:**

- Status command shows delivery mode per repo (⚡/⏱️)
- Private repo handling with OAuth validation
- Enhanced subscription messages with delivery mode info
- Installation notifications with automatic upgrade
- Case-insensitive unsubscribe
- Ephemeral OAuth URLs for security
- Pending subscriptions for private repos (auto-complete on install)
- OAuth token renewal - automatic refresh via `oauth.refreshToken()` with 5-minute buffer
- Granular unsubscribe - `/github unsubscribe owner/repo --events pr,issues`
- Subscription management - `/github subscribe owner/repo --events releases` adds to existing

**Documentation:**

- Comprehensive README reorganization
- New CONTRIBUTING.md with developer guide
- Complete environment variables documentation
- Condensed AGENTS.md reference

### 🚧 Remaining Work

**Event Organization (Priority 1):**

- [x] Thread-based grouping for related events (PR + commits + CI)
- [x] PR Anchor Dynamic Updates - Update anchor on title/state changes
- [ ] **PR Comment Branch Filtering** - Apply branch filter to `issue_comment` events on PRs
- [ ] **Retroactive Anchor Creation** - Create anchor when PR base branch changes to match filter
- [ ] Event summaries / digests to reduce channel noise

**Mentions & Filters (Priority 2):**

- [ ] **GitHub Mentions → Towns Mentions** - Convert GitHub @mentions to Towns @mentions when users are linked
- [ ] **Label-Based Event Filtering** - Filter subscriptions by PR/issue labels (`--labels bug,security`)

**New Commands:**

- `/gh_stat owner/repo` - Repository statistics and contributor leaderboard (see Future Improvements)
- `/gh search` - Search repos, issues, PRs
- `/gh_release list owner/repo` - List releases
- `/github test owner/repo` - Webhook diagnostics

## Testing Checklist

- [ ] Subscribe to public repo without app → polls successfully
- [ ] Subscribe to public repo with app → receives webhooks
- [ ] Subscribe to private repo without app → shows error, requires app
- [ ] Subscribe to private repo with app → receives webhooks
- [ ] Install app to repo → channel notified, mode switches
- [ ] Uninstall app from repo → channel notified, falls back to polling
- [ ] Webhook signature verification rejects invalid requests
- [ ] Idempotency prevents duplicate event processing
- [ ] Failed webhooks allow retry (not marked as processed)
- [ ] Old webhook deliveries cleaned up (lt() comparison works)

## Deployment Notes

**Platform**: Render (Web Service)

**Configuration**:

- Build: `bun install`
- Start: `bun run src/index.ts`
- Environment: Set all variables from `.env.sample`
- Database: Managed PostgreSQL (Render, Neon, Supabase, etc.) via `DATABASE_URL`/`DATABASE_SSL`

**Webhook URL**: Must be publicly accessible at `https://your-domain.com/github-webhook`

## Security Considerations

1. **Signature verification**: All GitHub webhooks verified via Octokit
2. **Raw body handling**: Webhook route registered before body-parsing middleware
3. **Idempotency**: Prevents replay attacks and duplicate processing
4. **Foreign key constraints**: Ensures data integrity
5. **CHECK constraints**: Validates data at database level

## Performance Characteristics

**Webhook mode**:

- Latency: < 1 second from GitHub event to Towns message
- Throughput: Limited by Octokit processing (no bottleneck observed)
- Database: O(1) idempotency check, O(1) installation lookup

**Polling mode**:

- Latency: Up to 5 minutes
- API usage: 1 request per repo per 5 minutes
- Database: O(n) where n = subscribed repos

**Cleanup**:

- Webhook deliveries: Periodic cleanup of records > 7 days old
- Uses `lt()` comparison (not `eq()`)

## Query Commands Private Repo Support

The `/gh_pr` and `/gh_issue` commands now reuse the same OAuth-first strategy as subscriptions so private repositories behave exactly like public ones if the caller has access.

### Behavior

1. Handlers call the GitHub REST API with the bot token first (fast path for public repos).
2. Errors are classified via `classifyApiError`.
3. On `forbidden` or `not_found`, the bot looks up the requester's OAuth token (`GitHubOAuthService.getUserOctokit`):
   - Token present → retry the API call with the user's credentials.
   - Token missing → send the editable OAuth prompt so the user can connect without rerunning the command.
   - Token present but request still fails → tell the user they don't have access to the repo.
4. Rate limiting, missing args, and validation errors have dedicated responses so the UX mirrors `/github subscribe`.

### References

- `src/handlers/gh-pr-handler.ts` and `src/handlers/gh-issue-handler.ts` contain the fallback logic.
- `src/utils/oauth-helpers.ts` provides the editable OAuth prompts.
- `src/api/github-client.ts` accepts optional Octokit instances so all API helpers can run with either credential set.

## Future Improvements

1. **Health indicators**: Show delivery latency and last event timestamp
2. **Installation status command**: `/github app-status` to view all installations
3. **Webhook delivery monitoring**: Track success/failure rates
4. **Rate limit handling**: Graceful degradation if API limits hit
5. **Scheduled digests**: Daily/weekly summaries for quieter channels
6. **Multi-region deployment**: Reduce latency for global users

### `/gh_stat` Command Brainstorm

A fun statistics command for repository insights and contributor leaderboards.

**Possible Subcommands:**

```bash
/gh_stat owner/repo              # Overview: stars, forks, open issues/PRs, languages
/gh_stat owner/repo contributors # Top contributors by commits (last 30/90 days)
/gh_stat owner/repo activity     # Commit frequency, PR merge rate, issue close rate
/gh_stat owner/repo leaderboard  # Gamified: lines added/removed, PRs merged, issues closed
```

**Data Sources (GitHub API):**

- `GET /repos/{owner}/{repo}` - Basic stats (stars, forks, watchers)
- `GET /repos/{owner}/{repo}/contributors` - Contributor list with commit counts
- `GET /repos/{owner}/{repo}/stats/contributors` - Detailed contribution stats (additions/deletions per week)
- `GET /repos/{owner}/{repo}/stats/commit_activity` - Weekly commit counts
- `GET /repos/{owner}/{repo}/stats/participation` - Owner vs all commit activity
- `GET /repos/{owner}/{repo}/languages` - Language breakdown

**Leaderboard Ideas:**

- 🏆 Top committers (last 30 days)
- 📈 Most lines added
- 🔥 Longest streak
- 🐛 Most issues closed
- 🔀 Most PRs merged

**Caching Considerations:**

- GitHub stats endpoints return 202 while computing (need retry logic)
- Cache results for 1 hour to avoid rate limits
- Consider storing in `repo_stats_cache` table

**Display Format:**

```text
📊 **facebook/react** Statistics

⭐ 220k stars  🍴 45k forks  👀 6.5k watchers
📝 1,200 open issues  🔀 180 open PRs

🏆 **Top Contributors (30 days)**
1. @gaearon - 45 commits (+2,340 / -890)
2. @acdlite - 38 commits (+1,200 / -450)
3. @sebmarkbage - 22 commits (+890 / -320)

📈 Activity: 156 commits this week (↑12% vs last week)
```

### GitHub Mentions → Towns Mentions Mapping (Priority 2)

Convert GitHub @mentions to Towns @mentions when the GitHub user is linked to a Towns account.

**Detection Points:**

- PR body / Issue body
- PR comments / Issue comments
- Review comments
- Review body

**Mapping Storage:**

Leverage existing `github_user_tokens` table which links `towns_user_id` ↔ `github_login`:

```sql
-- Already exists in github_user_tokens:
-- towns_user_id TEXT PRIMARY KEY
-- github_login TEXT  -- from OAuth profile
```

**Implementation Flow:**

```
Incoming comment/body text
  ↓
Regex extract @mentions: /@([a-zA-Z0-9_-]+)/g
  ↓
For each @mention:
  Lookup github_login in github_user_tokens
    ├─ Found → Replace with Towns @mention: <@{towns_user_id}>
    └─ Not found → Leave as plain text @username
  ↓
Send formatted message with Towns mentions array
```

**Message Format:**

```typescript
await handler.sendMessage(channelId, message, {
  mentions: [
    { userId: "0x123...", displayName: "alice" },
    { userId: "0x456...", displayName: "bob" },
  ],
});
```

**Edge Cases:**

- GitHub bot accounts (e.g., `@dependabot`) - leave as plain text
- Case sensitivity: GitHub usernames are case-insensitive
- Multiple mentions of same user - deduplicate in mentions array

### Label-Based Event Filtering (Priority 2)

Filter PR/Issue subscriptions by labels to reduce noise.

**Syntax:**

```bash
/github subscribe owner/repo --labels bug,security
/github subscribe owner/repo --labels "priority:high"
/github subscribe owner/repo --labels bug --events pr,issues
```

**Behavior:**

- Only deliver events where the PR/issue has at least one matching label
- Labels are checked at event delivery time (not subscription time)
- Applies to: `pr`, `issues`, `comments`, `reviews`, `review_comments`
- Does NOT apply to: `commits`, `ci`, `releases`, `branches`, `forks`, `stars`

**Database Changes (comments only):**

```sql
-- Add to github_subscriptions table
-- label_filter TEXT  -- NULL = no filter, else comma-separated labels
```

**Interaction with Other Features:**

- **PR Anchor Updates**: Label changes trigger anchor refresh, then check if subscription still matches
- **Thread Replies**: If PR loses matching label, existing thread continues (no orphaning)
- **Branch Filters**: Labels and branches are independent filters (AND logic)

**UI Considerations:**

- `/github status` should show label filters
- Warning if no events match filter in last 7 days

## References

- GitHub App Documentation: https://docs.github.com/apps
- Octokit SDK: https://github.com/octokit
- Towns Protocol: https://towns.com
- Render Deployment: https://render.com
