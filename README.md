<div align="center">

# pote<span style="color:#10b981">barato</span>

**Comparador de precos de creatina** — Projeto educacional de web scraping, API REST e frontend interativo.

[![Bun](https://img.shields.io/badge/Bun-1.x-f9f1e1?logo=bun&logoColor=000)](https://bun.sh)
[![Hono](https://img.shields.io/badge/Hono-4.x-E36002?logo=hono&logoColor=fff)](https://hono.dev)
[![Playwright](https://img.shields.io/badge/Playwright-1.x-2EAD33?logo=playwright&logoColor=fff)](https://playwright.dev)
[![Drizzle](https://img.shields.io/badge/Drizzle_ORM-0.45-C5F74F?logo=drizzle&logoColor=000)](https://orm.drizzle.team)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?logo=postgresql&logoColor=fff)](https://neon.tech)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=000)](https://react.dev)
[![Tailwind](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=fff)](https://tailwindcss.com)
[![License](https://img.shields.io/badge/Licenca-MIT-10b981)](#licenca)

<br/>

> **Aviso:** Este projeto foi desenvolvido com finalidade **exclusivamente educacional**.
> Todos os dados coletados sao publicos e acessiveis por qualquer navegador.
> Nao nos responsabilizamos pelo uso indevido desta ferramenta.

</div>

---

## Indice

- [Sobre o Projeto](#sobre-o-projeto)
- [Stack Tecnologica](#stack-tecnologica)
- [Arquitetura](#arquitetura)
- [Fluxo do Scraper (CronJob)](#fluxo-do-scraper-cronjob)
- [Estrategia de Extracao: JSON-LD](#estrategia-de-extracao-json-ld)
- [Pipeline de Scraping](#pipeline-de-scraping)
- [Endpoints da API](#endpoints-da-api)
- [Modelo de Dados](#modelo-de-dados)
- [Como Rodar](#como-rodar)
- [Variaveis de Ambiente](#variaveis-de-ambiente)
- [Scripts Disponiveis](#scripts-disponiveis)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Licenca](#licenca)

---

## Sobre o Projeto

O **potebarato** e um comparador de precos de creatina em po vendida por lojas de suplementos brasileiras. O sistema faz scraping automatico a cada 6 horas, extrai dados estruturados via **JSON-LD** (Schema.org), calcula o **preco por grama** e disponibiliza tudo via uma API REST documentada com OpenAPI/Scalar.

O frontend e uma landing page interativa com:
- Busca e filtragem por marca/nome
- Ordenacao por preco total, preco/grama ou peso
- Destaque do produto mais barato e melhor custo-beneficio
- Comparacao lado a lado (ate 4 produtos)
- Indicador de estoque em tempo real

---

## Stack Tecnologica

| Camada | Tecnologia | Uso |
|--------|------------|-----|
| **Runtime** | [Bun](https://bun.sh) | Runtime JS all-in-one (server, bundler, test runner) |
| **Framework Web** | [Hono](https://hono.dev) | Rotas, middleware, CORS |
| **Scraping** | [Playwright](https://playwright.dev) | Automacao de browser (Chromium headless) |
| **Banco de Dados** | [PostgreSQL](https://neon.tech) + [Drizzle ORM](https://orm.drizzle.team) | Persistencia com migrations tipadas |
| **Autenticacao** | [Better Auth](https://www.better-auth.com) | Signup/login, sessoes, chaves de API |
| **Frontend** | [React 19](https://react.dev) + [Tailwind CSS 4](https://tailwindcss.com) | Landing page, dashboard, painel admin |
| **Documentacao** | [Scalar](https://scalar.com) + [hono-openapi](https://github.com/honojs/middleware) | Docs interativos da API |
| **Validacao** | [Zod](https://zod.dev) + [zod-openapi](https://github.com/samchungy/zod-openapi) | Schemas tipados e OpenAPI spec |

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                        Bun.serve()                          │
│                         porta 3000                          │
├──────────┬──────────┬──────────┬──────────┬────────────────┤
│    /     │  /auth   │/dashboard│  /docs   │   /ws/usage    │
│ Landing  │  Login   │  Painel  │  Scalar  │   WebSocket    │
│  (React) │ (React)  │ (React)  │ (OpenAPI)│ (rate-limit)   │
├──────────┴──────────┴──────────┴──────────┴────────────────┤
│                     Hono Router                             │
├──────────┬──────────┬──────────┬──────────────────────────┤
│GET       │POST      │GET/POST  │GET                        │
│/api/     │/api/     │/api/     │/api/scrape/               │
│products  │scrape    │keys      │status                     │
├──────────┴──────────┴──────────┴──────────────────────────┤
│  API Key Auth    │   Session Auth   │   Rate Limiting      │
│  (x-api-key)     │  (Better Auth)   │  (100 req/hora)      │
├──────────────────┴──────────────────┴─────────────────────┤
│              Drizzle ORM + PostgreSQL (Neon)               │
├───────────────────────────────────────────────────────────┤
│              Scraper Worker (setInterval 6h)               │
│         Crawler → Scraper → Upsert no banco               │
└───────────────────────────────────────────────────────────┘
```

---

## Fluxo do Scraper (CronJob)

O scraping e agendado via `setInterval` no processo principal do Bun. A cada **6 horas**, um novo processo filho e criado com `Bun.spawn()` para executar o worker de scraping de forma isolada.

```mermaid
flowchart TD
    A["Bun.serve() inicia"] --> B["setInterval(6h)"]
    B --> C["Bun.spawn worker.ts"]
    C --> D{"Para cada site configurado"}
    D --> E["1. Crawl: Descobrir URLs"]
    E --> F["2. Scrape: Extrair dados"]
    F --> G["3. Upsert: Salvar no banco"]
    G --> D
    D -->|Todos os sites| H["Log: total de produtos atualizados"]
    H --> I["Processo filho encerra"]
    I -.->|Proximo ciclo em 6h| B

    style A fill:#10b981,color:#fff
    style C fill:#0a0a0a,stroke:#10b981,color:#10b981
    style H fill:#141414,stroke:#262626,color:#fafafa
```

### Por que `setInterval` + `Bun.spawn`?

- **Isolamento**: O worker roda em processo separado — se falhar, o servidor principal nao e afetado.
- **Simplicidade**: Nao requer dependencias externas de cron (node-cron, cron-d, etc.).
- **Compatibilidade**: Funciona em qualquer ambiente que rode Bun (local, Render, Railway, etc.).

---

## Estrategia de Extracao: JSON-LD

A principal estrategia de extracao de dados e via **JSON-LD** (JavaScript Object Notation for Linked Data), um formato padrao da web (Schema.org) que lojas de e-commerce embutem nas paginas para SEO.

### O que e JSON-LD?

E um bloco `<script type="application/ld+json">` presente no HTML de paginas de produto. Contem dados estruturados como nome, preco, marca, disponibilidade e imagem — exatamente o que precisamos.

### Duas estrategias suportadas

```mermaid
flowchart LR
    subgraph "Estrategia: product"
        P1["script ld+json"] --> P2["@type: Product"]
        P2 --> P3["offers.price"]
        P2 --> P4["brand.name"]
        P2 --> P5["image"]
    end

    subgraph "Estrategia: product-group"
        G1["script ld+json"] --> G2["@type: ProductGroup"]
        G2 --> G3["hasVariant[0]"]
        G3 --> G4["offers.price"]
        G2 --> G5["brand.name"]
    end
```

| Estrategia | Tipo JSON-LD | Lojas |
|------------|-------------|-------|
| `product` | `Product` com `offers` direto | Growth Supplements, Dark Lab |
| `product-group` | `ProductGroup` com `hasVariant[]` | Soldiers Nutrition |

### Exemplo de JSON-LD extraido

```json
{
  "@type": "Product",
  "name": "Creatina Monohidratada 250g",
  "brand": { "name": "Growth Supplements" },
  "image": "https://loja.com/creatina.webp",
  "offers": {
    "price": 49.90,
    "priceCurrency": "BRL",
    "availability": "http://schema.org/InStock"
  }
}
```

### Fallbacks

Quando o JSON-LD nao esta disponivel, o sistema usa:

1. **Seletores CSS** — extrai nome, preco e estoque via DOM
2. **Cascade de imagem** — `og:image` → `twitter:image` → API Shopify `.json` → primeira `<img>` de produto

---

## Pipeline de Scraping

O pipeline de scraping tem 3 estagios executados sequencialmente para cada site:

```mermaid
flowchart TD
    subgraph "1. Crawler"
        C1["Busca robots.txt"] --> C2["Extrai sitemaps"]
        C2 --> C3["Expande sitemap index"]
        C3 --> C4["Filtra URLs com 'creatin'"]
        C4 --> C5["Busca via search do site"]
        C5 --> C6["Deduplica + Normaliza URLs"]
        C6 --> C7["Validacao HEAD (10 concorrentes)"]
    end

    subgraph "2. Scraper"
        S1["Lanca Chromium headless"] --> S2["Pool de 3 paginas simultaneas"]
        S2 --> S3["Navega ate a pagina do produto"]
        S3 --> S4{"JSON-LD disponivel?"}
        S4 -->|Sim| S5["Extrai dados estruturados"]
        S4 -->|Nao| S6["Fallback: seletores CSS"]
        S5 --> S7["Extrai peso do nome (g/kg)"]
        S6 --> S7
        S7 --> S8["Calcula preco/grama"]
        S8 --> S9["Retry com backoff (max 2x)"]
    end

    subgraph "3. Upsert"
        U1["ON CONFLICT (url) DO UPDATE"]
        U2["Atualiza: preco, estoque, imagem, timestamp"]
    end

    C7 --> S1
    S9 --> U1
    U1 --> U2

    style C1 fill:#10b981,color:#fff
    style S1 fill:#10b981,color:#fff
    style U1 fill:#10b981,color:#fff
```

### Filtros aplicados nas URLs

- Deve conter **"creatin"** no path (aceita creatina/creatine)
- Exclui **kits e combos** (`/kit-*`)
- Exclui **capsulas e comprimidos** (precisamos do peso em g/kg para calcular preco/grama)

### Calculo do preco por grama

```
preco_por_grama = round(preco_total / peso_em_gramas, 6)
```

O peso e extraido do nome do produto via regex (`500g`, `1Kg`, `250g`, etc.).

---

## Endpoints da API

### Publicos

| Metodo | Rota | Descricao |
|--------|------|-----------|
| `GET` | `/` | Landing page (comparador) |
| `GET` | `/auth` | Pagina de login/cadastro |
| `GET` | `/docs` | Documentacao interativa (Scalar) |
| `GET` | `/api/scrape/status` | Total de produtos e ultima atualizacao |
| `GET` | `/api/landing/products` | Produtos para a landing page |

### Autenticados (sessao)

| Metodo | Rota | Descricao |
|--------|------|-----------|
| `GET` | `/dashboard` | Painel do usuario |
| `GET` | `/api/keys` | Listar chaves de API |
| `POST` | `/api/keys` | Criar chave de API (max 1 por usuario) |
| `DELETE` | `/api/keys/:id` | Revogar chave de API |
| `POST` | `/api/scrape` | Iniciar scraping manual (admin) |

### Autenticados (API Key via `x-api-key`)

| Metodo | Rota | Descricao |
|--------|------|-----------|
| `GET` | `/api/products` | Listar produtos (filtro: `?brand=` ou `?q=`) |

### WebSocket

| Rota | Descricao |
|------|-----------|
| `/ws/usage/:userId` | Atualizacoes de rate limit em tempo real |

### Exemplo de uso

```bash
# Listar todos os produtos
curl -H "x-api-key: SUA_CHAVE" https://seuservidor.com/api/products

# Filtrar por marca
curl -H "x-api-key: SUA_CHAVE" https://seuservidor.com/api/products?brand=Growth

# Buscar por nome
curl -H "x-api-key: SUA_CHAVE" https://seuservidor.com/api/products?q=creatina+500g
```

---

## Modelo de Dados

### Tabela `products`

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| `id` | `UUID` | Identificador unico (auto-gerado) |
| `brand` | `TEXT` | Marca do produto |
| `product_name` | `TEXT` | Nome completo do produto |
| `total_price` | `NUMERIC(10,2)` | Preco total em reais |
| `weight_grams` | `INTEGER` | Peso em gramas |
| `price_per_gram` | `NUMERIC(10,6)` | Preco por grama (calculado) |
| `currency` | `TEXT` | Moeda (default: `BRL`) |
| `in_stock` | `BOOLEAN` | Disponibilidade |
| `url` | `TEXT UNIQUE` | URL do produto (chave de deduplicacao) |
| `image_url` | `TEXT` | URL da imagem |
| `last_update` | `TIMESTAMP` | Ultima atualizacao |

---

## Como Rodar

### Pre-requisitos

- [Bun](https://bun.sh) >= 1.0
- [PostgreSQL](https://www.postgresql.org/) (ou [Neon](https://neon.tech) para serverless)
- [Playwright Chromium](https://playwright.dev/docs/browsers) — instalado automaticamente

### Instalacao

```bash
# Clonar o repositorio
git clone https://github.com/seu-usuario/potebarato.git
cd potebarato

# Instalar dependencias
bun install

# Instalar navegador do Playwright
bunx playwright install chromium

# Configurar variaveis de ambiente
cp .env.example .env
# Edite o .env com suas credenciais

# Rodar migrations do banco
bun run db:migrate

# Compilar CSS (Tailwind)
bun run css

# Iniciar em modo desenvolvimento (com HMR)
bun run dev
```

O servidor iniciara em `http://localhost:3000`.

---

## Variaveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
DATABASE_URL=postgresql://usuario:senha@host/banco
BETTER_AUTH_SECRET=sua_chave_secreta_aqui
BETTER_AUTH_URL=https://seu-dominio.com
```

| Variavel | Descricao |
|----------|-----------|
| `DATABASE_URL` | Connection string do PostgreSQL |
| `BETTER_AUTH_SECRET` | Chave secreta para sessoes/tokens |
| `BETTER_AUTH_URL` | URL publica da aplicacao (usada para CORS) |

---

## Scripts Disponiveis

```bash
bun run dev          # Servidor com HMR + compila CSS
bun run build        # Compila CSS para producao
bun run start        # Inicia o servidor em producao
bun run css          # Compila Tailwind CSS
bun run css:watch    # Compila CSS em modo watch
bun run db:generate  # Gerar migrations do Drizzle
bun run db:migrate   # Executar migrations
bun run db:push      # Push direto (apenas dev)
bun run db:studio    # Drizzle Studio (interface visual)
bun test             # Rodar testes
```

---

## Estrutura do Projeto

```
potebarato/
├── src/
│   ├── index.ts                 # Ponto de entrada — Bun.serve + rotas + cron
│   ├── db/
│   │   ├── index.ts             # Inicializacao do Drizzle ORM
│   │   ├── schema.ts            # Schema da tabela products
│   │   └── auth-schema.ts       # Schemas de autenticacao (Better Auth)
│   ├── frontend/
│   │   ├── landing.html         # Mount point da landing page
│   │   ├── landing.tsx          # Comparador de precos (React)
│   │   ├── auth.html            # Mount point do login
│   │   ├── auth.tsx             # Formulario de login/cadastro
│   │   ├── dashboard.html       # Mount point do painel
│   │   ├── dashboard.tsx        # Painel com API keys e admin
│   │   ├── input.css            # Entrada Tailwind CSS
│   │   └── styles.css           # CSS compilado
│   ├── lib/
│   │   ├── auth.ts              # Configuracao Better Auth
│   │   ├── auth-client.ts       # Cliente React do Better Auth
│   │   ├── env.ts               # Variaveis de ambiente
│   │   ├── openapi.ts           # Setup OpenAPI + Scalar docs
│   │   ├── rate-limit.ts        # Rate limiting + broadcast WebSocket
│   │   └── schemas.ts           # Schemas Zod para validacao
│   ├── middleware/
│   │   └── api-key-auth.ts      # Middleware de API key + rate limit
│   ├── routes/
│   │   ├── products.ts          # GET /api/products
│   │   ├── scrape.ts            # POST /api/scrape + status + landing
│   │   └── keys.ts              # CRUD de API keys
│   └── scraper/
│       ├── worker.ts            # Orquestrador: crawl → scrape → upsert
│       ├── crawler.ts           # Descoberta de URLs (sitemap + search)
│       ├── scraper.ts           # Extracao de dados (JSON-LD + CSS)
│       ├── db.ts                # Upsert de produtos no banco
│       ├── types.ts             # Interfaces (SiteConfig, ProductData)
│       └── sites/               # Configuracoes por loja
│           ├── index.ts
│           ├── gsuplementos.ts
│           ├── soldiers.ts
│           └── darklab.ts
├── drizzle/                     # Arquivos de migration
├── package.json
├── tsconfig.json
└── drizzle.config.ts
```

---

## Licenca

Este projeto e distribuido sob a licenca **MIT**. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---

<div align="center">

Feito com fins educacionais

**pote**<span style="color:#10b981">**barato**</span> — Comparando precos para voce economizar.

</div>
