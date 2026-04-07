ALTER TABLE "session" ADD COLUMN "impersonated_by" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'user';--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "banned" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "ban_reason" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "ban_expires" timestamp;--> statement-breakpoint
CREATE INDEX "idx_products_brand" ON "products" USING btree ("brand");--> statement-breakpoint
CREATE INDEX "idx_products_last_update" ON "products" USING btree ("last_update");--> statement-breakpoint
CREATE INDEX "idx_products_product_name" ON "products" USING btree ("product_name");