import { db } from "../db";
import { githubInstallations, installationRepositories } from "../db/schema";
import { eq, and } from "drizzle-orm";
import type {
  InstallationPayload,
  InstallationRepositoriesPayload,
} from "../types/webhooks";

/**
 * InstallationService - Manages GitHub App installation lifecycle
 *
 * Handles installation created/deleted events and repository changes.
 * Stores installation data in normalized tables (no JSON columns).
 * Does not send notifications - behavior changes are transparent to users.
 */
export class InstallationService {
  /**
   * Handle GitHub App installation created event
   */
  async onInstallationCreated(event: InstallationPayload) {
    const { installation, repositories } = event;

    // Get account info with proper type checking
    const account = installation.account;
    const accountLogin =
      (account && "login" in account ? account.login : account?.name) ??
      "unknown";
    const accountType =
      (account && "type" in account ? account.type : undefined) ??
      "Organization";

    console.log(`GitHub App installed: ${accountLogin} (${installation.id})`);

    // Store installation in database
    await db.insert(githubInstallations).values({
      installationId: installation.id,
      accountLogin,
      accountType,
      installedAt: new Date(),
      suspendedAt: null,
      appSlug: installation.app_slug || "towns-github-bot",
    });

    // Store repositories in normalized table
    if (repositories) {
      for (const repo of repositories) {
        if (!repo.full_name) continue;
        await db.insert(installationRepositories).values({
          installationId: installation.id,
          repoFullName: repo.full_name,
          addedAt: new Date(),
        });
      }
    }
  }

  /**
   * Handle GitHub App installation deleted event
   */
  async onInstallationDeleted(event: InstallationPayload) {
    const { installation } = event;

    // Get account info with proper type checking
    const account = installation.account;
    const accountLogin =
      (account && "login" in account ? account.login : account?.name) ??
      "unknown";

    console.log(`GitHub App uninstalled: ${accountLogin} (${installation.id})`);

    // Remove installation (foreign key CASCADE automatically deletes related repositories)
    await db
      .delete(githubInstallations)
      .where(eq(githubInstallations.installationId, installation.id));
  }

  /**
   * Handle repositories added to installation
   */
  async onRepositoriesAdded(event: InstallationRepositoriesPayload) {
    const { installation, repositories_added } = event;

    console.log(
      `Repositories added to installation ${installation.id}: ${repositories_added.map(r => r.full_name || "unknown").join(", ")}`
    );

    // Add new repositories to normalized table
    for (const repo of repositories_added) {
      if (!repo.full_name) continue;
      await db
        .insert(installationRepositories)
        .values({
          installationId: installation.id,
          repoFullName: repo.full_name,
          addedAt: new Date(),
        })
        .onConflictDoNothing();
    }
  }

  /**
   * Handle repositories removed from installation
   */
  async onRepositoriesRemoved(event: InstallationRepositoriesPayload) {
    const { installation, repositories_removed } = event;

    console.log(
      `Repositories removed from installation ${installation.id}: ${repositories_removed.map(r => r.full_name || "unknown").join(", ")}`
    );

    // Remove repositories from normalized table
    for (const repo of repositories_removed) {
      if (!repo.full_name) continue;
      await db
        .delete(installationRepositories)
        .where(
          and(
            eq(installationRepositories.installationId, installation.id),
            eq(installationRepositories.repoFullName, repo.full_name)
          )
        );
    }
  }

  /**
   * Check if a repository has GitHub App installed
   * Returns installation ID if installed, null otherwise
   */
  async isRepoInstalled(repo: string): Promise<number | null> {
    try {
      const installation = await db
        .select()
        .from(installationRepositories)
        .where(eq(installationRepositories.repoFullName, repo))
        .limit(1);

      return installation[0]?.installationId ?? null;
    } catch (error) {
      console.warn(
        `[InstallationService] Failed to check repo installation for ${repo}:`,
        error
      );
      return null;
    }
  }
}
