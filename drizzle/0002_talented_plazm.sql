CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand" text NOT NULL,
	"product_name" text NOT NULL,
	"total_price" numeric(10, 2) NOT NULL,
	"weight_grams" integer NOT NULL,
	"price_per_gram" numeric(10, 6) NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"in_stock" boolean DEFAULT true NOT NULL,
	"url" text NOT NULL,
	"last_update" timestamp with time zone NOT NULL,
	CONSTRAINT "products_url_unique" UNIQUE("url")
);
