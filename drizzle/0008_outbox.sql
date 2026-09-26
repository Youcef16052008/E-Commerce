CREATE TABLE "mail_log" (
	"id" text PRIMARY KEY NOT NULL,
	"tag" text NOT NULL,
	"order_id" text NOT NULL,
	"recipient" text NOT NULL,
	"provider" text NOT NULL,
	"delivered" boolean DEFAULT false NOT NULL,
	"message_id" text,
	"error" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_log_tag_unique" UNIQUE("tag")
);
--> statement-breakpoint
CREATE TABLE "outbox_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"result" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "outbox_jobs_attempts_non_negative" CHECK ("outbox_jobs"."attempts" >= 0),
	CONSTRAINT "outbox_jobs_status_valid" CHECK ("outbox_jobs"."status" in ('pending', 'running', 'done', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "payment_exception_rows" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"order_id" text NOT NULL,
	"product_id" text DEFAULT '' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "mail_log" ADD CONSTRAINT "mail_log_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_exception_rows" ADD CONSTRAINT "payment_exception_rows_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mail_log_order_idx" ON "mail_log" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "outbox_jobs_status_run_after_idx" ON "outbox_jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_exception_rows_key_idx" ON "payment_exception_rows" USING btree ("kind","order_id","product_id");--> statement-breakpoint
CREATE INDEX "payment_exception_rows_open_idx" ON "payment_exception_rows" USING btree ("resolved_at");