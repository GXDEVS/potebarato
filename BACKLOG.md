# Backlog — potebarato

Tasks restantes organizadas em sprints por prioridade e dependência.

---

## Sprint 1 — Quick Wins (baixo esforço, alto valor)

Tasks simples que podem ser feitas em sequência rápida.

### 1.1 Extrair constante CRON_INTERVAL duplicada
- **Esforço**: 5 min
- **Arquivos**:
  - `src/index.ts:80` → `const SIX_HOURS = 6 * 60 * 60 * 1000`
  - `src/frontend/dashboard.tsx:25` → `const CRON_INTERVAL_MS = 6 * 60 * 60 * 1000`
- **O que fazer**:
  - [ ] Criar `src/lib/constants.ts` com `export const CRON_INTERVAL_MS = 6 * 60 * 60 * 1000`
  - [ ] Importar em `src/index.ts` e substituir `SIX_HOURS`
  - [ ] Importar em `src/frontend/dashboard.tsx` e substituir `CRON_INTERVAL_MS` local

### 1.2 Cache HTTP nos endpoints estáticos
- **Esforço**: 10 min
- **Arquivos**: `src/routes/scrape.ts:45-70`
- **Problema**: `/api/scrape/status` e `/api/landing/products` mudam no máximo a cada 6h mas são servidos sem cache.
- **O que fazer**:
  - [ ] GET `/api/scrape/status` → `c.header("Cache-Control", "public, max-age=300")` (5 min)
  - [ ] GET `/api/landing/products` → `c.header("Cache-Control", "public, max-age=300")` (5 min)
  - [ ] Testar: segunda request dentro de 5 min deve vir do cache do browser

### 1.3 Ordenação via query param na API
- **Esforço**: 15 min
- **Arquivos**: `src/routes/products.ts:44-57` e `src/services/products.ts:22-60`
- **Problema**: API não suporta `?sort=pricePerGram&order=asc`. Frontend ordena client-side mas consumidores da API não conseguem.
- **O que fazer**:
  - [ ] Adicionar no validator Zod:
    ```
    sort: z.enum(["totalPrice", "pricePerGram", "weightGrams", "lastUpdate"]).optional()
    order: z.enum(["asc", "desc"]).default("asc").optional()
    ```
  - [ ] No `findProducts()` em `src/services/products.ts`, adicionar `.orderBy()` dinâmico
  - [ ] Default: sem ordenação (mantém compatibilidade)
  - [ ] Testar: `GET /api/products?sort=pricePerGram&order=asc`

### 1.4 Service layer para keys
- **Esforço**: 15 min
- **Arquivos**: `src/routes/keys.ts:55-58, 109-113, 174-178`
- **Problema**: 3 queries inline no route handler. Mesmo pattern já resolvido em products.
- **O que fazer**:
  - [ ] Criar `src/services/keys.ts` com:
    - `getKeysByUser(userId: string)` → SELECT WHERE referenceId = userId
    - `getUserKeyCount(userId: string)` → SELECT count WHERE referenceId = userId
    - `getKeyById(keyId: string)` → SELECT WHERE id = keyId
  - [ ] Refatorar `src/routes/keys.ts` para chamar o service
  - [ ] Manter auth logic (ownership check) na route

---

## Sprint 2 — Testes de Segurança e Integração

Requer banco de teste rodando. Mais complexo.

### 2.1 Setup de banco de teste
- **Esforço**: 20 min
- **O que fazer**:
  - [ ] Criar `docker-compose.test.yml` com Postgres em porta separada (5435)
  - [ ] Criar `src/test-setup.ts` com:
    - Conecta no banco de teste
    - Roda migrations
    - Exporta `testDb` e helpers (`createTestUser`, `createTestApiKey`)
    - Cleanup após cada suite (`TRUNCATE`)
  - [ ] Adicionar script no `package.json`: `"test:integration": "DATABASE_URL=... bun test src/routes/"`

### 2.2 Integration tests — API routes
- **Esforço**: 30 min
- **Arquivo**: `src/routes/products.test.ts`
- **O que fazer**:
  - [ ] Criar app Hono de teste com as rotas montadas
  - [ ] `GET /api/products` sem API key → 401
  - [ ] `GET /api/products` com key inválida → 401
  - [ ] `GET /api/products?brand=Growth` → filtra corretamente
  - [ ] `GET /api/products?sort=pricePerGram&order=asc` → ordenado
  - [ ] `GET /api/scrape/status` → 200 com `total_products` e `last_update`
  - [ ] `POST /api/scrape` sem auth → 401
  - [ ] `POST /api/scrape` sem role admin → 403
  - [ ] `POST /api/scrape` com scraper já rodando → 409

### 2.3 Security tests — Ownership
- **Esforço**: 20 min
- **Arquivo**: `src/routes/keys.test.ts`
- **O que fazer**:
  - [ ] Criar 2 test users (User A e User B) no banco de teste
  - [ ] User A cria API key
  - [ ] User B tenta `DELETE /api/keys/:idDoUserA` → 403
  - [ ] User A consegue deletar sua própria key → 200
  - [ ] `POST /api/keys` quando user já tem key → 400
  - [ ] `GET /api/keys` retorna APENAS keys do user autenticado

