-- Migration 0004: Email sync fields for Gmail integration
-- Adds email sync toggle + history tracking to google_connections
-- Adds email metadata columns to interactions for Gmail inbox sync

--> statement-breakpoint
ALTER TABLE "google_connections" ADD COLUMN IF NOT EXISTS "email_sync_enabled" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "google_connections" ADD COLUMN IF NOT EXISTS "history_id" text;
--> statement-breakpoint
ALTER TABLE "google_connections" ADD COLUMN IF NOT EXISTS "last_synced_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "interactions" ADD COLUMN IF NOT EXISTS "email_message_id" text;
--> statement-breakpoint
ALTER TABLE "interactions" ADD COLUMN IF NOT EXISTS "email_thread_id" text;
--> statement-breakpoint
ALTER TABLE "interactions" ADD COLUMN IF NOT EXISTS "email_subject" text;
--> statement-breakpoint
ALTER TABLE "interactions" ADD COLUMN IF NOT EXISTS "email_direction" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "interactions_email_message_id_uniq"
  ON "interactions" ("email_message_id")
  WHERE "email_message_id" IS NOT NULL;
