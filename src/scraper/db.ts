import { db } from "@/db";
import { products } from "@/db/schema";
import { sql } from "drizzle-orm";
import type { ProductData } from "./types";

export async function upsertProducts(data: ProductData[]): Promise<number> {
  if (data.length === 0) return 0;

  let upserted = 0;

  for (const product of data) {
    await db
      .insert(products)
      .values({
        brand: product.brand,
        productName: product.productName,
        totalPrice: product.totalPrice.toFixed(2),
        cashPrice: product.cashPrice != null ? product.cashPrice.toFixed(2) : null,
        weightGrams: product.weightGrams,
        pricePerGram: product.pricePerGram.toFixed(6),
        currency: product.currency,
        inStock: product.inStock,
        url: product.url,
        imageUrl: product.imageUrl,
        purityLabel: product.purityLabel,
        lastUpdate: product.lastUpdate,
      })
      .onConflictDoUpdate({
        target: products.url,
        set: {
          brand: sql`excluded.brand`,
          productName: sql`excluded.product_name`,
          totalPrice: sql`excluded.total_price`,
          cashPrice: sql`excluded.cash_price`,
          weightGrams: sql`excluded.weight_grams`,
          pricePerGram: sql`excluded.price_per_gram`,
          currency: sql`excluded.currency`,
          inStock: sql`excluded.in_stock`,
          imageUrl: sql`excluded.image_url`,
          purityLabel: sql`excluded.purity_label`,
          lastUpdate: sql`excluded.last_update`,
        },
      });
    upserted++;
  }

  console.log(`[db] Upserted ${upserted} products`);
  return upserted;
}
