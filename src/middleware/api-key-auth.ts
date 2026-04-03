import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { apikey } from "@/db/auth-schema";
import { auth } from "@/lib/auth";
import { incrementUsage } from "@/lib/rate-limit";

export const apiKeyAuth = createMiddleware(async (c, next) => {
  const key = c.req.header("x-api-key");

  if (!key) {
    return c.json({ error: "API key required. Send via x-api-key header." }, 401);
  }

  // Verify key via better-auth (only validates, no rate limiting)
  const result = await auth.api.verifyApiKey({
    body: { key },
  });

  if (!result.valid) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  // Get userId from key
  const [keyRow] = await db
    .select({ userId: apikey.referenceId })
    .from(apikey)
    .where(eq(apikey.id, result.key.id))
    .limit(1);

  if (!keyRow) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  // Rate limit by USER (not by key)
  const usage = incrementUsage(keyRow.userId);

  if (!usage.allowed) {
    return c.json(
      {
        error: "Rate limit exceeded. Try again later.",
        used: usage.used,
        max: usage.max,
        remaining: 0,
      },
      429
    );
  }

  await next();
});
