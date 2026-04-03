import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "@/lib/auth";
import { productsRoute } from "@/routes/products";
import { scrapeRoute } from "@/routes/scrape";

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

// Routes
app.route("/", productsRoute);
app.route("/", scrapeRoute);

app.get("/", (c) => c.text("potebarato API"));

// Register cron job (every 6 hours)
await Bun.cron(`${import.meta.dir}/scraper/worker.ts`, "0 */6 * * *", "potebarato-scraper");

export default app;
