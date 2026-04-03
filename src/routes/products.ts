import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import z from "zod";
import { db } from "@/db";
import { products } from "@/db/schema";
import { ilike, max, count } from "drizzle-orm";
import { apiKeyAuth } from "@/middleware/api-key-auth";
import { ProductsResponseSchema, ErrorSchema } from "@/lib/schemas";

const app = new Hono();

app.get(
  "/api/products",
  describeRoute({
    tags: ["Produtos"],
    summary: "Listar produtos de creatina",
    description:
      "Retorna todos os produtos de creatina com preços. Suporta filtro por marca ou nome do produto. Requer uma chave de API válida via header x-api-key.",
    responses: {
      200: {
        description: "Lista de produtos",
        content: {
          "application/json": {
            schema: resolver(ProductsResponseSchema),
          },
        },
      },
      401: {
        description: "Chave de API ausente ou inválida",
        content: {
          "application/json": {
            schema: resolver(ErrorSchema),
          },
        },
      },
      429: {
        description: "Limite de requisições excedido",
        content: {
          "application/json": {
            schema: resolver(ErrorSchema),
          },
        },
      },
    },
  }),
  validator(
    "query",
    z.object({
      brand: z.string().optional(),
      q: z.string().optional(),
    })
  ),
  apiKeyAuth,
  async (c) => {
    const { brand, q } = c.req.valid("query");

    let query = db.select().from(products).$dynamic();

    if (brand) {
      query = query.where(ilike(products.brand, `%${brand}%`));
    } else if (q) {
      query = query.where(ilike(products.productName, `%${q}%`));
    }

    const data = await query;

    const [stats] = await db
      .select({
        total: count(),
        lastUpdate: max(products.lastUpdate),
      })
      .from(products);

    return c.json({
      data,
      total: stats?.total ?? 0,
      last_update: stats?.lastUpdate?.toISOString() ?? null,
    });
  }
);

export { app as productsRoute };
