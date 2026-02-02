import { Octokit } from "@octokit/rest";

/** Language statistics for rendering cards */
export type TopLangData = Record<
  string,
  { name: string; color: string; size: number }
>;

/** Streak statistics for rendering streak cards */
export interface StreakStats {
  total: number;
  totalRange: [string, string]; // [first contribution date, today]
  curr: number;
  currDate: [string, string]; // [streak start, streak end]
  longest: number;
  longestDate: [string, string]; // [streak start, streak end]
}

/** Default color for languages without a defined color */
const DEFAULT_LANG_COLOR = "#858585";

/** Repository node from GraphQL response */
interface RepoNode {
  name: string;
  languages: {
    edges: Array<{
      size: number;
      node: {
        color: string | null;
        name: string;
      };
    }>;
  };
}

/** GraphQL response shape for language query */
interface LanguageGraphQLResponse {
  user: {
    repositories: {
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      nodes: RepoNode[];
    };
  };
}

/**
 * Fetch top languages for a GitHub user via GraphQL
 * Uses cursor-based pagination to fetch all repositories
 *
 * @param octokit - Authenticated Octokit instance
 * @param username - GitHub username
 * @returns Language statistics keyed by language name
 */
export async function fetchTopLanguages(
  octokit: Octokit,
  username: string
): Promise<TopLangData> {
  const query = `
    query userInfo($login: String!, $after: String) {
      user(login: $login) {
        repositories(ownerAffiliations: OWNER, isFork: false, first: 100, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            name
            languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
              edges {
                size
                node {
                  color
                  name
                }
              }
            }
          }
        }
      }
    }
  `;

  // Fetch all pages of repositories
  const allRepos: RepoNode[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const response: LanguageGraphQLResponse = await octokit.graphql(query, {
      login: username,
      after: cursor,
    });

    const { nodes, pageInfo } = response.user.repositories;
    allRepos.push(...nodes);
    hasNextPage = pageInfo.hasNextPage;
    cursor = pageInfo.endCursor;
  }

  // Process repositories into language totals
  const langTotals: TopLangData = {};

  for (const repo of allRepos) {
    for (const edge of repo.languages.edges) {
      const name = edge.node.name;
      if (langTotals[name]) {
        langTotals[name].size += edge.size;
      } else {
        langTotals[name] = {
          name,
          color: edge.node.color ?? DEFAULT_LANG_COLOR,
          size: edge.size,
        };
      }
    }
  }

  return langTotals;
}

/** GraphQL response shape for contributions query */
interface ContributionsGraphQLResponse {
  user: {
    createdAt: string;
    contributionsCollection: {
      contributionYears: number[];
      contributionCalendar: {
        weeks: Array<{
          contributionDays: Array<{
            contributionCount: number;
            date: string;
          }>;
        }>;
      };
    };
  };
}

/** Contribution day with count and date */
interface ContributionDay {
  count: number;
  date: string;
}

/**
 * Fetch streak statistics for a GitHub user
 *
 * @param octokit - Authenticated Octokit instance
 * @param username - GitHub username
 * @returns Streak statistics including current, longest, and total contributions
 */
