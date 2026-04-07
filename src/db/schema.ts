export * from "./auth-schema";

import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  brand: text("brand").notNull(),
  productName: text("product_name").notNull(),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),
  weightGrams: integer("weight_grams").notNull(),
  pricePerGram: numeric("price_per_gram", { precision: 10, scale: 6 }).notNull(),
  currency: text("currency").notNull().default("BRL"),
  inStock: boolean("in_stock").notNull().default(true),
  url: text("url").notNull().unique(),
  imageUrl: text("image_url"),
  previousPrice: numeric("previous_price", { precision: 10, scale: 2 }),
  lastUpdate: timestamp("last_update", { withTimezone: true }).notNull(),
}, (t) => [
  index("idx_products_brand").on(t.brand),
  index("idx_products_last_update").on(t.lastUpdate),
  index("idx_products_product_name").on(t.productName),
]);

export const priceHistory = pgTable("price_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),
  pricePerGram: numeric("price_per_gram", { precision: 10, scale: 6 }).notNull(),
  scrapedAt: timestamp("scraped_at", { withTimezone: true }).notNull(),
}, (t) => [
  index("idx_price_history_product_scraped").on(t.productId, t.scrapedAt),
]);
