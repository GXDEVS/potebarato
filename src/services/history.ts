import { db } from "@/db";
import { priceHistory } from "@/db/schema";
import { eq, gte, desc } from "drizzle-orm";

export async function getProductHistory(productId: string, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  return db
    .select({
      totalPrice: priceHistory.totalPrice,
      pricePerGram: priceHistory.pricePerGram,
      scrapedAt: priceHistory.scrapedAt,
    })
    .from(priceHistory)
    .where(eq(priceHistory.productId, productId))
    .orderBy(desc(priceHistory.scrapedAt));
}
