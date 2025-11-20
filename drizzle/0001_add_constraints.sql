-- Migration: Add database constraints for data integrity and performance
-- Adds unique constraint on github_user_id and index on oauth_states.towns_user_id

-- Add unique index on github_user_id to enforce 1:1 mapping
-- This prevents multiple Towns users from linking to the same GitHub account
CREATE UNIQUE INDEX IF NOT EXISTS "github_user_tokens_github_user_id_unique"
ON "github_user_tokens" ("github_user_id");

-- Add index on oauth_states.towns_user_id for query performance
CREATE INDEX IF NOT EXISTS "idx_oauth_states_towns_user_id"
ON "oauth_states" ("towns_user_id");
