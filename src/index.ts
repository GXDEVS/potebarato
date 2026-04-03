import "@/lib/env";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { setupOpenAPI } from "@/lib/openapi";
import { productsRoute } from "@/routes/products";
import { scrapeRoute } from "@/routes/scrape";
import { keysRoute } from "@/routes/keys";
import { subscribe, unsubscribe, getUsage } from "@/lib/rate-limit";
import { db } from "@/db";
import { apikey } from "@/db/auth-schema";

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

// API Routes
app.route("/", productsRoute);
app.route("/", scrapeRoute);
app.route("/", keysRoute);

// OpenAPI + Scalar
setupOpenAPI(app);

// Scraper cron: every 6 hours
const SIX_HOURS = 6 * 60 * 60 * 1000;
setInterval(() => {
  Bun.spawn(["bun", "run", `${import.meta.dir}/scraper/worker.ts`], {
    stdout: "inherit",
    stderr: "inherit",
  });
}, SIX_HOURS);

// Custom fetch handler to intercept WebSocket upgrades
const honoFetch = app.fetch;

export default {
  port: 3000,
  async fetch(req: Request, server: any) {
    const url = new URL(req.url);

    // WebSocket upgrade for /ws/usage/:userId
    if (url.pathname.startsWith("/ws/usage/")) {
      const userId = url.pathname.split("/ws/usage/")[1];
      if (!userId) {
        return new Response("Missing userId", { status: 400 });
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
