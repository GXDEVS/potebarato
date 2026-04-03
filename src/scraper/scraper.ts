import { chromium, type Browser, type Page } from "playwright";
import type { SiteConfig, ProductData } from "./types";

const POOL_SIZE = 3;
const PAGE_TIMEOUT = 45_000;
const MAX_RETRIES = 2;
const MIN_DELAY = 1000;
const MAX_DELAY = 3000;

interface JsonLdExtracted {
  name: string;
  brand: string;
  price: number;
  currency: string;
  inStock: boolean;
  imageUrl: string | null;
}

export function parsePrice(raw: string): number {
  let cleaned = raw.replace(/R\$\s*/g, "").trim();
  cleaned = cleaned.replace(/\s+\d+%.*$/i, "").trim();
  if (cleaned.includes(",")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  }
  return parseFloat(cleaned);
}

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

export function extractJsonLdProduct(
  scripts: string[],
  strategy: SiteConfig["jsonLdStrategy"]
): JsonLdExtracted | null {
  for (const raw of scripts) {
    try {
      const parsed = JSON.parse(raw);
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
  // 1. og:image
  const ogImage = await page.$eval(
    'meta[property="og:image"]',
    (el) => el.getAttribute("content")
  ).catch(() => null);
  if (ogImage) return ogImage;

  // 2. twitter:image or og:image:secure_url
  const twitterImage = await page.$eval(
    'meta[property="og:image:secure_url"], meta[name="twitter:image"]',
    (el) => el.getAttribute("content")
  ).catch(() => null);
  if (twitterImage) return twitterImage;

  // 3. Shopify .json API — works for /products/<handle> URLs
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
      // ignore, try next fallback
    }
  }

  // 4. First product image on the page
  const imgSrc = await page.$eval(
    'img[src*="product"], img[src*="cdn.shopify"], img[src*="upload/produto"]',
    (el) => (el as HTMLImageElement).src
  ).catch(() => null);

  return imgSrc;
}

/** Thrown when a product is valid but not relevant (e.g. no weight) — should NOT be retried */
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

  // Image fallback cascade when JSON-LD didn't provide one
  if (!imageUrl) {
    imageUrl = await fallbackImageUrl(page, url);
    if (imageUrl) {
      console.log(`[scraper] Image found via fallback for ${url}`);
    }
  }

  const weightGrams = extractWeightGrams(name);
  if (!weightGrams) {
    throw new SkipProductError(`Could not extract weight from "${name}"`);
  }

  if (isNaN(price) || price <= 0) {
    throw new SkipProductError(`Invalid price for "${name}"`);
  }

  return {
    brand,
    productName: name,
    totalPrice: price,
    weightGrams,
    pricePerGram: Math.round((price / weightGrams) * 1_000_000) / 1_000_000,
    currency,
    inStock,
    url,
    imageUrl,
    lastUpdate: new Date(),
  };
}

async function processQueue(
  browser: Browser,
  urls: string[],
  config: SiteConfig
): Promise<ProductData[]> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: {
      "Accept-Language": "pt-BR,pt;q=0.9",
    },
  });
  const page = await context.newPage();
  const results: ProductData[] = [];

  for (const url of urls) {
    let product: ProductData | null = null;
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
        } else {
          console.error(`[scraper] Failed to scrape ${url} after ${MAX_RETRIES} retries:`, error);
        }
      }
    }
    if (product) {
      results.push(product);
    }
    await randomDelay();
  }

  await context.close();
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
