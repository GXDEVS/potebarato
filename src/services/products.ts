import { db } from "@/db";
import { products } from "@/db/schema";
import { ilike, count, max, and, gte, lte, eq, asc, desc } from "drizzle-orm";

type SortableColumn = "totalPrice" | "pricePerGram" | "weightGrams" | "lastUpdate";

interface ProductFilters {
  brand?: string;
  q?: string;
  inStock?: boolean;
  minPrice?: number;
  maxPrice?: number;
  minWeight?: number;
  maxWeight?: number;
  sort?: SortableColumn;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

/** Escape SQL ILIKE wildcards from user input */
function escapeLike(s: string): string {
  return s.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function findProducts(filters: ProductFilters) {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const conditions = [];

  if (filters.brand) {
    conditions.push(ilike(products.brand, `%${escapeLike(filters.brand)}%`));
  }
  if (filters.q) {
    conditions.push(ilike(products.productName, `%${escapeLike(filters.q)}%`));
  }
  if (filters.inStock !== undefined) {
    conditions.push(eq(products.inStock, filters.inStock));
  }
  if (filters.minPrice !== undefined) {
    conditions.push(gte(products.totalPrice, String(filters.minPrice)));
  }
  if (filters.maxPrice !== undefined) {
    conditions.push(lte(products.totalPrice, String(filters.maxPrice)));
  }
  if (filters.minWeight !== undefined) {
    conditions.push(gte(products.weightGrams, filters.minWeight));
  }
  if (filters.maxWeight !== undefined) {
    conditions.push(lte(products.weightGrams, filters.maxWeight));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  let query = db
    .select()
    .from(products)
    .where(where)
    .limit(limit)
    .offset(offset)
    .$dynamic();

  if (filters.sort) {
    const col = products[filters.sort];
    query = query.orderBy(filters.order === "desc" ? desc(col) : asc(col));
  }

  const data = await query;

  return { data, limit, offset };
}

export async function getProductStats() {
  const [stats] = await db
    .select({
      total: count(),
      lastUpdate: max(products.lastUpdate),
    })
    .from(products);

  return {
    total: stats?.total ?? 0,
    lastUpdate: stats?.lastUpdate?.toISOString() ?? null,
  };
}
