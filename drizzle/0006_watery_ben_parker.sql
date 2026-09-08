DROP INDEX "products_source_idx";--> statement-breakpoint
DROP INDEX "stripe_events_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "orders_stripe_payment_intent_idx" ON "orders" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_source_source_id_idx" ON "products" USING btree ("source","source_id");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_price_non_negative" CHECK ("order_items"."price_in_cents" >= 0);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_positive" CHECK ("order_items"."quantity" >= 1);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_currency_usd" CHECK (lower("order_items"."currency") = 'usd');--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_non_negative" CHECK ("orders"."total_in_cents" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_currency_usd" CHECK (lower("orders"."currency") = 'usd');--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_status_valid" CHECK ("orders"."status" in ('pending', 'paid', 'fulfilled', 'refund_pending', 'failed', 'refunded'));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_price_non_negative" CHECK ("products"."price_in_cents" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_currency_usd" CHECK (lower("products"."currency") = 'usd');--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_non_negative" CHECK ("refunds"."amount_in_cents" >= 0);--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_currency_usd" CHECK (lower("refunds"."currency") = 'usd');--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_status_valid" CHECK ("refunds"."status" in ('pending', 'succeeded', 'failed'));