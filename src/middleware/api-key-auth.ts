import { createMiddleware } from "hono/factory";
import { auth } from "@/lib/auth";

export const apiKeyAuth = createMiddleware(async (c, next) => {
  const key = c.req.header("x-api-key");

  if (!key) {
    return c.json({ error: "API key required. Send via x-api-key header." }, 401);
  }

  const result = await auth.api.verifyApiKey({
    body: { key },
  });

  if (!result.valid) {
    const errorMsg = String(result.error?.message ?? "Invalid API key");

    if (errorMsg.toLowerCase().includes("rate limit")) {
      return c.json({ error: "Rate limit exceeded. Try again later." }, 429);
    }

    return c.json({ error: errorMsg }, 401);
  }

  await next();
});
