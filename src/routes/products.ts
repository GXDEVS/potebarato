import { Hono } from "hono";
import { db } from "@/db";
import { products } from "@/db/schema";
import { ilike, max, count } from "drizzle-orm";

const app = new Hono();

app.get("/api/products", async (c) => {
  const brand = c.req.query("brand");
  const q = c.req.query("q");

  let query = db.select().from(products).$dynamic();

  if (brand) {
    query = query.where(ilike(products.brand, `%${brand}%`));
  } else if (q) {
    query = query.where(ilike(products.productName, `%${q}%`));
  }

  const data = await query;

  const [stats] = await db
    .select({
      total: count(),
      lastUpdate: max(products.lastUpdate),
    })
    .from(products);

  return c.json({
    data,
    total: stats?.total ?? 0,
    last_update: stats?.lastUpdate?.toISOString() ?? null,
  });
});

export { app as productsRoute };
