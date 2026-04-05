import { db } from "@/db";
import { products, priceHistory } from "@/db/schema";
import { sql, eq, inArray } from "drizzle-orm";
import type { ProductData } from "./types";

const BATCH_SIZE = 50;

export async function upsertProducts(data: ProductData[]): Promise<number> {
  if (data.length === 0) return 0;

  let upserted = 0;
  let priceChanges = 0;

  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const chunk = data.slice(i, i + BATCH_SIZE);
    const urls = chunk.map((p) => p.url);

    // Fetch current prices before upserting (for history tracking)
    const existing = await db
      .select({ id: products.id, url: products.url, totalPrice: products.totalPrice, pricePerGram: products.pricePerGram })
      .from(products)
      .where(inArray(products.url, urls));

    const existingByUrl = new Map(existing.map((p) => [p.url, p]));

    // Upsert products
    await db
      .insert(products)
      .values(
        chunk.map((product) => ({
          brand: product.brand,
          productName: product.productName,
          totalPrice: product.totalPrice.toFixed(2),
          weightGrams: product.weightGrams,
          pricePerGram: product.pricePerGram.toFixed(6),
          currency: product.currency,
          inStock: product.inStock,
          url: product.url,
          imageUrl: product.imageUrl,
          lastUpdate: product.lastUpdate,
        }))
      )
      .onConflictDoUpdate({
        target: products.url,
        set: {
          brand: sql`excluded.brand`,
          productName: sql`excluded.product_name`,
          previousPrice: sql`products.total_price`,
          totalPrice: sql`excluded.total_price`,
          weightGrams: sql`excluded.weight_grams`,
          pricePerGram: sql`excluded.price_per_gram`,
          currency: sql`excluded.currency`,
          inStock: sql`excluded.in_stock`,
          imageUrl: sql`excluded.image_url`,
          lastUpdate: sql`excluded.last_update`,
        },
      });

    // Record price history for products whose price changed (or are new)
    // Re-fetch to get IDs for new products
    const updated = await db
      .select({ id: products.id, url: products.url })
      .from(products)
      .where(inArray(products.url, urls));

    const updatedByUrl = new Map(updated.map((p) => [p.url, p.id]));

    const historyEntries: { productId: string; totalPrice: string; pricePerGram: string; scrapedAt: Date }[] = [];

    for (const product of chunk) {
      const productId = updatedByUrl.get(product.url);
      if (!productId) continue;

      const prev = existingByUrl.get(product.url);
      const newPrice = product.totalPrice.toFixed(2);

      // Record if: new product, or price changed
      if (!prev || prev.totalPrice !== newPrice) {
        historyEntries.push({
          productId,
          totalPrice: newPrice,
          pricePerGram: product.pricePerGram.toFixed(6),
          scrapedAt: product.lastUpdate,
        });
        if (prev) priceChanges++;
      }
    }

    if (historyEntries.length > 0) {
      await db.insert(priceHistory).values(historyEntries);
    }

    upserted += chunk.length;
  }

  console.log(`[db] Upserted ${upserted} products, ${priceChanges} price change(s) recorded`);
  return upserted;
}