---

## Sprint 3 — Histórico de Preços

Feature nova completa: banco + backend + frontend.

### 3.1 Tabela price_history
- **Esforço**: 15 min
- **Arquivo**: `src/db/schema.ts`
- **O que fazer**:
  - [ ] Criar tabela `priceHistory`:
    ```typescript
    export const priceHistory = pgTable("price_history", {
      id: uuid("id").defaultRandom().primaryKey(),
      productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
      totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),
      pricePerGram: numeric("price_per_gram", { precision: 10, scale: 6 }).notNull(),
      scrapedAt: timestamp("scraped_at", { withTimezone: true }).notNull(),
    });
    ```
  - [ ] Adicionar índice composto: `(productId, scrapedAt)`
  - [ ] Rodar `bun run db:generate` + `bun run db:migrate`

### 3.2 Registrar histórico no upsert
- **Esforço**: 20 min
- **Arquivo**: `src/scraper/db.ts`
- **O que fazer**:
  - [ ] Antes do upsert, buscar preço atual do produto por URL
  - [ ] Se preço mudou (ou produto é novo), inserir em `price_history`
  - [ ] Batch insert no histórico também (mesma lógica de chunks)
  - [ ] Log: "X price changes recorded"

### 3.3 Endpoint de histórico
- **Esforço**: 15 min
- **Arquivo**: `src/routes/products.ts` ou novo `src/routes/history.ts`
- **O que fazer**:
  - [ ] `GET /api/products/:id/history` → retorna array de `{ price, pricePerGram, scrapedAt }`
  - [ ] Query param `?days=30` para limitar período (default: 30)
  - [ ] Proteger com `apiKeyAuth`
  - [ ] Documentar com OpenAPI/Scalar

### 3.4 Frontend — Gráfico de preço
- **Esforço**: 40 min
- **Arquivo**: `src/frontend/landing.tsx`
- **O que fazer**:
  - [ ] Ao clicar num produto, abrir modal/drawer com gráfico de histórico
  - [ ] Gráfico simples com `<canvas>` ou SVG inline (sem lib externa)
  - [ ] Eixo X: datas | Eixo Y: preço
  - [ ] Mostrar preço mínimo/máximo/atual no gráfico
  - [ ] Fetch de `/api/products/:id/history` ao abrir

---

## Sprint 4 — Notificações de Queda de Preço

Depende do histórico de preços (Sprint 3).

### 4.1 Detectar queda de preço no scraper
- **Esforço**: 15 min
- **Arquivo**: `src/scraper/db.ts`
- **O que fazer**:
  - [ ] Ao comparar preço novo vs anterior no upsert:
    - Se queda > 10%, adicionar campo `priceDropPercent` no retorno
  - [ ] Logar: "[db] Price drop detected: Product X -15%"
  - [ ] Considerar adicionar coluna `previous_price` na tabela products (opcional)

### 4.2 Badge visual na landing
- **Esforço**: 20 min
- **Arquivo**: `src/frontend/landing.tsx`
- **O que fazer**:
  - [ ] API retorna campo indicando queda de preço (ou calcular no frontend via histórico)
  - [ ] Badge vermelho/verde no card: "▼ 15% desde ontem"
  - [ ] Filtro extra no comparador: "Apenas promoções"
  - [ ] Destacar na seção de highlights se houver queda significativa

### 4.3 Webhook de notificação (futuro)
- **Esforço**: 30 min
- **O que fazer**:
  - [ ] Tabela `webhooks` (userId, url, events, active)
  - [ ] Ao detectar queda > 10%, POST para webhooks registrados
  - [ ] Endpoint: `POST /api/webhooks` (CRUD)
  - [ ] Dashboard: UI para gerenciar webhooks
  - [ ] Rate limit nos dispatches (max 10/hora por webhook)

---

## Cronograma sugerido

| Sprint | Prioridade | Esforço total | Dependências |
|--------|-----------|---------------|--------------|
| **1 — Quick Wins** | Alta | ~45 min | Nenhuma |
| **2 — Testes** | Alta | ~70 min | Sprint 1 (service layer) |
| **3 — Histórico** | Média | ~90 min | Nenhuma |
| **4 — Notificações** | Baixa | ~65 min | Sprint 3 (histórico) |

**Total estimado: ~4.5 horas de desenvolvimento**

---

## Ordem de execução recomendada

```
Sprint 1.1 → 1.2 → 1.3 → 1.4  (quick wins em sequência)
    ↓
Sprint 2.1 → 2.2 → 2.3  (testes dependem do service layer de 1.4)
    ↓
Sprint 3.1 → 3.2 → 3.3 → 3.4  (histórico independente)
    ↓
Sprint 4.1 → 4.2 → 4.3  (notificações dependem do histórico)
```

---

## Skills para cada sprint

```
Sprint 1: /clean-code, /new-route, /improve
Sprint 2: /test, /security-audit
Sprint 3: /db-optimize, /new-route, /improve
Sprint 4: /improve, /new-route
```
