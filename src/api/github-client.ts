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
  count: number = 10
): Promise<GitHubPullRequest[]> {
  return githubFetch(
    `/repos/${repo}/pulls?state=all&per_page=${count}&sort=created&direction=desc`
  );
}

export async function listIssues(
  repo: string,
  count: number = 10
): Promise<GitHubIssue[]> {
  const actualIssues: GitHubIssue[] = [];
  let page = 1;
  const perPage = 100; // Max per page

  // Keep fetching pages until we have enough issues or run out of items
  while (actualIssues.length < count && page <= 10) {
    // Limit to 10 pages max
    const items = await githubFetch<GitHubIssue[]>(
      `/repos/${repo}/issues?state=all&per_page=${perPage}&page=${page}&sort=created&direction=desc`
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
