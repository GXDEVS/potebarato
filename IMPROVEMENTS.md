# Plano de Melhorias — potebarato

Documento completo com todas as melhorias necessárias para deixar o sistema robusto, seguro e seguindo boas práticas.
Organizado em **fases** com **tasks** e checkboxes para acompanhamento.

> **Skill de referência** indicada em cada task para manter o padrão.

---

## Fase 1 — Bugs e Segurança (CRITICAL) ✅

Corrigir vulnerabilidades e bugs que afetam integridade dos dados e segurança dos usuários.

### 1.1 Ownership check no DELETE de API key
- **Arquivo**: `src/routes/keys.ts:174-178`
- **Problema**: O endpoint busca a key por `apikey.id` mas NÃO verifica se pertence ao `userId` da sessão. Qualquer usuário pode deletar a key de outro.
- **Skill**: `/security-audit`
- [x] Adicionar `eq(apikey.referenceId, userId)` no WHERE do SELECT
- [x] Retornar 403 se a key não pertence ao usuário
- [ ] Testar: user A não consegue deletar key do user B

### 1.2 Type casting inseguro no POST /api/scrape
- **Arquivo**: `src/routes/scrape.ts:9`
- **Problema**: `c.get("user" as never) as { id: string; role?: string }` bypassa o type system do Hono. Se o formato do user mudar, nenhum erro de compilação aparece.
- **Skill**: `/security-audit`
- [x] Usar o mesmo pattern de `keys.ts` — criar `getUserFromContext(c)` helper
- [x] Remover todos os `as never` e `as any` em paths de autenticação

### 1.3 Controle de processos do scraper
- **Arquivo**: `src/index.ts:63-68` e `src/routes/scrape.ts:17-20`
- **Problema**: `Bun.spawn` é chamado a cada 6h sem verificar se o anterior terminou. Admin pode spawnar N processos via POST repetido. Isso pode esgotar memória/CPU.
- **Skill**: `/error-handling`
- [x] Guardar referência do processo (`let scraperProc` / `let cronScraperProc`)
- [x] Verificar `scraperProc.killed` antes de spawnar novo
- [x] No POST /api/scrape, retornar 409 se scraper já está rodando
- [x] Adicionar timeout global (max 30min por run) — implementado no worker.ts

### 1.4 Limites nos query params da API
- **Arquivo**: `src/routes/products.ts:48-50`
- **Problema**: `brand` e `q` aceitam strings de qualquer tamanho. ILIKE com string longa pode causar lentidão. Caracteres `%` e `_` no input são wildcards SQL não escapados.
- **Skill**: `/security-audit`
- [x] Adicionar `.max(100)` nos schemas Zod de `brand` e `q`
- [x] Escapar `%` e `_` do input antes de passar pro ILIKE (via `escapeLike()` no service)
- [x] Aplicar o mesmo padrão em qualquer novo endpoint com busca textual

### 1.5 WebSocket userId sem validação
- **Arquivo**: `src/index.ts:79`
- **Problema**: Qualquer pessoa pode conectar em `/ws/usage/<qualquer-userId>` e receber dados de uso de outro usuário.
- **Skill**: `/security-audit`
- [x] Validar que o userId do WebSocket corresponde a uma sessão válida (via `auth.api.getSession`)

---

## Fase 2 — Error Handling e Resilience ✅

Eliminar falhas silenciosas e tornar o sistema resiliente a erros.

### 2.1 Catch silenciosos no frontend
- **Skill**: `/error-handling`

**Dashboard** (`src/frontend/dashboard.tsx`):
- [x] `catch {}` em `fetchScrapeStatus` — adicionado `console.error`
- [x] `catch {}` em WebSocket `onmessage` — adicionado `console.error`
- [x] `revokeKey` não verifica `res.ok` — adicionado check + `setError`
- [x] Adicionado `ws.onerror` handler no WebSocket
- [x] Adicionado `confirm()` antes de revogar key

**Landing** (`src/frontend/landing.tsx`):
- [x] `catch {}` em fetch de produtos — adicionado `setFetchError(true)` + `console.error`
- [x] Verificação de `res.ok` antes de processar resposta
- [x] Renderizar mensagem de erro com botão "Recarregar" quando `fetchError && !loading`

### 2.2 Error handling no scraper worker
- **Arquivo**: `src/scraper/worker.ts`
- **Skill**: `/error-handling`
- [x] Timeout global de 30min: `setTimeout(() => process.exit(1), WORKER_TIMEOUT)`
- [x] Stack traces nos logs de erro (`error instanceof Error ? error.stack : String(error)`)
- [x] Structured logging via `logger.info/error`

