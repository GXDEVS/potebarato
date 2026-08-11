import { chromium, type Browser, type Page } from "playwright";
import type { SiteConfig, ProductData } from "./types";

// Configuracoes do pool de scraping e limites de retry
const POOL_SIZE = 3;         // Paginas simultaneas por site
const PAGE_TIMEOUT = 45_000; // Timeout de navegacao (ms)
const MAX_RETRIES = 2;       // Tentativas apos falha
const MIN_DELAY = 1000;      // Delay minimo entre paginas (ms)
const MAX_DELAY = 3000;      // Delay maximo entre paginas (ms)

interface JsonLdExtracted {
  name: string;
  brand: string;
  price: number;
  currency: string;
  inStock: boolean;
  imageUrl: string | null;
}

/**
 * Converte preco no formato brasileiro (R$1.299,00) para number.
 * Estrategia: isolar o primeiro trecho numerico apos "R$" (ou o primeiro
 * numero que encontrar) e normalizar vírgula/ponto. Isso evita lidar com
 * sufixos como "5% OFF", "no Pix" ou prefixos como "Preço à vista:".
 */
export function parsePrice(raw: string): number {
  const afterCurrency = raw.match(/R\$\s*([\d.,]+)/);
  const match = afterCurrency ?? raw.match(/(\d[\d.,]*)/);
  if (!match) return NaN;
  let cleaned = match[1]!.replace(/[,.]+$/, "");
  if (cleaned.includes(",")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  }
  return parseFloat(cleaned);
}

/**
 * Extrai o selo/label de pureza do nome do produto e URL.
 * - "Creapure" → certificação alemã, 99.99%+ de pureza
 * - "100% Pura" / "99%" → claim declarado pelo fabricante
 */
export function extractPurityLabel(name: string, url: string = ""): string | null {
  const combined = `${name} ${url}`;
  if (/creapure/i.test(combined)) return "Creapure";
  const pct = name.match(/(\d{2,3}(?:[.,]\d+)?)\s*%\s*(?:pura?|pureza)/i);
  if (pct) return pct[0].replace(/\s+/, " ").trim();
  return null;
}

/** Extrai peso em gramas do nome do produto (ex: "Creatina 1Kg" → 1000, "500g" → 500) */
export function extractWeightGrams(name: string): number | null {
  const kgMatch = name.match(/(\d+(?:[.,]\d+)?)\s*kg/i);
  if (kgMatch) {
    return Math.round(parseFloat(kgMatch[1]!.replace(",", ".")) * 1000);
  }
  const gMatch = name.match(/(\d+)\s*g(?:\b|$)/i);
  if (gMatch) {
    return parseInt(gMatch[1]!, 10);
  }
  return null;
}

function extractImageUrl(data: Record<string, unknown>): string | null {
  const img = data.image;
  if (typeof img === "string") return img;
  if (Array.isArray(img) && typeof img[0] === "string") return img[0];
  if (Array.isArray(img) && typeof img[0]?.url === "string") return img[0].url;
  if (typeof (img as Record<string, unknown>)?.url === "string")
    return (img as Record<string, string>).url;
  return null;
}

function extractFromProduct(data: Record<string, unknown>): JsonLdExtracted | null {
  const offer = Array.isArray(data.offers)
    ? data.offers[0]
    : data.offers;
  if (!offer) return null;
  return {
    name: data.name as string,
    brand: (data.brand as any)?.name ?? "",
    price: parseFloat(String(offer.price)),
    currency: offer.priceCurrency ?? "BRL",
    inStock: String(offer.availability ?? "").includes("InStock"),
    imageUrl: extractImageUrl(data),
  };
}

function extractFromProductGroup(data: Record<string, unknown>): JsonLdExtracted | null {
  const variant = (data as any).hasVariant?.[0];
  if (!variant?.offers) return null;
  const offer = Array.isArray(variant.offers)
    ? variant.offers[0]
    : variant.offers;
  return {
    name: variant.name ?? (data.name as string),
    brand: (data.brand as any)?.name ?? "",
    price: parseFloat(String(offer.price)),
    currency: offer.priceCurrency ?? "BRL",
    inStock: String(offer.availability ?? "").includes("InStock"),
    imageUrl: extractImageUrl(variant) ?? extractImageUrl(data),
  };
}

