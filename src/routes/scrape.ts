import { Hono } from "hono";
import { db } from "@/db";
import { products } from "@/db/schema";
import { max, count } from "drizzle-orm";

const app = new Hono();

app.post("/api/scrape", async (c) => {
  const user = c.get("user" as never);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const proc = Bun.spawn(["bun", "run", "src/scraper/worker.ts"], {
    stdout: "inherit",
    stderr: "inherit",
  });

  return c.json({
    message: "Scrape started",
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

export { app as scrapeRoute };
