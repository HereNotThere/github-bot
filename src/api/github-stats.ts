import { Octokit } from "@octokit/rest";

/** Language statistics for rendering cards */
export type TopLangData = Record<
  string,
  { name: string; color: string; size: number }
>;

/** Default color for languages without a defined color */
const DEFAULT_LANG_COLOR = "#858585";

/** GraphQL response shape for language query */
interface LanguageGraphQLResponse {
  user: {
    repositories: {
      nodes: Array<{
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
      }>;
    };
  };
}

/** Options for fetching top languages */
export interface FetchTopLanguagesOptions {
  /** Include private repositories (default: false, public only) */
  includePrivate?: boolean;
}

/**
 * Fetch top languages for a GitHub user via GraphQL
 *
 * @param octokit - Authenticated Octokit instance
 * @param username - GitHub username
 * @param options - Fetch options
 * @returns Language statistics keyed by language name
 */
export async function fetchTopLanguages(
  octokit: Octokit,
  username: string,
  options: FetchTopLanguagesOptions = {}
): Promise<TopLangData> {
  const { includePrivate = false } = options;

  // Build repository arguments - always exclude forks, optionally filter by privacy
  const repoArgs = includePrivate
    ? "ownerAffiliations: OWNER, isFork: false, first: 100"
    : "ownerAffiliations: OWNER, isFork: false, first: 100, privacy: PUBLIC";

  const query = `
    query userInfo($login: String!) {
      user(login: $login) {
        repositories(${repoArgs}) {
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

  const response = await octokit.graphql<LanguageGraphQLResponse>(query, {
    login: username,
  });

  // Process repositories into language totals
  const langTotals: TopLangData = {};

  for (const repo of response.user.repositories.nodes) {
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
