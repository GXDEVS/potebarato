import type { Hono } from "hono";
import { openAPIRouteHandler } from "hono-openapi";
import { apiReference } from "@scalar/hono-api-reference";

export function setupOpenAPI(app: Hono<any>) {
  app.get(
    "/openapi.json",
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          title: "potebarato API",
          version: "1.0.0",
          description:
            "API de comparação de preços de creatina em lojas de suplementos brasileiras.",
        },
        tags: [
          { name: "Products", description: "Creatina product data" },
          { name: "Scraper", description: "Scraping pipeline control" },
          { name: "API Keys", description: "API key management" },
        ],
        components: {
          securitySchemes: {
            apiKey: {
              type: "apiKey",
              in: "header",
              name: "x-api-key",
              description: "Your API key for accessing product data",
            },
          },
        },
      },
    })
  );

  app.get(
    "/docs",
    apiReference({
      url: "/openapi.json",
      theme: "deepSpace",
    })
  );
}
