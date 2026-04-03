import type { Hono } from "hono";
import { openAPIRouteHandler } from "hono-openapi";

const SCALAR_CONFIG = JSON.stringify({
  url: "/openapi.json",
  theme: "none",
  darkMode: true,
  forceDarkModeState: "dark",
  hideDarkModeToggle: true,
  layout: "modern",
  defaultOpenAllTags: true,
  searchHotKey: "k",
  hideClientButton: false,
  showDeveloperTools: "never",
  showToolbar: "never",
  telemetry: false,
  mcp: { disabled: true },
  defaultHttpClient: {
    targetKey: "shell",
    clientKey: "curl",
  },
});

const DOCS_CSS = `
  /* ===== Reset & base ===== */
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; background: #0a0a0a; }

  /* ===== Custom navbar ===== */
  .pb-navbar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    height: 52px;
    background: rgba(10, 10, 10, 0.85);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid #262626;
    font-family: system-ui, -apple-system, "Inter", sans-serif;
  }
  .pb-navbar-logo {
    display: flex;
    align-items: center;
    text-decoration: none;
    color: #fafafa;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.025em;
  }
  .pb-navbar-logo .brand-accent {
    color: #10b981;
  }
  .pb-navbar-btn {
    font-size: 14px;
    font-weight: 500;
    color: #fff;
    background: #10b981;
    border: none;
    border-radius: 8px;
    padding: 8px 16px;
    cursor: pointer;
    text-decoration: none;
    transition: background 0.15s;
  }
  .pb-navbar-btn:hover {
    background: #059669;
  }

  /* Push Scalar content below navbar */
  #app { padding-top: 52px; }

  /* ===== Hide ALL Scalar branding ===== */
  [class*="powered-by"],
  [class*="poweredBy"],
  [class*="PoweredBy"],
  [class*="built-with"],
  [class*="BuiltWith"],
  [class*="scalar-brand"],
  [class*="scalar-logo"],
  a[href*="scalar.com"],
  [data-powered-by],
  .scalar-api-reference__footer,
  footer[class*="scalar"] {
    display: none !important;
    visibility: hidden !important;
    height: 0 !important;
    overflow: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }

  /* ===== Color palette ===== */
  .dark-mode {
    color-scheme: dark;
    --scalar-color-1: #fafafa;
    --scalar-color-2: rgba(255, 255, 255, 0.62);
    --scalar-color-3: rgba(255, 255, 255, 0.44);
    --scalar-color-disabled: rgba(255, 255, 255, 0.25);
    --scalar-color-ghost: rgba(255, 255, 255, 0.14);
    --scalar-color-accent: #10b981;

    --scalar-background-1: #0a0a0a;
    --scalar-background-2: #141414;
    --scalar-background-3: #1e1e1e;
    --scalar-background-4: rgba(255, 255, 255, 0.04);
    --scalar-background-accent: rgba(16, 185, 129, 0.08);

    --scalar-border-color: #262626;
    --scalar-scrollbar-color: rgba(255, 255, 255, 0.12);
    --scalar-scrollbar-color-active: rgba(255, 255, 255, 0.28);
    --scalar-lifted-brightness: 1.3;
    --scalar-backdrop-brightness: 0.4;

    --scalar-shadow-1: 0 1px 3px 0 rgba(0, 0, 0, 0.2);
    --scalar-shadow-2: 0 4px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.06);

    --scalar-button-1: #10b981;
    --scalar-button-1-color: #fff;
    --scalar-button-1-hover: #059669;

    --scalar-color-green: #34d399;
    --scalar-color-red: #f87171;
    --scalar-color-yellow: #fbbf24;
    --scalar-color-blue: #60a5fa;
    --scalar-color-orange: #fb923c;
    --scalar-color-purple: #a78bfa;

    --scalar-font: system-ui, -apple-system, "Inter", sans-serif;
  }

  /* ===== Sidebar ===== */
  .dark-mode .sidebar {
    --scalar-sidebar-background-1: #0a0a0a;
    --scalar-sidebar-item-hover-color: #10b981;
    --scalar-sidebar-item-hover-background: rgba(16, 185, 129, 0.06);
    --scalar-sidebar-item-active-background: rgba(16, 185, 129, 0.1);
    --scalar-sidebar-border-color: #262626;
    --scalar-sidebar-color-1: #fafafa;
    --scalar-sidebar-color-2: rgba(255, 255, 255, 0.5);
    --scalar-sidebar-color-active: #10b981;
    --scalar-sidebar-search-background: #141414;
    --scalar-sidebar-search-border-color: #262626;
    --scalar-sidebar-search-color: rgba(255, 255, 255, 0.44);
    border-right: 1px solid #262626;
  }

  /* ===== Selection ===== */
  ::selection {
    background: rgba(16, 185, 129, 0.3);
    color: #fff;
  }

  /* ===== Scrollbar ===== */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }
`;

const DOCS_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
  <title>potebarato — Documentacao da API</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style type="text/css">${DOCS_CSS}</style>
</head>
<body>
  <!-- Custom navbar -->
  <nav class="pb-navbar">
    <a href="/" class="pb-navbar-logo">
      pote<span class="brand-accent">barato</span>
    </a>
    <a href="/auth" class="pb-navbar-btn">Entrar</a>
  </nav>

  <!-- Scalar API Reference -->
  <div id="app"></div>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  <script type="text/javascript">
    Scalar.createApiReference('#app', ${SCALAR_CONFIG})
  </script>
</body>
</html>`;

export function setupOpenAPI(app: Hono<any>) {
  app.get(
    "/openapi.json",
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          title: "potebarato API",
          version: "1.0.0",
          description:
            "API de comparação de preços de creatina em lojas de suplementos brasileiras. Dados atualizados automaticamente a cada 6 horas.\n\n## Autenticação\n\nTodas as requisições à API requerem uma chave de API válida enviada no header `x-api-key`.\n\nPara obter sua chave, [crie uma conta](/auth) e acesse o [painel](/dashboard).\n\n## Limites\n\n- **100 requisições/hora** por chave\n- Dados atualizados a cada **6 horas**\n- Máximo de **1 chave** por usuário",
        },
        tags: [
          {
            name: "Produtos",
            description:
              "Consulte preços de creatina de diversas lojas. Filtre por marca ou nome do produto.",
          },
          {
            name: "Chaves de API",
            description:
              "Gerencie suas chaves de acesso. Cada usuário pode ter uma chave ativa com limite de 100 requisições por hora.",
          },
        ],
        components: {
          securitySchemes: {
            apiKey: {
              type: "apiKey",
              in: "header",
              name: "x-api-key",
              description: "Sua chave de API para acessar os dados de produtos",
            },
          },
        },
      },
    })
  );

  app.get("/docs", (c) => {
    return c.html(DOCS_HTML);
  });
}
