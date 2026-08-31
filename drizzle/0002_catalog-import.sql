--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "license" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "downloads" integer;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "currency" SET DEFAULT 'usd';--> statement-breakpoint
CREATE INDEX "products_title_idx" ON "products" USING btree ("title");--> statement-breakpoint
CREATE INDEX "products_source_idx" ON "products" USING btree ("source","source_id");
