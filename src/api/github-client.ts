import type { GitHubIssue, GitHubPullRequest } from "./github-types";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_API = "https://api.github.com";

export async function githubFetch<T = unknown>(path: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };

  if (GITHUB_TOKEN) {
    headers.Authorization = `token ${GITHUB_TOKEN}`;
  }

  const response = await fetch(`${GITHUB_API}${path}`, { headers });

  if (!response.ok) {
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText}`
    );
  }

  return (await response.json()) as T;
}

export async function validateRepo(repo: string): Promise<boolean> {
  try {
    await githubFetch(`/repos/${repo}`);
    return true;
  } catch {
    return false;
  }
}

export async function getIssue(
  repo: string,
  issueNumber: string
): Promise<GitHubIssue> {
  return githubFetch<GitHubIssue>(`/repos/${repo}/issues/${issueNumber}`);
}

export async function getPullRequest(
  repo: string,
  prNumber: string
): Promise<GitHubPullRequest> {
  return githubFetch<GitHubPullRequest>(`/repos/${repo}/pulls/${prNumber}`);
}

export async function listPullRequests(
  repo: string,
  count: number = 10,
  filters?: { state?: string; author?: string }
): Promise<GitHubPullRequest[]> {
  const results: GitHubPullRequest[] = [];
  let page = 1;
  const perPage = 100;
  const maxPages = 10;

  // Build API query
  let apiState = "all";
  if (filters?.state === "open" || filters?.state === "closed") {
    apiState = filters.state;
  }

  // Loop until we have enough results or run out of pages
  while (results.length < count && page <= maxPages) {
    const prs = await githubFetch<GitHubPullRequest[]>(
      `/repos/${repo}/pulls?state=${apiState}&per_page=${perPage}&page=${page}&sort=created&direction=desc`
    );

    if (prs.length === 0) break;

    // Apply client-side filters
    let filtered = prs;

    // Filter by merged state (API doesn't distinguish merged from closed)
    if (filters?.state === "merged") {
      filtered = filtered.filter(pr => pr.merged_at !== null);
    }

    // Filter by author (API doesn't support this natively)
    if (filters?.author) {
      filtered = filtered.filter(
        pr => pr.user.login.toLowerCase() === filters.author!.toLowerCase()
      );
    }

    results.push(...filtered);
    page++;
  }

  return results.slice(0, count);
}

export async function listIssues(
  repo: string,
  count: number = 10,
  filters?: { state?: string; creator?: string }
): Promise<GitHubIssue[]> {
  const actualIssues: GitHubIssue[] = [];
  let page = 1;
  const perPage = 100; // Max per page

  // Build API query with filters
  const apiState = filters?.state || "all";
  const creatorParam = filters?.creator ? `&creator=${filters.creator}` : "";

  // Keep fetching pages until we have enough issues or run out of items
  while (actualIssues.length < count && page <= 10) {
    // Limit to 10 pages max
    const items = await githubFetch<GitHubIssue[]>(
      `/repos/${repo}/issues?state=${apiState}${creatorParam}&per_page=${perPage}&page=${page}&sort=created&direction=desc`
    );

    // No more items available
    if (items.length === 0) {
      break;
    }

    // Filter out pull requests
    const issues = items.filter(item => !item.pull_request);
    actualIssues.push(...issues);

    page++;
  }

  return actualIssues.slice(0, count);
}