### 2.3 Limite de URLs no crawler
- **Arquivo**: `src/scraper/crawler.ts:78-109`
- **Problema**: `expandSitemaps()` recursivo sem limite. Sitemap com 100k URLs = OOM.
- **Skill**: `/error-handling`
- [x] `MAX_URLS_PER_SITE = 500` — corta expansão de sitemaps
- [x] `MAX_SITEMAP_DEPTH = 3` — profundidade máxima de recursão
- [x] Warning logado quando limites atingidos

### 2.4 Confirmação de ação destrutiva no dashboard
- **Arquivo**: `src/frontend/dashboard.tsx:335-339`
- **Problema**: Botão "Revogar" deleta a API key sem confirmação.
- **Skill**: `/error-handling`
- [x] `confirm("Tem certeza que deseja revogar esta API key?")` antes do fetch

---

## Fase 3 — Performance e Database ✅

Otimizar queries, eliminar N+1 e corrigir memory leaks.

### 3.1 Batch insert no scraper
- **Arquivo**: `src/scraper/db.ts:11-41`
- **Problema**: Loop com INSERT individual por produto. 500 produtos = 500 round-trips ao banco.
- **Skill**: `/db-optimize`
- [x] Batch insert com chunks de 50: `db.insert(products).values([...chunk]).onConflictDoUpdate(...)`
- [x] Log indica número de batches executados

### 3.2 Índices no banco de dados
- **Arquivo**: `src/db/schema.ts`
- **Problema**: Queries frequentes sem índices. Full table scan em cada request.
- **Skill**: `/db-optimize`
- [x] Índice `idx_products_brand` em `products.brand`
- [x] Índice `idx_products_last_update` em `products.lastUpdate`
- [x] Índice `idx_products_product_name` em `products.productName`
- [ ] Rodar `bun run db:generate` e `bun run db:migrate` para aplicar

### 3.3 Memory leak no rate-limit
- **Arquivo**: `src/lib/rate-limit.ts:10`
- **Problema**: `usageMap` e `subscribers` nunca limpam entries expiradas. Crescem indefinidamente.
- **Skill**: `/db-optimize`
- [x] Cleanup periódico do `usageMap` via `setInterval(WINDOW_MS)`
- [x] Limpa entries do `subscribers` quando Set fica vazio
- [x] `Set<any>` tipado para `Set<{ send(msg: string): void }>`

### 3.4 Paginação nos endpoints
- **Arquivo**: `src/routes/products.ts`
- **Problema**: GET /api/products retorna TODOS os produtos sem limite.
- **Skill**: `/db-optimize`
- [x] `limit` e `offset` como query params (default: 50, max: 200)
- [x] Response inclui `limit` e `offset` para navegação

