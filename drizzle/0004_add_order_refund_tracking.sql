ALTER TABLE "orders" ADD COLUMN "stripe_refund_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refund_amount_in_cents" integer;--> statement-breakpoint
CREATE INDEX "orders_stripe_refund_id_idx" ON "orders" USING btree ("stripe_refund_id");
