import { Hono } from "hono";
import { db } from "@/db";
import { products } from "@/db/schema";
import { max, count, desc } from "drizzle-orm";

const app = new Hono();

app.post("/api/scrape", async (c) => {
  const user = c.get("user" as never) as { id: string; role?: string } | null;
  if (!user) {
    return c.json({ error: "Não autorizado" }, 401);
  }
  if (user.role !== "admin") {
    return c.json({ error: "Apenas administradores podem iniciar o scraping" }, 403);
  }

  const proc = Bun.spawn(["bun", "run", "src/scraper/worker.ts"], {
    stdout: "inherit",
    stderr: "inherit",
  });

  return c.json({
    message: "Scraping iniciado",
    pid: proc.pid,
  });
});

app.get("/api/scrape/status", async (c) => {
  const [stats] = await db
    .select({
      total: count(),
      lastUpdate: max(products.lastUpdate),
    })
    .from(products);

  return c.json({
    total_products: stats?.total ?? 0,
    last_update: stats?.lastUpdate?.toISOString() ?? null,
  });
});

app.get("/api/landing/products", async (c) => {
  const data = await db
    .select({
      id: products.id,
      brand: products.brand,
      productName: products.productName,
      totalPrice: products.totalPrice,
      cashPrice: products.cashPrice,
      weightGrams: products.weightGrams,
      pricePerGram: products.pricePerGram,
      inStock: products.inStock,
      url: products.url,
      imageUrl: products.imageUrl,
      purityLabel: products.purityLabel,
    })
    .from(products)
    .orderBy(desc(products.lastUpdate));

  return c.json(data);
});

export { app as scrapeRoute };