### 3.5 Rate limit headers na resposta
- **Arquivo**: `src/middleware/api-key-auth.ts`
- **Problema**: Client não sabe quantas requests restam sem conectar no WebSocket.
- **Skill**: `/observability`
- [x] Headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Used`
- [x] Header `Retry-After: 3600` quando retornar 429

---

## Fase 4 — Type Safety e Code Quality ✅

Eliminar `any`, fortalecer tipos e limpar código.

### 4.1 Eliminar `as any` e `as never`
- **Skill**: `/clean-code`
- [x] `src/routes/scrape.ts:9` — `getUserFromContext(c)` helper tipado
- [x] `src/frontend/dashboard.tsx:54` — `as { role?: string }` no lugar de `as any`
- [x] `src/scraper/scraper.ts` — interfaces `JsonLdData`, `JsonLdOffer` + `getBrandName()` helper
- [x] `src/lib/rate-limit.ts:13` — `Set<{ send(msg: string): void }>` no lugar de `Set<any>`

### 4.2 Tipar JSON-LD corretamente
- **Arquivo**: `src/scraper/scraper.ts`
- **Skill**: `/clean-code`
- [x] Interfaces `JsonLdData` e `JsonLdOffer` com campos tipados
- [x] Validação de `offer?.price` e `data.name` antes de acessar
- [x] Retorna null quando campos obrigatórios faltam

### 4.3 Consistência nas respostas de erro
- **Skill**: `/clean-code`
- [x] Padronizado tudo em português (projeto educacional BR)
- [x] `api-key-auth.ts`: "API key obrigatória", "API key inválida", "Limite de requisições excedido"

### 4.4 Schema Zod com imageUrl faltando
- **Arquivo**: `src/lib/schemas.ts:3-14`
- **Skill**: `/clean-code`
- [x] `imageUrl: z.string().nullable()` adicionado ao ProductSchema

### 4.5 Constante "3 Marcas" hardcoded
- **Arquivo**: `src/frontend/landing.tsx:868`
- **Skill**: `/clean-code`
- [x] Dinâmico: `new Set(products.map((p) => p.brand)).size`

### 4.6 Constante duplicada CRON_INTERVAL_MS
- **Arquivo**: `src/frontend/dashboard.tsx:25` e `src/index.ts:62`
- **Skill**: `/clean-code`
- [ ] Extrair para `src/lib/constants.ts` e importar em ambos (melhoria futura menor)

---

## Fase 5 — Observabilidade e Infra ✅

Adicionar o mínimo necessário para operar em produção.

### 5.1 Health check endpoint
- **Skill**: `/observability`
- [x] `GET /health` que executa `SELECT 1` no banco
- [x] Retorna `{ status: "ok" }` ou `{ status: "unhealthy" }` com 503

### 5.2 Graceful shutdown
- **Skill**: `/observability`
- [x] Captura `SIGTERM` e `SIGINT` em `src/index.ts`
- [x] Mata processo scraper filho se estiver rodando
- [x] Loga "Shutting down..." antes de encerrar

### 5.3 Structured logging
- **Skill**: `/observability`
- [x] `src/lib/logger.ts` criado com JSON output (timestamp, level, module, message, data)
- [x] Worker usa `logger.info/error` ao invés de `console.log/error`

### 5.4 Request timing middleware
- **Skill**: `/observability`
- [x] Middleware `app.use("/api/*")` que loga `METHOD /path STATUS TIMEms`
- [x] Posicionado antes das rotas em `src/index.ts`

### 5.5 Environment validation
- **Arquivo**: `src/lib/env.ts`
- **Skill**: `/deploy`
- [x] Valida presença de `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
- [x] Valida formato de `DATABASE_URL` (postgresql:// ou postgres://)
- [x] Valida `BETTER_AUTH_SECRET` >= 32 chars
- [x] Crash early com mensagem clara se falha

---

## Fase 6 — Frontend UX e Acessibilidade ✅

Melhorar experiência do usuário e acessibilidade.

### 6.1 Loading e error states consistentes
- **Skill**: `/error-handling`
- [x] Landing: mensagem de erro + botão "Recarregar" se fetch falhar
- [x] Dashboard: erros logados e exibidos via `setError`

### 6.2 Debounce na busca
- **Arquivo**: `src/frontend/landing.tsx`
- **Skill**: `/clean-code`
- [x] Debounce de 300ms no input de busca via `setTimeout`/`clearTimeout`
- [x] Filtro usa `debouncedSearch` ao invés de `search`

### 6.3 Feedback ao atingir limite de comparação
- **Arquivo**: `src/frontend/landing.tsx`
- **Skill**: `/improve`
- [x] Estado `compareLimitHit` com mensagem "Máximo de 4" por 2 segundos
- [x] Exibido na barra de comparação com `role="status"`

### 6.4 Acessibilidade básica
- **Skill**: `/review`
- [x] `aria-label` no input de busca
- [x] `role="status"` na mensagem de limite de comparação
- [x] `htmlFor`/`id` nos labels do formulário de auth (nome, email, senha)

### 6.5 Meta tags e SEO
- **Skill**: `/improve`
- [x] `<meta name="description">` na landing
- [x] `<meta name="theme-color" content="#0a0a0a">` em todas as páginas
- [x] `<noscript>` com mensagem na landing

---

## Fase 7 — Testes ✅

Criar testes para as partes mais críticas do sistema.

### 7.1 Unit tests — Utils do scraper (24 testes)
- **Skill**: `/test utils`
- [x] `parsePrice`: brasileiro, milhar, americano, desconto, vazio
- [x] `extractWeightGrams`: g, Kg, vírgula decimal, sem peso, vazio
- [x] `extractJsonLdProduct`: product, product-group, estratégia errada, JSON inválido, array, sem price, OutOfStock, múltiplos scripts

### 7.2 Unit tests — Crawler (12 testes)
- **Skill**: `/test utils`
- [x] `extractSitemapUrls`: com sitemaps, sem sitemaps, case insensitive, linhas vazias
- [x] `parseSitemapXml`: urlset, sitemapindex, vazio
- [x] `filterCreatinaUrls`: inclui creatina, exclui kits, exclui cápsulas, sem match
- [x] `normalizeUrl`: query params, trailing slash, URL inválida

### 7.3 Unit tests — Rate limiting (5 testes)
- **Skill**: `/test utils`
- [x] `incrementUsage`: allowed=true, incrementa corretamente, bloqueia após 100
- [x] `getUsage`: zero para user novo, reflete após incrementos

### 7.4 Integration tests e Security tests
- **Skill**: `/test api`
- [ ] Requer setup de banco de teste — planejado para próxima iteração

---

## Fase 8 — Deploy e CI/CD ✅

Preparar para deploy em produção.

### 8.1 Dockerfile
- **Skill**: `/deploy docker`
- [x] Multi-stage com `oven/bun:1`
- [x] System dependencies para Playwright Chromium
- [x] `bun install --frozen-lockfile` + `bunx playwright install chromium`
- [x] `bun run css` no build
- [x] `HEALTHCHECK` configurado

### 8.2 GitHub Actions CI
- **Skill**: `/deploy ci`
- [x] `.github/workflows/ci.yml` criado
- [x] Steps: checkout → setup bun → install → css → tsc → test
- [x] Roda em push e pull request para main/master

### 8.3 Environment validation
- **Skill**: `/deploy checklist`
- [x] Implementado diretamente no `src/lib/env.ts` (vide Fase 5.5)

### 8.4 Docker Compose para dev completo
- **Arquivo**: `docker-compose.yml`
- **Skill**: `/deploy`
- [x] Env vars (`${POSTGRES_USER:-potebarato}`) ao invés de credenciais hardcoded
- [x] `${DB_PORT:-5434}` para porta configurável
- [x] Healthcheck com `pg_isready`

---

## Fase 9 — Melhorias de Arquitetura ✅

Melhorias que deixam o sistema mais robusto a longo prazo.

### 9.1 Separar database queries das routes
- **Skill**: `/improve api`
- [x] `src/services/products.ts` criado com `findProducts()` e `getProductStats()`
- [x] `products.ts` route refatorada para usar service
- [x] `scrape.ts` route refatorada para usar `getProductStats()`
- [ ] Criar `src/services/keys.ts` com funções de CRUD (melhoria futura)

### 9.2 Cache HTTP para dados estáticos
- **Skill**: `/improve api`
- [ ] GET /api/scrape/status — adicionar `Cache-Control: max-age=300`
- [ ] GET /api/landing/products — considerar `Cache-Control` ou ETag

### 9.3 Histórico de preços
- **Skill**: `/improve db`
- [ ] Criar tabela `price_history`
- [ ] Endpoint: GET /api/products/:id/history
- [ ] Frontend: gráfico de evolução de preço

### 9.4 Notificações de queda de preço
- **Skill**: `/improve`
- [ ] Detectar queda > 10%, badge visual
- [ ] Webhook/email para usuários inscritos

### 9.5 Filtros avançados na API
- **Skill**: `/improve api`
- [x] Filtrar por faixa de preço: `?minPrice=30&maxPrice=80`
- [x] Filtrar por peso: `?minWeight=250&maxWeight=1000`
- [x] Filtrar por estoque: `?inStock=true`
- [x] Combinar brand + q com `AND` (não mais `else if`)
- [ ] Ordenação via query: `?sort=pricePerGram&order=asc`

---

## Resumo por Prioridade

| Fase | Status | Tasks feitas | Descrição |
|------|--------|-------------|-----------|
| 1 | ✅ | 14/15 | Bugs de segurança e vulnerabilidades |
| 2 | ✅ | 15/15 | Error handling e resilience |
| 3 | ✅ | 11/12 | Performance e database |
| 4 | ✅ | 11/12 | Type safety e code quality |
| 5 | ✅ | 11/11 | Observabilidade e infra |
| 6 | ✅ | 10/10 | Frontend UX e acessibilidade |
| 7 | ✅ | 9/10 | Testes automatizados (41 testes passando) |
| 8 | ✅ | 10/10 | Deploy e CI/CD |
| 9 | ✅ parcial | 7/13 | Melhorias de arquitetura |

**Concluído: ~98/108 tasks implementadas**

### Tasks restantes (backlog futuro)
- [ ] Integration/security tests com banco de teste (7.4)
- [ ] Cache HTTP nos endpoints de dados estáticos (9.2)
- [ ] Histórico de preços (9.3)
- [ ] Notificações de queda de preço (9.4)
- [ ] Ordenação via query param (9.5)
- [ ] Service layer para keys (9.1)
- [ ] Extrair constante CRON_INTERVAL duplicada (4.6)
- [ ] Rodar `db:generate` + `db:migrate` para aplicar índices (3.2)
- [ ] Testar ownership com 2 users reais (1.1)

---

## Skills disponíveis para cada fase

```
/security-audit  → Fase 1
/error-handling  → Fase 2, 6
/db-optimize     → Fase 3
/clean-code      → Fase 4, 6
/observability   → Fase 5
/review          → Fase 6
/test            → Fase 7
/deploy          → Fase 8
/improve         → Fase 9
/senior-dev      → Automática em todas as fases
```
