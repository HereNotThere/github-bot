CREATE TABLE "event_threads" (
	"id" serial PRIMARY KEY NOT NULL,
	"space_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"repo_full_name" text NOT NULL,
	"anchor_type" text NOT NULL,
	"anchor_number" integer NOT NULL,
	"thread_event_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "anchor_type_check" CHECK ("event_threads"."anchor_type" IN ('pr', 'issue'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "event_threads_unique_idx" ON "event_threads" USING btree ("space_id","channel_id","repo_full_name","anchor_type","anchor_number");--> statement-breakpoint
CREATE INDEX "idx_event_threads_repo_anchor" ON "event_threads" USING btree ("repo_full_name","anchor_type","anchor_number");--> statement-breakpoint
CREATE INDEX "idx_event_threads_expires" ON "event_threads" USING btree ("expires_at");