/** Seleciona a funcao de extracao correta baseado na estrategia do site */
function matchJsonLdItem(
  data: Record<string, unknown>,
  strategy: SiteConfig["jsonLdStrategy"]
): JsonLdExtracted | null {
  if (strategy === "product" && data["@type"] === "Product") {
    return extractFromProduct(data);
  }
  if (strategy === "product-group" && data["@type"] === "ProductGroup") {
    return extractFromProductGroup(data);
  }
  return null;
}

/** Percorre todos os blocos JSON-LD da pagina e extrai dados do produto */
export function extractJsonLdProduct(
  scripts: string[],
  strategy: SiteConfig["jsonLdStrategy"]
): JsonLdExtracted | null {
  for (const raw of scripts) {
    try {
      // Sanitize escaped slashes and invalid leading-zero numbers (e.g. gtin13: 0602...)
      const sanitized = raw
        .replace(/\\\//g, "/")
        .replace(/:\s*0(\d+)/g, ': "$1"');
      const parsed = JSON.parse(sanitized);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const data of items) {
        const result = matchJsonLdItem(data, strategy);
        if (result) return result;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(): Promise<void> {
  const ms = MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
  return delay(ms);
}

/**
 * Image fallback cascade (tries each until one succeeds):
 * 1. og:image meta tag
 * 2. twitter:image meta tag
 * 3. Shopify product .json API (for Shopify stores)
 * 4. First product img tag on the page
 */
async function fallbackImageUrl(page: Page, url: string): Promise<string | null> {
  const ogImage = await page.$eval(
    'meta[property="og:image"]',
    (el) => el.getAttribute("content")
  ).catch(() => null);
  if (ogImage) return ogImage;

  const twitterImage = await page.$eval(
    'meta[property="og:image:secure_url"], meta[name="twitter:image"]',
    (el) => el.getAttribute("content")
  ).catch(() => null);
  if (twitterImage) return twitterImage;

  const shopifyMatch = url.match(/\/products\/([^/?#]+)/);
  if (shopifyMatch) {
    try {
      const origin = new URL(url).origin;
      const jsonUrl = `${origin}/products/${shopifyMatch[1]}.json`;
      const res = await fetch(jsonUrl, {
        signal: AbortSignal.timeout(5000),
        headers: { "User-Agent": "potebarato-bot/1.0" },
      });
      if (res.ok) {
        const data = await res.json() as { product?: { image?: { src?: string }; images?: { src: string }[] } };
        const src = data.product?.image?.src ?? data.product?.images?.[0]?.src;
        if (src) return src;
      }
    } catch {
      // fallback seguinte
    }
  }

  const imgSrc = await page.$eval(
    'img[src*="product"], img[src*="cdn.shopify"], img[src*="upload/produto"]',
    (el) => (el as HTMLImageElement).src
  ).catch(() => null);

  return imgSrc;
}

/** Produto valido mas sem peso extraivel — nao deve ser retentado */
class SkipProductError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkipProductError";
  }
}

async function scrapePage(
  page: Page,
  url: string,
  config: SiteConfig
): Promise<ProductData | null> {
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: PAGE_TIMEOUT,
  });

  // Espera o nome do produto aparecer — cobre SPAs React/Next.js que só
  // injetam o HTML após hidratação. Bounded para não travar sites SSR.
  await page
    .waitForSelector(config.selectors.productName, { timeout: 10_000 })
    .catch(() => {});
  // Aguarda o preço específico quando o pixSelector está configurado —
  // React apps (Max Titanium) hidratam cada slot separadamente.
  if (config.pixSelector) {
    await page
      .waitForSelector(config.pixSelector, { timeout: 10_000 })
      .catch(() => {});
  }

  const jsonLdScripts = await page.$$eval(
    'script[type="application/ld+json"]',
    (scripts) => scripts.map((s) => s.textContent ?? "")
  );

  const extracted = extractJsonLdProduct(jsonLdScripts, config.jsonLdStrategy);

  let name: string;
  let price: number;
  let inStock: boolean;
  let brand: string;
  let currency: string;
  let imageUrl: string | null;

  if (extracted) {
    name = extracted.name;
    price = extracted.price;
    inStock = extracted.inStock;
    brand = extracted.brand || config.brand;
    currency = extracted.currency;
    imageUrl = extracted.imageUrl;
  } else {
    console.warn(`[scraper] No JSON-LD for ${url}, using CSS fallback`);
    name = await page.$eval(config.selectors.productName, (el) =>
      el.textContent?.trim() ?? ""
    );
    const priceText = await page.$eval(config.selectors.price, (el) =>
      el.textContent?.trim() ?? ""
    );
    price = parsePrice(priceText);
    const stockEl = await page.$(config.selectors.inStock);
    inStock = stockEl !== null;
    brand = config.brand;
    currency = "BRL";
    imageUrl = null;
  }

  if (!imageUrl) {
    imageUrl = await fallbackImageUrl(page, url);
    if (imageUrl) {
      console.log(`[scraper] Image found via fallback for ${url}`);
    }
  }

  // Tenta capturar o preço à vista/PIX quando o site publica um separado.
  // Sites como Growth, Dark Lab, Soldiers, Masterway e Max Titanium mostram
  // um preço de PIX menor que o preço parcelado/JSON-LD. Usamos o PIX quando
  // for realmente menor — caso contrário o site só repete o preço padrão.
  let cashPrice: number | null = null;
  if (config.pixSelector) {
    try {
      const pixText = await page.$eval(config.pixSelector, (el) =>
        el.textContent?.trim() ?? ""
      );
      const pixValue = parsePrice(pixText);
      if (!isNaN(pixValue) && pixValue > 0 && pixValue < price) {
        cashPrice = pixValue;
      }
    } catch {
      // selector missing on this page — sem PIX separado, segue com card price
    }
  }

  const finalPrice = cashPrice ?? price;

  const weightGrams = extractWeightGrams(name);
  if (!weightGrams) {
    throw new SkipProductError(`Could not extract weight from "${name}"`);
  }

  if (isNaN(finalPrice) || finalPrice <= 0) {
    throw new SkipProductError(`Invalid price for "${name}"`);
  }

  return {
    brand,
    productName: name,
    totalPrice: finalPrice,
    cashPrice,
    weightGrams,
    pricePerGram: Math.round((finalPrice / weightGrams) * 1_000_000) / 1_000_000,
    currency,
    inStock,
    url,
    imageUrl,
    purityLabel: extractPurityLabel(name, url),
    lastUpdate: new Date(),
  };
}

async function newContext(browser: Browser) {
  return browser.newContext({
    viewport: { width: 1280, height: 800 },
    // UA realista é obrigatório — Cloudflare/Max Titanium servem challenge
    // page quando o UA padrão do Playwright é detectado.
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    extraHTTPHeaders: {
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    },
  });
}

async function processQueue(
  browser: Browser,
  urls: string[],
  config: SiteConfig
): Promise<ProductData[]> {
  let context = await newContext(browser);
  const results: ProductData[] = [];

  for (const url of urls) {
    let product: ProductData | null = null;
    let page = await context.newPage();
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        product = await scrapePage(page, url, config);
        break;
      } catch (error) {
        if (error instanceof SkipProductError) {
          console.warn(`[scraper] ${error.message}, skipping`);
          break;
        }
        if (attempt < MAX_RETRIES) {
          console.log(`[scraper] Retry ${attempt + 1}/${MAX_RETRIES} for ${url}`);
          await delay(3000 * (attempt + 1));
          try { await page.close(); } catch {}
          // Se o context fechou junto, recria tudo
          try {
            page = await context.newPage();
          } catch {
            try { await context.close(); } catch {}
            context = await newContext(browser);
            page = await context.newPage();
          }
        } else {
          console.error(`[scraper] Failed to scrape ${url} after ${MAX_RETRIES} retries:`, error);
        }
      }
    }
    try { await page.close(); } catch {}
    if (product) results.push(product);
    await randomDelay();
  }

  try { await context.close(); } catch {}
  return results;
}

export async function scrape(
  urls: string[],
  config: SiteConfig
): Promise<ProductData[]> {
  if (urls.length === 0) return [];

  console.log(`[scraper] Scraping ${urls.length} URLs for ${config.brand}`);

  const browser = await chromium.launch({ headless: true });

  try {
    const poolSize = Math.min(POOL_SIZE, urls.length);
    const chunks: string[][] = Array.from({ length: poolSize }, () => []);
    urls.forEach((url, i) => {
      chunks[i % poolSize]!.push(url);
    });

    const results = await Promise.all(
      chunks.map((chunk) => processQueue(browser, chunk, config))
    );

    const allProducts = results.flat();
    console.log(
      `[scraper] Scraped ${allProducts.length}/${urls.length} products for ${config.brand}`
    );
    return allProducts;
  } finally {
    await browser.close();
  }
}
