import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import z from "zod";
import { apiKeyAuth } from "@/middleware/api-key-auth";
import { ProductsResponseSchema, ErrorSchema } from "@/lib/schemas";
import { findProducts, getProductStats } from "@/services/products";

const app = new Hono();

app.get(
  "/api/products",
  describeRoute({
    tags: ["Produtos"],
    summary: "Listar produtos de creatina",
    description:
      "Retorna produtos de creatina com preços. Suporta filtros por marca, nome, preço, peso e estoque. Requer API key via header x-api-key.",
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
      brand: z.string().max(100).optional(),
      q: z.string().max(100).optional(),
      inStock: z.coerce.boolean().optional(),
      minPrice: z.coerce.number().min(0).optional(),
      maxPrice: z.coerce.number().min(0).optional(),
      minWeight: z.coerce.number().int().min(0).optional(),
      maxWeight: z.coerce.number().int().min(0).optional(),
      sort: z.enum(["totalPrice", "pricePerGram", "weightGrams", "lastUpdate"]).optional(),
      order: z.enum(["asc", "desc"]).optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
      offset: z.coerce.number().int().min(0).optional(),
    })
  ),
  apiKeyAuth,
  async (c) => {
    const filters = c.req.valid("query");
    const { data, limit, offset } = await findProducts(filters);
    const stats = await getProductStats();

    return c.json({
      data,
      total: stats.total,
      limit,
      offset,
      last_update: stats.lastUpdate,
    });
  }
);

export { app as productsRoute };
