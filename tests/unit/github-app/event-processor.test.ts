import { describe, expect, mock, test } from "bun:test";

import type { EventType } from "../../../src/constants";
import type { GitHubApp } from "../../../src/github-app/app";
import {
  EventProcessor,
  matchesBranchFilter,
} from "../../../src/github-app/event-processor";
import type { MessageDeliveryService } from "../../../src/services/message-delivery-service";
import type { SubscriptionService } from "../../../src/services/subscription-service";
import type { IssueCommentPayload } from "../../../src/types/webhooks";

describe("matchesBranchFilter", () => {
  const defaultBranch = "main";

  describe("null filter (default branch only)", () => {
    test("matches the default branch", () => {
      expect(matchesBranchFilter("main", null, defaultBranch)).toBe(true);
    });

    test("does not match other branches", () => {
      expect(matchesBranchFilter("develop", null, defaultBranch)).toBe(false);
      expect(matchesBranchFilter("feature/foo", null, defaultBranch)).toBe(
        false
      );
    });
  });

  describe("'all' filter", () => {
    test("matches any branch", () => {
      expect(matchesBranchFilter("main", "all", defaultBranch)).toBe(true);
      expect(matchesBranchFilter("develop", "all", defaultBranch)).toBe(true);
      expect(matchesBranchFilter("feature/foo", "all", defaultBranch)).toBe(
        true
      );
      expect(matchesBranchFilter("release/v1.0", "all", defaultBranch)).toBe(
        true
      );
    });
  });

  describe("exact pattern", () => {
    test("matches exact branch name", () => {
      expect(matchesBranchFilter("main", "main", defaultBranch)).toBe(true);
    });

    test("does not match different branch", () => {
      expect(matchesBranchFilter("develop", "main", defaultBranch)).toBe(false);
    });

    test("does not match partial name", () => {
      expect(matchesBranchFilter("main2", "main", defaultBranch)).toBe(false);
      expect(matchesBranchFilter("mains", "main", defaultBranch)).toBe(false);
    });
  });

  describe("multiple patterns", () => {
    test("matches any of the patterns", () => {
      expect(matchesBranchFilter("main", "main,develop", defaultBranch)).toBe(
        true
      );
      expect(
        matchesBranchFilter("develop", "main,develop", defaultBranch)
      ).toBe(true);
    });

    test("does not match if none match", () => {
      expect(
        matchesBranchFilter("feature/foo", "main,develop", defaultBranch)
      ).toBe(false);
    });

    test("handles whitespace in patterns", () => {
      expect(
        matchesBranchFilter("develop", "main, develop", defaultBranch)
      ).toBe(true);
      expect(
        matchesBranchFilter("develop", "main , develop", defaultBranch)
      ).toBe(true);
    });
  });

  describe("glob patterns", () => {
    test("matches release/* pattern", () => {
      expect(
        matchesBranchFilter("release/v1.0", "release/*", defaultBranch)
      ).toBe(true);
      expect(
        matchesBranchFilter("release/v2.0.0", "release/*", defaultBranch)
      ).toBe(true);
    });

    test("does not match non-matching branches", () => {
      expect(matchesBranchFilter("main", "release/*", defaultBranch)).toBe(
        false
      );
      expect(
        matchesBranchFilter("releases/v1.0", "release/*", defaultBranch)
      ).toBe(false);
    });

    test("matches feature-* pattern", () => {
      expect(
        matchesBranchFilter("feature-foo", "feature-*", defaultBranch)
      ).toBe(true);
      expect(
        matchesBranchFilter("feature-bar-baz", "feature-*", defaultBranch)
      ).toBe(true);
    });

    test("matches hotfix/* pattern", () => {
      expect(
        matchesBranchFilter("hotfix/urgent-fix", "hotfix/*", defaultBranch)
      ).toBe(true);
    });
  });

  describe("mixed exact and glob patterns", () => {
    test("matches exact or glob pattern", () => {
      const filter = "main,release/*";
      expect(matchesBranchFilter("main", filter, defaultBranch)).toBe(true);
      expect(matchesBranchFilter("release/v1.0", filter, defaultBranch)).toBe(
        true
      );
      expect(matchesBranchFilter("develop", filter, defaultBranch)).toBe(false);
    });

    test("matches complex mixed pattern", () => {
      const filter = "main,develop,release/*,hotfix/*";
      expect(matchesBranchFilter("main", filter, defaultBranch)).toBe(true);
      expect(matchesBranchFilter("develop", filter, defaultBranch)).toBe(true);
      expect(matchesBranchFilter("release/v1.0", filter, defaultBranch)).toBe(
        true
      );
      expect(matchesBranchFilter("hotfix/fix", filter, defaultBranch)).toBe(
        true
      );
      expect(matchesBranchFilter("feature/foo", filter, defaultBranch)).toBe(
        false
      );
    });
  });
});

