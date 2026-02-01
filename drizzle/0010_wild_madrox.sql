ALTER TABLE "oauth_states" ADD COLUMN "redirect" text;--> statement-breakpoint
ALTER TABLE "oauth_states" DROP COLUMN "redirect_action";--> statement-breakpoint
ALTER TABLE "oauth_states" DROP COLUMN "redirect_data";