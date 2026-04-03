import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "@/lib/auth";
import { setupOpenAPI } from "@/lib/openapi";
import { productsRoute } from "@/routes/products";
import { scrapeRoute } from "@/routes/scrape";
import { keysRoute } from "@/routes/keys";

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

// Register cron job (every 6 hours)
await Bun.cron(`${import.meta.dir}/scraper/worker.ts`, "0 */6 * * *", "potebarato-scraper");

export default {
  port: 3000,
  fetch: app.fetch,
  routes: {
    "/": landing,
    "/auth": authPage,
    "/dashboard": dashboard,
  },
};
