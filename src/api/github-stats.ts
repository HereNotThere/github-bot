import { Octokit } from "@octokit/rest";

/** Language statistics for rendering cards */
export type TopLangData = Record<
  string,
  { name: string; color: string; size: number }
>;

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
