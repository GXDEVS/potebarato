import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import z from "zod";
import { auth } from "@/lib/auth";
import { ErrorSchema } from "@/lib/schemas";

const KeySchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  start: z.string().nullable(),
  enabled: z.boolean(),
  rateLimitMax: z.number().nullable(),
  remaining: z.number().nullable(),
  lastRefillAt: z.string().nullable(),
  createdAt: z.string(),
});

const app = new Hono();

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
    const session = c.get("session" as never) as { userId: string } | null;
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const keys = await auth.api.listApiKeys({
      headers: c.req.raw.headers,
    });

    return c.json({ keys });
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
      401: {
        description: "Unauthorized",
        content: {
          "application/json": { schema: resolver(ErrorSchema) },
        },
      },
    },
  }),
  async (c) => {
    const session = c.get("session" as never) as { userId: string } | null;
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const existing = await auth.api.listApiKeys({
      headers: c.req.raw.headers,
    });
    const list = Array.isArray(existing) ? existing : [];
    if (list.length > 0) {
      return c.json({ error: "Você já possui uma API key. Revogue a existente para criar uma nova." }, 400);
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
    const session = c.get("session" as never) as { userId: string } | null;
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const id = c.req.param("id");

    await auth.api.deleteApiKey({
      body: { keyId: id },
      headers: c.req.raw.headers,
    });

    return c.json({ success: true });
  }
);

export { app as keysRoute };
