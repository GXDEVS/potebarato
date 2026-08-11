import "@/lib/env";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { setupOpenAPI } from "@/lib/openapi";
import { productsRoute } from "@/routes/products";
import { scrapeRoute } from "@/routes/scrape";
import { keysRoute } from "@/routes/keys";
import { subscribe, unsubscribe, getUsage } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { CRON_INTERVAL_MS } from "@/lib/constants";
import { db } from "@/db";

import landing from "@/frontend/landing.html";
import authPage from "@/frontend/auth.html";
import dashboard from "@/frontend/dashboard.html";

const app = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
  };
}>();

app.use(
  "/api/auth/*",
  cors({
    origin: process.env.BETTER_AUTH_URL!,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  })
);

// Request timing for API routes
app.use("/api/*", async (c, next) => {
  const start = performance.now();
  await next();
  const ms = (performance.now() - start).toFixed(1);
  logger.info("http", `${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`);
});

app.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    c.set("user", null);
    c.set("session", null);
    await next();
    return;
  }

  c.set("user", session.user);
  c.set("session", session.session);
  await next();
});

app.on(["POST", "GET"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

// Health check
app.get("/health", async (c) => {
  try {
    await db.execute(sql`SELECT 1`);
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch {
    return c.json({ status: "unhealthy", timestamp: new Date().toISOString() }, 503);
  }
});

app.route("/", productsRoute);
app.route("/", scrapeRoute);
app.route("/", keysRoute);
setupOpenAPI(app);

// CronJob: executa o scraper a cada 6h em processo isolado via Bun.spawn
let cronScraperProc: { killed: boolean; exited: Promise<number>; kill(): void } | null = null;

function spawnScraper() {
  if (cronScraperProc && !cronScraperProc.killed) {
    logger.warn("cron", "Scraper still running, skipping");
    return;
  }
  const proc = Bun.spawn(["bun", "run", `${import.meta.dir}/scraper/worker.ts`], {
    stdout: "inherit",
    stderr: "inherit",
  });
  cronScraperProc = proc;
  proc.exited.then(() => { cronScraperProc = null; });
}

// Auto-scrape on first start if database is empty
(async () => {
  try {
    const result = await db
      .select({ total: sql<number>`count(*)::int` })
      .from((await import("@/db/schema")).products);
    if (!result[0] || result[0].total === 0) {
      logger.info("cron", "Database empty, triggering initial scrape...");
      spawnScraper();
    }
  } catch (e) {
    logger.error("cron", "Failed to check initial state", { error: String(e) });
  }
})();

setInterval(spawnScraper, CRON_INTERVAL_MS);

// Graceful shutdown
const shutdown = () => {
  console.log("[server] Shutting down...");
  if (cronScraperProc && !cronScraperProc.killed) {
    cronScraperProc.kill();
  }
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

const honoFetch = app.fetch;

export default {
  port: 3000,
  async fetch(req: Request, server: any) {
    const url = new URL(req.url);

    // WebSocket upgrade for /ws/usage/:userId (validate session)
    if (url.pathname.startsWith("/ws/usage/")) {
      const userId = url.pathname.split("/ws/usage/")[1];
      if (!userId) {
        return new Response("Missing userId", { status: 400 });
      }
      // Validate that the requesting user owns this userId
      const session = await auth.api.getSession({ headers: req.headers });
      if (!session || session.user.id !== userId) {
        return new Response("Unauthorized", { status: 401 });
      }
      const upgraded = server.upgrade(req, { data: { userId } });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    return honoFetch(req, server);
  },
  routes: {
    "/": landing,
    "/auth": authPage,
    "/dashboard": dashboard,
  },
  websocket: {
    open(ws: any) {
      const userId = ws.data?.userId;
      if (userId) {
        subscribe(userId, ws);
        const usage = getUsage(userId);
        ws.send(JSON.stringify({ type: "usage", ...usage }));
      }
    },
    message(_ws: any, _message: any) {},
    close(ws: any) {
      unsubscribe(ws);
    },
  },
};
