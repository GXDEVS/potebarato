CREATE TABLE "price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"total_price" numeric(10, 2) NOT NULL,
	"price_per_gram" numeric(10, 6) NOT NULL,
	"scraped_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_price_history_product_scraped" ON "price_history" USING btree ("product_id","scraped_at");