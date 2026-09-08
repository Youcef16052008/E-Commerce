CREATE TABLE "stripe_sync_log" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"event_id" text NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL DEFAULT 'success',
	"details" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_sync_log_event_id_idx" ON "stripe_sync_log" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "stripe_sync_log_event_type_idx" ON "stripe_sync_log" USING btree ("event_type");
