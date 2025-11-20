CREATE TABLE IF NOT EXISTS "github_user_tokens" (
        "towns_user_id" text PRIMARY KEY NOT NULL,
        "github_user_id" integer NOT NULL,
        "github_login" text NOT NULL,
        "access_token" text NOT NULL,
        "token_type" text NOT NULL,
        "scope" text,
        "expires_at" timestamp with time zone,
        "refresh_token" text,
        "refresh_token_expires_at" timestamp with time zone,
        "created_at" timestamp with time zone NOT NULL,
        "updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth_states" (
        "state" text PRIMARY KEY NOT NULL,
        "towns_user_id" text NOT NULL,
        "channel_id" text NOT NULL,
        "space_id" text NOT NULL,
        "redirect_action" text,
        "redirect_data" text,
        "expires_at" timestamp with time zone NOT NULL,
        "created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_oauth_states_expires" ON "oauth_states" ("expires_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "github_subscriptions" (
        "id" serial PRIMARY KEY NOT NULL,
        "space_id" text NOT NULL,
        "channel_id" text NOT NULL,
        "repo_full_name" text NOT NULL,
        "delivery_mode" text NOT NULL,
        "is_private" boolean NOT NULL,
        "created_by_towns_user_id" text NOT NULL,
        "created_by_github_login" text,
        "installation_id" integer,
        "enabled" boolean DEFAULT true NOT NULL,
        "event_types" text DEFAULT 'pr,issues,commits,releases' NOT NULL,
        "created_at" timestamp with time zone NOT NULL,
        "updated_at" timestamp with time zone NOT NULL,
        CONSTRAINT "delivery_mode_check" CHECK ("delivery_mode" IN ('webhook','polling'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "github_subscriptions_unique_idx" ON "github_subscriptions" ("space_id","channel_id","repo_full_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_github_subscriptions_channel" ON "github_subscriptions" ("channel_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_github_subscriptions_repo" ON "github_subscriptions" ("repo_full_name");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "repo_polling_state" (
        "repo" text PRIMARY KEY NOT NULL,
        "etag" text,
        "last_event_id" text,
        "last_polled_at" timestamp with time zone,
        "updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "github_installations" (
        "installation_id" integer PRIMARY KEY NOT NULL,
        "account_login" text NOT NULL,
        "account_type" text NOT NULL,
        "installed_at" timestamp with time zone NOT NULL,
        "suspended_at" timestamp with time zone,
        "app_slug" text DEFAULT 'towns-github-bot' NOT NULL,
        CONSTRAINT "account_type_check" CHECK ("account_type" IN ('Organization','User'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "installation_repositories" (
        "installation_id" integer NOT NULL,
        "repo_full_name" text NOT NULL,
        "added_at" timestamp with time zone NOT NULL,
        CONSTRAINT "installation_repositories_pk" PRIMARY KEY("installation_id","repo_full_name")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_installation_repos_by_name" ON "installation_repositories" ("repo_full_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_installation_repos_by_install" ON "installation_repositories" ("installation_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
        "delivery_id" text PRIMARY KEY NOT NULL,
        "installation_id" integer,
        "event_type" text NOT NULL,
        "delivered_at" timestamp with time zone NOT NULL,
        "status" text DEFAULT 'pending' NOT NULL,
        "error" text,
        "retry_count" integer DEFAULT 0 NOT NULL,
        CONSTRAINT "status_check" CHECK ("status" IN ('pending','success','failed'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deliveries_status" ON "webhook_deliveries" ("status","delivered_at");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "installation_repositories" ADD CONSTRAINT "installation_repositories_installation_id_github_installations_installation_id_fk" FOREIGN KEY ("installation_id") REFERENCES "github_installations"("installation_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "github_subscriptions" ADD CONSTRAINT "github_subscriptions_created_by_towns_user_id_github_user_tokens_towns_user_id_fk" FOREIGN KEY ("created_by_towns_user_id") REFERENCES "github_user_tokens"("towns_user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "github_subscriptions" ADD CONSTRAINT "github_subscriptions_installation_id_github_installations_installation_id_fk" FOREIGN KEY ("installation_id") REFERENCES "github_installations"("installation_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