export async function fetchStreakStats(
  octokit: Octokit,
  username: string
): Promise<StreakStats> {
  const query = `
    query ($login: String!, $start: DateTime!, $end: DateTime!) {
      user(login: $login) {
        createdAt
        contributionsCollection(from: $start, to: $end) {
          contributionYears
          contributionCalendar {
            weeks {
              contributionDays {
                contributionCount
                date
              }
            }
          }
        }
      }
    }
  `;

  // First, get the user's contribution years
  const now = new Date();
  const currentYear = now.getUTCFullYear();

  // Use UTC dates to avoid timezone shift when converting to ISO string
  const yearStartUTC = (year: number) =>
    new Date(Date.UTC(year, 0, 1)).toISOString();
  const yearEndUTC = (year: number) =>
    new Date(Date.UTC(year, 11, 31, 23, 59, 59)).toISOString();

  const initialResponse: ContributionsGraphQLResponse = await octokit.graphql(
    query,
    {
      login: username,
      start: yearStartUTC(currentYear),
      end: yearEndUTC(currentYear),
    }
  );

  const contributionYears =
    initialResponse.user.contributionsCollection.contributionYears;
  const accountCreated = new Date(initialResponse.user.createdAt);

  // Fetch contributions for all years
  const allContributions: ContributionDay[] = [];

  for (const year of contributionYears.sort((a, b) => a - b)) {
    // Reuse initialResponse for current year to avoid redundant API call
    let response: ContributionsGraphQLResponse;
    if (year === currentYear) {
      response = initialResponse;
    } else {
      response = await octokit.graphql(query, {
        login: username,
        start: yearStartUTC(year),
        end: yearEndUTC(year),
      });
    }

    for (const week of response.user.contributionsCollection
      .contributionCalendar.weeks) {
      for (const day of week.contributionDays) {
        allContributions.push({
          count: day.contributionCount,
          date: day.date,
        });
      }
    }
  }

  // Sort contributions by date
  allContributions.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Calculate streaks
  // Infer "today" from contribution data (last entry is user's current day in their GitHub timezone)
  // This avoids timezone mismatches between server UTC and user's local time
  const userToday = allContributions[allContributions.length - 1]?.date;
  const userYesterday = userToday
    ? formatDate(
        new Date(new Date(userToday + "T12:00:00Z").getTime() - 86400000)
      )
    : formatDate(now);
  const today = userToday ?? formatDate(now);
  const yesterday = userYesterday;

  let total = 0;
  let firstContribution: string | null = null;
  let currentStreak = 0;
  let currentStreakStart: string | null = null;
  let currentStreakEnd: string | null = null;
  let longestStreak = 0;
  let longestStreakStart: string | null = null;
  let longestStreakEnd: string | null = null;

  // Track streak in progress
  let tempStreak = 0;
  let tempStreakStart: string | null = null;

  for (const day of allContributions) {
    if (day.count > 0) {
      total += day.count;
      if (!firstContribution) {
        firstContribution = day.date;
      }

      if (tempStreak === 0) {
        tempStreakStart = day.date;
      }
      tempStreak++;
    } else {
      // Streak broken
      if (tempStreak > longestStreak) {
        longestStreak = tempStreak;
        longestStreakStart = tempStreakStart;
        const idx = allContributions.indexOf(day) - 1;
        longestStreakEnd = allContributions[idx]?.date;
      }
      tempStreak = 0;
      tempStreakStart = null;
    }
  }

  // Check final streak (if it ends at the last contribution)
  if (tempStreak > longestStreak) {
    longestStreak = tempStreak;
    longestStreakStart = tempStreakStart;
    longestStreakEnd = allContributions[allContributions.length - 1]?.date;
  }

  // Calculate current streak (must include today or yesterday)
  // Find where to start counting - today or yesterday must have contributions,
  // OR today can have 0 if yesterday has contributions (streak still active)
  let startIndex = -1;

  // Find today and yesterday in the contributions
  const todayIndex = allContributions.findIndex(d => d.date === today);
  const yesterdayIndex = allContributions.findIndex(d => d.date === yesterday);

  if (todayIndex !== -1 && allContributions[todayIndex].count > 0) {
    // Today has contributions - start from today
    startIndex = todayIndex;
    currentStreakEnd = today;
  } else if (
    yesterdayIndex !== -1 &&
    allContributions[yesterdayIndex].count > 0
  ) {
    // Today has 0 (or missing) but yesterday has contributions - streak is still active
    startIndex = yesterdayIndex;
    currentStreakEnd = yesterday;
  }

  if (startIndex !== -1) {
    // Count backwards from the start index
    for (let i = startIndex; i >= 0; i--) {
      const day = allContributions[i];

      // Check for gaps in dates
      if (i < startIndex) {
        const nextDay = allContributions[i + 1];
        const dayDiff =
          (new Date(nextDay.date).getTime() - new Date(day.date).getTime()) /
          86400000;
        if (dayDiff > 1) break;
      }

      if (day.count > 0) {
        currentStreak++;
        currentStreakStart = day.date;
      } else {
        break;
      }
    }
  }

  return {
    total,
    totalRange: [
      firstContribution ?? formatDate(accountCreated),
      today ?? formatDate(now),
    ],
    curr: currentStreak,
    currDate: [currentStreakStart ?? today, currentStreakEnd ?? today],
    longest: longestStreak,
    longestDate: [
      longestStreakStart ?? firstContribution ?? formatDate(accountCreated),
      longestStreakEnd ?? firstContribution ?? formatDate(accountCreated),
    ],
  };
}

/** Format date as YYYY-MM-DD */
function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}
