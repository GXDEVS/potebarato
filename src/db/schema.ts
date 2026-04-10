export * from "./auth-schema";

import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
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
  purityLabel: text("purity_label"),
  lastUpdate: timestamp("last_update", { withTimezone: true }).notNull(),
});
