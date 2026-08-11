import { Hono } from "hono";
import { db } from "@/db";
import { products } from "@/db/schema";
import { desc } from "drizzle-orm";
import { getProductStats } from "@/services/products";

const app = new Hono();

function getUserFromContext(c: any): { id: string; role?: string } | null {
  const user = c.get("user");
  return user ?? null;
}

let scraperProc: { pid: number; killed: boolean; exited: Promise<number> } | null = null;

app.post("/api/scrape", async (c) => {
  const user = getUserFromContext(c);
  if (!user) {
    return c.json({ error: "Não autorizado" }, 401);
  }
  if (user.role !== "admin") {
    return c.json({ error: "Apenas administradores podem iniciar o scraping" }, 403);
  }

  if (scraperProc && !scraperProc.killed) {
    return c.json({ error: "Scraping já está em execução", pid: scraperProc.pid }, 409);
  }

  const proc = Bun.spawn(["bun", "run", "src/scraper/worker.ts"], {
    stdout: "inherit",
    stderr: "inherit",
  });

  scraperProc = proc;
  proc.exited.then(() => { scraperProc = null; });

  return c.json({
    message: "Scraping iniciado",
    pid: proc.pid,
  });
});

export { scraperProc };

app.get("/api/scrape/status", async (c) => {
  const stats = await getProductStats();
  c.header("Cache-Control", "public, max-age=300");
  return c.json({
    total_products: stats.total,
    last_update: stats.lastUpdate,
  });
});

app.get("/api/landing/products/:id/history", async (c) => {
  const productId = c.req.param("id");
  const { getProductHistory } = await import("@/services/history");
  const history = await getProductHistory(productId, 90);
  c.header("Cache-Control", "public, max-age=300");
  return c.json(
    history.map((h) => ({
      totalPrice: h.totalPrice,
      pricePerGram: h.pricePerGram,
      scrapedAt: h.scrapedAt.toISOString(),
    }))
  );
});

app.get("/api/landing/products", async (c) => {
  const data = await db
    .select({
      id: products.id,
      brand: products.brand,
      productName: products.productName,
      totalPrice: products.totalPrice,
      weightGrams: products.weightGrams,
      pricePerGram: products.pricePerGram,
      inStock: products.inStock,
      url: products.url,
      imageUrl: products.imageUrl,
      previousPrice: products.previousPrice,
    })
    .from(products)
    .orderBy(desc(products.lastUpdate));

  c.header("Cache-Control", "public, max-age=300");
  return c.json(data);
});

export { app as scrapeRoute };
