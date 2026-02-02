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

### 📊 GitHub Stats Card

Generate dynamic language stats cards for your profile README. See [GitHub Stats Card](#github-stats-card) section for setup.

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

## GitHub Stats Card

Generate a dynamic language stats card for your GitHub profile README.

1. **[Connect your GitHub account](https://github-bot-omega.onrender.com/stats/connect)**
2. **Add to your README:**
   ```markdown
   ![Top Languages](https://github-bot-omega.onrender.com/stats/top-langs?username=YOUR_USERNAME)
   ```

| Parameter         | Values                                                                                                                      | Description                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `theme`           | `default`, `dark`, `radical`, `merko`, `gruvbox`, `tokyonight`, `onedark`, `cobalt`, `synthwave`, `highcontrast`, `dracula` | Color theme                 |
| `layout`          | `normal`, `compact`, `donut`, `donut-vertical`, `pie`                                                                       | Card layout                 |
| `langs_count`     | `1-20`                                                                                                                      | Number of languages         |
| `hide`            | `javascript,html`                                                                                                           | Languages to hide           |
| `hide_title`      | `true`                                                                                                                      | Hide the title              |
| `hide_border`     | `true`                                                                                                                      | Hide the border             |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, configuration options, GitHub App creation, and deployment instructions.

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
