import { createMiddleware } from "hono/factory";
import { auth } from "@/lib/auth";
import { incrementUsage } from "@/lib/rate-limit";

export const apiKeyAuth = createMiddleware(async (c, next) => {
  const key = c.req.header("x-api-key");

  if (!key) {
    return c.json({ error: "API key required. Send via x-api-key header." }, 401);
  }

  // Verify the key via better-auth (handles hashing internally)
  const result = await auth.api.verifyApiKey({
    body: { key },
  });

  if (!result.valid) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  // Manual rate limit check + increment
  const usage = await incrementUsage(result.key.id);

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

  c.set("apiKeyId" as never, result.key.id as never);
  await next();
});
