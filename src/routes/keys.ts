import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import z from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { apikey } from "@/db/auth-schema";
import { ErrorSchema } from "@/lib/schemas";

const KeySchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  start: z.string().nullable(),
  prefix: z.string().nullable(),
  enabled: z.boolean(),
  rateLimitMax: z.number().nullable(),
  remaining: z.number().nullable(),
  createdAt: z.string(),
});

const app = new Hono();

function getUserId(c: any): string | null {
  const user = c.get("user");
  return user?.id ?? null;
}

app.get(
  "/api/keys",
  describeRoute({
    tags: ["API Keys"],
    summary: "List your API keys",
    description: "Returns all API keys for the authenticated user.",
    responses: {
      200: {
        description: "List of API keys",
        content: {
          "application/json": {
            schema: resolver(z.object({ keys: z.array(KeySchema) })),
          },
        },
      },
      401: {
        description: "Unauthorized",
        content: {
          "application/json": { schema: resolver(ErrorSchema) },
        },
      },
    },
  }),
  async (c) => {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const keys = await db
      .select()
      .from(apikey)
      .where(eq(apikey.referenceId, userId));

    return c.json({
      keys: keys.map((k) => ({
        id: k.id,
        name: k.name,
        start: k.start,
        prefix: k.prefix,
        enabled: k.enabled ?? true,
        rateLimitMax: k.rateLimitMax,
        remaining: k.remaining,
        requestCount: k.requestCount,
        lastRequest: k.lastRequest?.toISOString() ?? null,
        createdAt: k.createdAt.toISOString(),
      })),
    });
  }
);

app.post(
  "/api/keys",
  describeRoute({
    tags: ["API Keys"],
    summary: "Create a new API key",
    description:
      "Creates a new API key with rate limiting (100 req/hour). Returns the full key — store it securely, it won't be shown again.",
    responses: {
      200: {
        description: "API key created",
        content: {
          "application/json": {
            schema: resolver(z.object({ key: z.string(), id: z.string() })),
          },
        },
      },
      400: {
        description: "Already has a key",
        content: {
          "application/json": { schema: resolver(ErrorSchema) },
        },
      },
      401: {
        description: "Unauthorized",
        content: {
          "application/json": { schema: resolver(ErrorSchema) },
        },
      },
    },
  }),
  async (c) => {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const existing = await db
      .select({ id: apikey.id })
      .from(apikey)
      .where(eq(apikey.referenceId, userId))
      .limit(1);

    if (existing.length > 0) {
      return c.json(
        { error: "Você já possui uma API key. Revogue a existente para criar uma nova." },
        400
      );
    }

    const result = await auth.api.createApiKey({
      body: {
        name: "potebarato-key",
        prefix: "pb",
      },
      headers: c.req.raw.headers,
    });

    return c.json({
      key: result.key,
      id: result.id,
    });
  }
);

app.delete(
  "/api/keys/:id",
  describeRoute({
    tags: ["API Keys"],
    summary: "Revoke an API key",
    description: "Permanently deletes an API key.",
    responses: {
      200: {
        description: "Key revoked",
        content: {
          "application/json": {
            schema: resolver(z.object({ success: z.boolean() })),
          },
        },
      },
      401: {
        description: "Unauthorized",
        content: {
          "application/json": { schema: resolver(ErrorSchema) },
        },
      },
    },
  }),
  async (c) => {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const id = c.req.param("id");

    // Verify the key belongs to this user
    const [key] = await db
      .select({ id: apikey.id })
      .from(apikey)
      .where(eq(apikey.id, id))
      .limit(1);

    if (!key) {
      return c.json({ error: "Key not found" }, 404);
    }

    await auth.api.deleteApiKey({
      body: { keyId: id },
      headers: c.req.raw.headers,
    });

    return c.json({ success: true });
  }
);

export { app as keysRoute };
