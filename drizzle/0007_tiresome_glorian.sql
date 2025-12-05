CREATE TABLE "message_mappings" (
	"space_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"repo_full_name" text NOT NULL,
	"github_entity_type" text NOT NULL,
	"github_entity_id" text NOT NULL,
	"parent_type" text,
	"parent_number" integer,
	"towns_message_id" text NOT NULL,
	"github_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "message_mappings_space_id_channel_id_repo_full_name_github_entity_type_github_entity_id_pk" PRIMARY KEY("space_id","channel_id","repo_full_name","github_entity_type","github_entity_id"),
	CONSTRAINT "entity_type_check" CHECK ("message_mappings"."github_entity_type" IN ('pr', 'issue', 'comment', 'review', 'review_comment')),
	CONSTRAINT "parent_type_check" CHECK ("message_mappings"."parent_type" IS NULL OR "message_mappings"."parent_type" IN ('pr', 'issue'))
);
--> statement-breakpoint
CREATE INDEX "idx_message_mappings_expires" ON "message_mappings" USING btree ("expires_at");