ALTER TABLE "orders" ADD COLUMN "checkout_key" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "stripe_checkout_session_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "stripe_payment_intent_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "checkout_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_checkout_key_idx" ON "orders" USING btree ("checkout_key");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_stripe_checkout_session_idx" ON "orders" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
-- Historical cart rows represented a quantity even though Biblio sells one
-- personal digital licence per book. Normalize them before enforcing the rule.
UPDATE "cart_items" SET "quantity" = 1 WHERE "quantity" <> 1;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_personal_license_quantity" CHECK ("cart_items"."quantity" = 1);