import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { db } from "@/db";
import { products } from "@/db/schema";
import { max, count } from "drizzle-orm";
import { ScrapeStatusSchema, ScrapeStartedSchema, ErrorSchema } from "@/lib/schemas";

const app = new Hono();

app.post(
  "/api/scrape",
  describeRoute({
    tags: ["Scraper"],
    summary: "Trigger manual scrape",
    description:
      "Starts a background scraping job. Requires an authenticated session.",
    responses: {
      200: {
        description: "Scrape started",
        content: {
          "application/json": {
            schema: resolver(ScrapeStartedSchema),
          },
        },
      },
      401: {
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: resolver(ErrorSchema),
          },
        },
      },
    },
  }),
  async (c) => {
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
  }
);

app.get(
  "/api/scrape/status",
  describeRoute({
    tags: ["Scraper"],
    summary: "Scrape status",
    description:
      "Returns the total number of products and the last update timestamp.",
    responses: {
      200: {
        description: "Current scrape status",
        content: {
          "application/json": {
            schema: resolver(ScrapeStatusSchema),
          },
        },
      },
    },
  }),
  async (c) => {
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
  }
);

export { app as scrapeRoute };
