export const mockIssueResponse = {
  number: 123,
  title: "Test issue title",
  state: "open" as const,
  user: { login: "testuser" },
  comments: 5,
  labels: [{ name: "bug" }, { name: "priority:high" }],
  html_url: "https://github.com/owner/repo/issues/123",
};

export const mockPullRequestResponse = {
  number: 456,
  title: "Test PR title",
  state: "open" as const,
  merged: false,
  user: { login: "testuser" },
  additions: 100,
  deletions: 50,
  comments: 3,
  html_url: "https://github.com/owner/repo/pull/456",
};

export const mockClosedIssueResponse = {
  ...mockIssueResponse,
  number: 124,
  title: "Closed issue",
  state: "closed" as const,
};

export const mockIssueWithoutLabelsResponse = {
  ...mockIssueResponse,
  number: 125,
  title: "Issue without labels",
  labels: [],
};
