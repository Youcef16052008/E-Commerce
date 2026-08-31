ALTER TABLE "order_items" ALTER COLUMN "currency" SET DEFAULT 'usd';--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "currency" SET DEFAULT 'usd';--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "quantity" integer DEFAULT 1 NOT NULL;