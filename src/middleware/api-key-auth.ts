import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { apikey } from "@/db/auth-schema";
import { auth } from "@/lib/auth";
import { incrementUsage } from "@/lib/rate-limit";

export const apiKeyAuth = createMiddleware(async (c, next) => {
  const key = c.req.header("x-api-key");

  if (!key) {
    return c.json({ error: "API key obrigatória. Envie via header x-api-key." }, 401);
  }

  // Verify key via better-auth (only validates, no rate limiting)
  const result = await auth.api.verifyApiKey({
    body: { key },
  });

  if (!result.valid) {
    return c.json({ error: "API key inválida" }, 401);
  }

  // Get userId from key
  const [keyRow] = await db
    .select({ userId: apikey.referenceId })
    .from(apikey)
    .where(eq(apikey.id, result.key!.id))
    .limit(1);

  if (!keyRow) {
    return c.json({ error: "API key inválida" }, 401);
  }

  // Rate limit by USER (not by key)
  const usage = incrementUsage(keyRow.userId);

  // Always set rate limit headers
  c.header("X-RateLimit-Limit", String(usage.max));
  c.header("X-RateLimit-Remaining", String(usage.remaining));
  c.header("X-RateLimit-Used", String(usage.used));

  if (!usage.allowed) {
    c.header("Retry-After", "3600");
    return c.json(
      {
        error: "Limite de requisições excedido. Tente novamente mais tarde.",
        used: usage.used,
        max: usage.max,
        remaining: 0,
      },
      429
    );
  }

  await next();
});
