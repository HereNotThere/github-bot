# GitHub Bot for Towns

A comprehensive GitHub integration bot for Towns Protocol, similar to Slack's GitHub app.

## What This Bot Does

This bot brings GitHub notifications and interactions directly into your Towns channels using OAuth and GitHub App integration:

### 🔔 Real-Time Notifications

Receive instant webhook notifications for:

- **Pull Requests** - Opened, closed, merged
- **Issues** - Opened, closed
- **Pushes** - Commits to branches with details
- **Releases** - New releases published
- **CI/CD** - Workflow run status (success/failure)
- **Comments** - New comments on issues/PRs
- **Reviews** - PR review submissions
- **Branches** - Branch/tag creation and deletion
- **Forks** - Repository forks
- **Stars** - Repository stars (watch events)

### 💬 Interactive Commands

Query and subscribe to repositories using slash commands. See [Usage](#usage) section for detailed examples.

## Features

- **GitHub App Integration** - Official GitHub App with OAuth authentication
- **Dual Delivery Modes** - Real-time webhooks OR 5-minute polling fallback
- **OAuth-First Architecture** - Single OAuth flow; subscriptions are created as soon as the callback finishes
- **Private Repository Support** - Access private repos with user permissions (GitHub App installation required)
- **Smart Delivery** - Automatic webhook mode when GitHub App is installed
- **Event Filtering** - Subscribe to specific event types (pr, issues, commits, etc.)
- **Branch Filtering** - Filter events by branch patterns (main, release/\*, etc.)
- **Channel-Based Subscriptions** - Each channel has independent subscriptions
- **Persistent Storage** - PostgreSQL database with Drizzle ORM

## Usage

### Subscription Commands

```bash
# Subscribe to repository (first time: OAuth authentication required)
/github subscribe owner/repo

# Subscribe with specific event types
/github subscribe owner/repo --events pr,issues,commits

# Subscribe with branch filter
/github subscribe owner/repo --branches main,release/*

# View subscriptions
/github status

# Unsubscribe from a repository
/github unsubscribe owner/repo

# Remove specific event types from subscription
/github unsubscribe owner/repo --events pr,issues

# Disconnect GitHub account (also removes your subscriptions)
/github disconnect
```

First-time subscriptions open an OAuth window; after authorization the callback immediately creates the subscription, posts the delivery mode back into Towns, and shows the success page with webhook vs. polling status.

**Event types:** `pr`, `issues`, `commits`, `releases`, `ci`, `comments`, `reviews`, `branches`, `review_comments`, `forks`, `stars`, `all`

> **Comment routing:** `comments` includes both issue comments and PR conversation comments. `review_comments` covers inline code review comments AND also receives PR conversation comments (useful for PR-focused subscriptions without issue noise).

**Branch filter:** `--branches main,develop` or `--branches release/*` or `--branches all` (default: default branch only)

> Branch filtering applies to: `pr`, `commits`, `ci`, `reviews`, `review_comments`, `branches`. Other events (`issues`, `releases`, `comments`, `forks`, `stars`) are not branch-specific.

**Delivery modes:**

- With GitHub App installed: Real-time webhooks (instant)
- Without GitHub App: Polling mode (5-minute intervals)

> Private repositories always require the GitHub App to be installed on the target repo or organization. Public repositories can fall back to polling until the installation is completed.

### Query Commands

```bash
# Show single PR or issue
/gh_pr owner/repo 123         # Summary view
/gh_pr owner/repo #123 --full # Full description
/gh_issue owner/repo 456      # Summary view
/gh_issue owner/repo #456 --full # Full description

# List recent PRs or issues
/gh_pr list owner/repo 10                  # 10 most recent
/gh_pr list owner/repo 5 --state=open      # Filter by state
/gh_pr list owner/repo 10 --author=user    # Filter by author

/gh_issue list owner/repo 10               # 10 most recent
/gh_issue list owner/repo 5 --state=closed # Filter by state
/gh_issue list owner/repo 10 --creator=user # Filter by creator
```

**Filters:** `--state=open|closed|merged|all`, `--author=username`, `--creator=username`

## Supported GitHub Events

### Webhook Events (Real-Time)

- `pull_request` - Opened, closed, merged (threaded)
- `issues` - Opened, closed (threaded)
- `push` - Commits to branches
- `release` - Published
- `workflow_run` - CI/CD status
- `issue_comment` - Comments on issues and PR conversations (threaded; routes to `comments`, also `review_comments` for PRs)
- `pull_request_review` - PR reviews (threaded to PR)
- `pull_request_review_comment` - Inline code review comments (threaded to PR; routes to `review_comments`)
- `create` / `delete` - Branch/tag creation and deletion
- `fork` - Repository forks
- `watch` - Repository stars

### Polling Events (5-Minute Intervals)

All webhook events above except `workflow_run` (CI/CD) are also available via polling for repositories without the GitHub App installed. CI events require the GitHub App for real-time webhooks.

## Setup

### 1. Prerequisites

- Bun installed (`curl -fsSL https://bun.sh/install | bash`)
- PostgreSQL database (local Docker or hosted on Render/Neon)
- Towns bot created via Developer Portal (app.towns.com/developer)
- GitHub App created (required for private repos + real-time webhooks, optional for public-only polling)

### 2. Local Development Setup

1. **Clone and install dependencies**

   ```bash
   git clone <your-repo>
   cd github-bot
   bun install
   ```

2. **Configure environment variables**

   ```bash
   cp .env.sample .env
   ```

   Edit `.env` with your values:

   ```dotenv
   # Required
   APP_PRIVATE_DATA=<from Towns Developer Portal>
   JWT_SECRET=<from Towns Developer Portal>
   DATABASE_URL=postgresql://user:pass@host:5432/github-bot
   PUBLIC_URL=https://your-bot.onrender.com
   ```

   > **Note:** See `CONTRIBUTING.md` for all configuration options including GitHub App setup, database options, and development settings.

3. **Start Postgres locally for development**

   Start the database with:

   ```bash
   bun db:up
   ```

   This creates a container with a named volume so your data persists across restarts.

   To stop the database:

   ```bash
   bun db:down
   ```

   Then point your `.env` at the container:

   ```dotenv
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/github-bot
   DATABASE_SSL=false
   ```

4. **Database migrations** (automatic on startup)

   Migrations run automatically when the bot starts. The database schema is created on first run.

   Manual migration commands (if needed):

   ```bash
   bun run db:generate   # Generate new migrations from schema changes
   bun run db:migrate    # Run pending migrations
   bun run db:push       # Push schema directly (dev only)
   ```

5. **Run the bot locally**

   ```bash
   bun run dev
   ```

6. **Expose webhook with ngrok** (for testing)

   ```bash
   ngrok http 5123
   ```

7. **Update webhook URL in Developer Portal**
   - Set to: `https://your-ngrok-url.ngrok-free.app/webhook`

## GitHub App Setup

The bot supports two delivery modes:

- **Polling mode** - Checks every 5 minutes (default, no setup required)
- **Webhook mode** - Instant notifications (requires GitHub App installation)

> **For GitHub App setup:** See `CONTRIBUTING.md` for detailed instructions on creating and configuring a GitHub App.

## Production Deployment

1. **Push to GitHub**
2. **Deploy to Render/Railway/Fly.io**
3. **Set environment variables** in hosting platform
4. **Update webhook URL** in Developer Portal
5. **Test with `/help` command**

## Current Limitations

- **No interactive actions** - Towns Protocol doesn't support buttons/forms yet
- **5-minute polling delay** - Without GitHub App, events have 5-minute latency

## Future Enhancements

### Completed

- [x] Automatic subscription upgrade when GitHub App is installed
- [x] Private repo support for `/gh_pr` and `/gh_issue` commands
- [x] Improved subscription UX - Single OAuth flow with immediate subscription creation
- [x] Enhanced OAuth success page - Installation countdown and auto-redirect
- [x] Pending subscriptions for private repos - Auto-complete when GitHub App is installed
- [x] OAuth token renewal - Automatic refresh with 5-minute buffer before expiration
- [x] Granular unsubscribe - `/github unsubscribe owner/repo --events pr,issues`
- [x] Subscription management - `/github subscribe owner/repo --events releases` adds to existing
- [x] Branch-specific filtering - `--branches main,release/*` with glob pattern support

### Event Organization

- [x] Thread-based event grouping - Group related events (PR + commits + CI) in threads
- [x] **Dynamic PR anchor updates** - Update anchor message when PR metadata changes (title, state, labels, assignees, reviews, CI)
- [ ] **Mentions support** - Convert GitHub @mentions to Towns @mentions when users are linked
- [ ] **Label filters** - Filter subscriptions by PR/issue labels (`--labels bug,security`)
- [ ] Event summaries - Digest multiple events into single update message

### Commands & Queries

- [ ] `/gh_stat owner/repo` - Repository statistics and contributor leaderboard
- [ ] More slash commands (`/gh search`, `/gh_release list`)
- [ ] PR/Issue status commands (`/gh_pr merge`, `/gh_issue close`)
- [ ] Advanced filtering (labels, assignees, milestones)

### Automation

- [ ] Scheduled digests (daily/weekly summaries)
