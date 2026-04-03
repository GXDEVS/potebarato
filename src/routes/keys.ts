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
    tags: ["Chaves de API"],
    summary: "Listar suas chaves de API",
    description: "Retorna todas as chaves de API do usuário autenticado.",
    responses: {
      200: {
        description: "Lista de chaves",
        content: {
          "application/json": {
            schema: resolver(z.object({ keys: z.array(KeySchema) })),
          },
        },
      },
      401: {
        description: "Não autorizado",
        content: {
          "application/json": { schema: resolver(ErrorSchema) },
        },
      },
    },
  }),
  async (c) => {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "Não autorizado" }, 401);
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
        createdAt: k.createdAt.toISOString(),
      })),
    });
  }
);

app.post(
  "/api/keys",
  describeRoute({
    tags: ["Chaves de API"],
    summary: "Criar uma nova chave de API",
    description:
      "Cria uma nova chave de API. Limite de 1 por usuário. Copie a chave imediatamente — ela não será exibida novamente.",
    responses: {
      200: {
        description: "Chave criada",
        content: {
          "application/json": {
            schema: resolver(z.object({ key: z.string(), id: z.string() })),
          },
        },
      },
      400: {
        description: "Usuário já possui uma chave",
        content: {
          "application/json": { schema: resolver(ErrorSchema) },
        },
      },
      401: {
        description: "Não autorizado",
        content: {
          "application/json": { schema: resolver(ErrorSchema) },
        },
      },
    },
  }),
  async (c) => {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "Não autorizado" }, 401);
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
    tags: ["Chaves de API"],
    summary: "Revogar uma chave de API",
    description: "Remove permanentemente uma chave de API.",
    responses: {
      200: {
        description: "Chave revogada",
        content: {
          "application/json": {
            schema: resolver(z.object({ success: z.boolean() })),
          },
        },
      },
      401: {
        description: "Não autorizado",
        content: {
          "application/json": { schema: resolver(ErrorSchema) },
        },
      },
      404: {
        description: "Chave não encontrada",
        content: {
          "application/json": { schema: resolver(ErrorSchema) },
        },
      },
    },
  }),
  async (c) => {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "Não autorizado" }, 401);
    }

    const id = c.req.param("id");

    const [key] = await db
      .select({ id: apikey.id })
      .from(apikey)
      .where(eq(apikey.id, id))
      .limit(1);

    if (!key) {
      return c.json({ error: "Chave não encontrada" }, 404);
    }

    await auth.api.deleteApiKey({
      body: { keyId: id },
      headers: c.req.raw.headers,
    });

    return c.json({ success: true });
  }
);

export { app as keysRoute };
