CREATE TABLE "stripe_sync_log" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"order_id" text NOT NULL,
	"stripe_payment_intent_id" text NOT NULL,
	"status" text NOT NULL,
	"issue_count" integer DEFAULT 0 NOT NULL,
	"details" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_sync_log_issue_count_non_negative" CHECK ("stripe_sync_log"."issue_count" >= 0),
	CONSTRAINT "stripe_sync_log_status_valid" CHECK ("stripe_sync_log"."status" in ('matched', 'mismatch', 'remote_missing', 'remote_error'))
);
--> statement-breakpoint
ALTER TABLE "stripe_sync_log" ADD CONSTRAINT "stripe_sync_log_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stripe_sync_log_run_idx" ON "stripe_sync_log" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "stripe_sync_log_order_idx" ON "stripe_sync_log" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "stripe_sync_log_status_idx" ON "stripe_sync_log" USING btree ("status");--> statement-breakpoint
-- The operational audit record is insert-only for every ordinary database role.
-- The database owner still controls schema migrations, as is unavoidable in PostgreSQL.
CREATE OR REPLACE FUNCTION public.reject_stripe_sync_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'stripe_sync_log is append-only; % is not allowed', TG_OP
    USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER stripe_sync_log_append_only
BEFORE UPDATE OR DELETE ON "stripe_sync_log"
FOR EACH ROW
EXECUTE FUNCTION public.reject_stripe_sync_log_mutation();--> statement-breakpoint
REVOKE UPDATE, DELETE ON TABLE "stripe_sync_log" FROM PUBLIC;
