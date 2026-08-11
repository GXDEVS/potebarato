# Sumário de Alterações — PoteBarato

> Última atualização: 2026-04-10  
> Base: `master` (60ec2c5) vs `origin/main` (56b42db — PR #5)

---

## Índice

- [1. Segurança](#1-segurança)
- [2. Performance](#2-performance)
- [3. Novas Features](#3-novas-features)
- [4. Arquitetura](#4-arquitetura)
- [5. Infraestrutura](#5-infraestrutura)
- [6. Testes](#6-testes)
- [7. Frontend / UX](#7-frontend--ux)
- [8. Migrations](#8-migrations)

---

## 1. Segurança

### Ownership check no DELETE de API Keys
- **Motivo:** Qualquer usuário autenticado podia deletar a key de outro usuário.
- **Exemplo:** `DELETE /api/keys/123` agora retorna `403` se a key não pertencer ao usuário da sessão.

### Validação de sessão no WebSocket
- **Motivo:** Evitar que um user se conecte ao canal de usage de outro user.
- **Exemplo:** `ws://host/ws/usage/:userId` valida que `userId` bate com o ID da sessão autenticada.

### Escape de wildcards SQL (`%`, `_`)
- **Motivo:** Inputs como `100%` em buscas ILIKE poderiam causar SQL injection.
- **Exemplo:** Busca `?q=100%` → `escapeLike("100%")` → `"100\%"` (o `%` é escapado, tratado como literal).

### Limites `.max(100)` nos query params
- **Motivo:** Prevenir queries absurdamente grandes que poderiam sobrecarregar o banco.
- **Exemplo:** `GET /api/products?limit=9999` → rejeitado pelo schema Zod (max 100).

### Validação de env vars no startup
- **Motivo:** Falhar rápido se config essencial estiver faltando, em vez de crashar em runtime.
- **Exemplo:** `DATABASE_URL` ausente ou `BETTER_AUTH_SECRET` com menos de 32 chars → app não inicia.

---

## 2. Performance

### Batch inserts no scraper
- **Motivo:** Inserir 1 produto por query era lento. Agora usa chunks de 50.
- **Exemplo:** `insertProducts(products)` → agrupa 50 produtos em 1 INSERT, redução de ~90% no tempo de upsert.

### 3 índices na tabela products
- **Motivo:** Queries por brand, lastUpdate e productName eram full table scans.
- **Exemplo:** `CREATE INDEX idx_products_brand ON products(brand)` → busca por marca fica O(log n).

### Paginação no GET /api/products
- **Motivo:** Retornar todos os produtos de uma vez sobrecarregava a API.
- **Exemplo:** `GET /api/products?limit=20&offset=40` → retorna página 3 com 20 itens (default 50, max 200).

### Memory leak fix — cleanup do usageMap/subscribers
- **Motivo:** O rate-limit acumulava entries e subscribers sem nunca limpar.
- **Exemplo:** Cleanup periódico remove entries expiradas e subscribers órfãos.

### Cache HTTP nos endpoints de status
- **Motivo:** `/api/scrape/status` e `/api/landing/products` eram chamados repetidamente sem cache.
- **Exemplo:** `Cache-Control: max-age=300` → browser/cache faz cache por 5 minutos.

---

## 3. Novas Features

### Histórico de preços
- **Motivo:** Usuários querem ver a evolução do preço de um produto ao longo do tempo.
- **Arquivos:** `src/services/history.ts`, tabela `price_history`, migration `0005`
- **Exemplo:** `GET /api/products/42/history` → retorna `[{ totalPrice: 89.90, pricePerGram: 0.45, scrapedAt: "2026-04-01" }]`

### Detecção de queda de preço
- **Motivo:** Destacar visualmente quando um produto caiu de preço.
- **Exemplo:** Card mostra `R$ 79,90` com `R$ 89,90` riscado + badge `▼ 11%`.

### Filtros avançados na API
- **Motivo:** Usuários precisam filtrar por preço, peso, estoque e ordenar resultados.
- **Exemplo:** `GET /api/products?inStock=true&minPrice=30&maxPrice=100&sort=pricePerGram&order=asc`

### Rate limit headers
- **Motivo:** Clients precisam saber seu consumo de quota para lidar com 429 corretamente.
- **Exemplo:** Response inclui `X-RateLimit-Limit: 100`, `X-RateLimit-Remaining: 87`, `Retry-After: 42`.

### Auto-scrape na primeira execução
- **Motivo:** Novas instâncias com banco vazio precisavam de scrape manual para ter dados.
- **Exemplo:** Ao iniciar, se `SELECT COUNT(*) FROM products = 0` → dispara o scraper automaticamente.

---

## 4. Arquitetura

### Service layer (`src/services/`)
- **Motivo:** Queries SQL estavam espalhadas nas routes. Service layer isola a lógica de dados.
- **Arquivos:** `products.ts`, `keys.ts`, `history.ts`
- **Exemplo:**
  ```ts
  // ANTES — lógica SQL na route
  app.get("/api/products", async () => { db.select()... })

  // DEPOIS — route chama service
  app.get("/api/products", async () => { findProducts(filters) })
  ```

### Structured logger (`src/lib/logger.ts`)
- **Motivo:** `console.log` sem contexto dificulta debug em produção.
- **Exemplo:** `logger.info("scraper", "batch inserted", { count: 50 })` → `{"timestamp":"...","level":"info","module":"scraper","message":"batch inserted","count":50}`

### Health check
- **Motivo:** Orquestradores (Docker, Render) precisam saber se a app está saudável.
- **Exemplo:** `GET /health` → `{"status":"ok"}` (verifica conexão com o banco).

### Graceful shutdown
- **Motivo:** Processos filhos do scraper ficavam órfãos ao reiniciar a app.
- **Exemplo:** `SIGTERM` → mata processos filhos do Playwright antes de encerrar.

### Request timing middleware
- **Motivo:** Monitorar lentidão em rotas `/api/*`.
- **Exemplo:** `GET /api/products 200 142ms` aparece no log com duração.

---

## 5. Infraestrutura

### Dockerfile multi-stage
- **Motivo:** Deploy consistente com Bun + Playwright Chromium embutido.
- **Exemplo:** `docker build -t potebarato .` → imagem com Bun runtime + navegador headless.

### docker-compose.yml
- **Motivo:** Subir app + Postgres com 1 comando.
- **Exemplo:** `docker compose up` → app na porta 3000 + Postgres na 5432.

### GitHub Actions CI
- **Motivo:** Validação automática em cada push/PR.
- **Exemplo:** Pipeline: checkout → setup bun → install → css build → tsc → test.

---

## 6. Testes

### 63 testes (0 falhas)

| Categoria | Qtd | Arquivo |
|-----------|-----|---------|
| Unit — parser/scraper | 41 | `scraper.test.ts`, `crawler.test.ts`, `rate-limit.test.ts` |
| Integration — routes | 22 | `routes/integration.test.ts` |

- **Motivo:** Garantir que refactors e novas features não quebrem comportamento existente.
- **Exemplo:** `bun test` → roda tutti os 63 testes em segundos.

---

## 7. Frontend / UX

### Skeleton loading
- **Motivo:** Evitar layout shift enquanto dados carregam.
- **Exemplo:** Marquee e comparador mostram skeletons até os produtos chegarem.

### Hero responsivo
- **Motivo:** Layout quebrava em mobile.
- **Exemplo:** Breakpoints mobile → tablet → desktop ajustam hero, cards e grid.

### Navbar sticky com blur
- **Motivo:** Navegação desaparecia ao scrollar.
- **Exemplo:** `position: sticky; backdrop-filter: blur(8px)` → navbar sempre visível e translúcida.

### Modal de histórico de preço
- **Motivo:** Visualizar evolução do preço dentro da landing page.
- **Exemplo:** Clique em "Histórico" → modal com gráfico SVG (preço min/max/atual, timeline).

### Debounce na busca
- **Motivo:** Cada tecla disparava request.
- **Exemplo:** 300ms de debounce → máximo 1 request a cada 300ms.

### Link do GitHub na navbar
- **Motivo:** Sinalizar que o projeto é open source.
- **Exemplo:** Ícone do GitHub na navbar → link direto para o repositório.

---

## 8. Migrations

| Migration | Descrição |
|-----------|-----------|
| `0004_large_rafael_vega.sql` | Índices em `brand`, `lastUpdate`, `productName` |
| `0005_classy_lady_bullseye.sql` | Tabela `price_history` + coluna `previousPrice` |
| `0006_tiny_vin_gonzales.sql` | Coluna `inStock` em products |

---

## Estado atual dos branches

| Branch | Commit mais recente | Conteúdo |
|--------|-------------------|----------|
| `master` | `60ec2c5` — redesign highlight cards | Landing page + fixes locais |
| `origin/main` | `56b42db` — merge PR #5 | Tudo acima + segurança, perf, history, Docker, testes, service layer |

> **Nota:** O `master` está atrás de `origin/main` por conta do PR #5. Para sincronizar: `git merge origin/main` ou `git rebase origin/main`.