describe("PR comment routing", () => {
  // Helper to create minimal IssueCommentPayload for testing
  const createIssueCommentPayload = (
    isPrComment: boolean
  ): IssueCommentPayload =>
    ({
      action: "created",
      repository: {
        full_name: "owner/repo",
        default_branch: "main",
      },
      issue: {
        number: 123,
        // GitHub includes pull_request field only for PR comments
        ...(isPrComment ? { pull_request: { url: "https://..." } } : {}),
      },
      comment: {
        id: 456,
        updated_at: new Date().toISOString(),
      },
    }) as unknown as IssueCommentPayload;

  // Helper to create mock services
  const createMocks = (channels: Array<{ eventTypes: EventType[] }>) => {
    const deliveredChannels: string[] = [];

    const mockSubscriptionService = {
      getRepoSubscribers: mock(() =>
        Promise.resolve(
          channels.map((ch, i) => ({
            channelId: `channel-${i}`,
            spaceId: `space-${i}`,
            eventTypes: ch.eventTypes,
            branchFilter: "all" as const,
          }))
        )
      ),
    } as unknown as SubscriptionService;

    const mockMessageDeliveryService = {
      deliver: mock(({ channelId }: { channelId: string }) => {
        deliveredChannels.push(channelId);
        return Promise.resolve();
      }),
    } as unknown as MessageDeliveryService;

    const mockGitHubApp = {} as GitHubApp;

    const processor = new EventProcessor(
      mockGitHubApp,
      mockSubscriptionService,
      mockMessageDeliveryService
    );

    return { processor, deliveredChannels };
  };

  test("channel subscribed to 'comments' receives PR conversation comment", async () => {
    const { processor, deliveredChannels } = createMocks([
      { eventTypes: ["comments"] },
    ]);

    await processor.onIssueComment(createIssueCommentPayload(true));

    expect(deliveredChannels).toContain("channel-0");
  });

  test("channel subscribed to 'review_comments' receives PR conversation comment", async () => {
    const { processor, deliveredChannels } = createMocks([
      { eventTypes: ["review_comments"] },
    ]);

    await processor.onIssueComment(createIssueCommentPayload(true));

    expect(deliveredChannels).toContain("channel-0");
  });

  test("channel subscribed to 'review_comments' does NOT receive issue comment", async () => {
    const { processor, deliveredChannels } = createMocks([
      { eventTypes: ["review_comments"] },
    ]);

    await processor.onIssueComment(createIssueCommentPayload(false));

    expect(deliveredChannels).not.toContain("channel-0");
  });

  test("both subscribers receive PR conversation comment", async () => {
    const { processor, deliveredChannels } = createMocks([
      { eventTypes: ["comments"] },
      { eventTypes: ["review_comments"] },
    ]);

    await processor.onIssueComment(createIssueCommentPayload(true));

    expect(deliveredChannels).toContain("channel-0");
    expect(deliveredChannels).toContain("channel-1");
    expect(deliveredChannels.length).toBe(2);
  });

  test("channel without comment subscriptions does not receive comment", async () => {
    const { processor, deliveredChannels } = createMocks([
      { eventTypes: ["pr", "issues"] },
    ]);

    await processor.onIssueComment(createIssueCommentPayload(true));

    expect(deliveredChannels.length).toBe(0);
  });
});
