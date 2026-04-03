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
      theme: "none",
      darkMode: true,
      customCss: `
        .dark-mode {
          --scalar-color-1: #fafafa;
          --scalar-color-2: rgba(255, 255, 255, 0.62);
          --scalar-color-3: rgba(255, 255, 255, 0.44);
          --scalar-color-accent: #10b981;
          --scalar-background-1: #0a0a0a;
          --scalar-background-2: #141414;
          --scalar-background-3: #1e1e1e;
          --scalar-background-accent: #10b9811a;
          --scalar-border-color: #262626;
          --scalar-font: system-ui, -apple-system, "Inter", sans-serif;
        }
        .dark-mode .scalar-card {
          background: #141414;
          border-color: #262626;
        }
        .dark-mode .sidebar {
          background: #0a0a0a;
          border-color: #262626;
        }
      `,
    })
  );
}
