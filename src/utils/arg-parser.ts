import { stripMarkdown } from "./stripper";

export interface FilterOptions {
  state?: string;
  author?: string;
  creator?: string;
}

export interface ParsedCommandArgs {
  repo: string;
  count: number;
  filters: FilterOptions;
}

export function parseCommandArgs(args: string[]): ParsedCommandArgs {
  const filters: FilterOptions = {};
  let repo = "";
  let count = 10;

  for (const arg of args) {
    if (arg.startsWith("--")) {
      // Parse flag: --key=value
      const flagContent = arg.substring(2);
      const equalIndex = flagContent.indexOf("=");

      if (equalIndex === -1) {
        continue; // Skip flags without values
      }

      const key = flagContent.substring(0, equalIndex);
      const value = stripMarkdown(flagContent.substring(equalIndex + 1));

      if (key === "state" || key === "author" || key === "creator") {
        filters[key] = value;
      }
    } else if (!repo) {
      repo = stripMarkdown(arg);
    } else {
      // Always parse count, even if it results in NaN for validation
      count = parseInt(stripMarkdown(arg));
    }
  }

  return { repo, count, filters };
}

export function validatePrFilters(filters: FilterOptions): string | null {
  if (filters.state) {
    const validStates = ["open", "closed", "merged", "all"];
    if (!validStates.includes(filters.state)) {
      return `Invalid state: '${filters.state}'. Use: open, closed, merged, or all`;
    }
  }

  if (filters.creator) {
    return "Invalid filter: 'creator' is only for issues. Use --author for PRs";
  }

  return null;
}

export function validateIssueFilters(filters: FilterOptions): string | null {
  if (filters.state) {
    const validStates = ["open", "closed", "all"];
    if (!validStates.includes(filters.state)) {
      return `Invalid state: '${filters.state}'. Use: open, closed, or all`;
    }
  }

  if (filters.author) {
    return "Invalid filter: 'author' is only for PRs. Use --creator for issues";
  }

  return null;
}
