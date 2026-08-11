import { chromium, type Page } from "playwright";
import type { SiteConfig } from "./types";

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const HEADERS = { "User-Agent": "potebarato-bot/1.0" };
const FETCH_TIMEOUT = 10_000;     // Timeout para requests de sitemap/HEAD (ms)
const HEAD_CONCURRENCY = 10;      // Requests HEAD simultaneos para validacao
const SEARCH_QUERY = "creatina";  // Termo de busca nos sites
const MAX_URLS_PER_SITE = 500;    // Limite de URLs por site para evitar OOM
const MAX_SITEMAP_DEPTH = 3;      // Profundidade maxima de sitemapindex recursivo

/** Extrai URLs de sitemaps do robots.txt */
export function extractSitemapUrls(robotsTxt: string): string[] {
  return robotsTxt
    .split("\n")
    .filter((line) => line.toLowerCase().startsWith("sitemap:"))
    .map((line) => line.substring(line.indexOf(":") + 1).trim())
    .filter(Boolean);
}

type SitemapResult =
  | { type: "urlset"; urls: string[] }
  | { type: "sitemapindex"; urls: string[] };

/** Parseia XML de sitemap — suporta tanto sitemapindex quanto urlset */
export function parseSitemapXml(xml: string): SitemapResult {
  if (xml.includes("<sitemapindex")) {
    const urls: string[] = [];
    const regex = /<sitemap>\s*<loc>([^<]+)<\/loc>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      urls.push(match[1]!.trim());
    }
    return { type: "sitemapindex", urls };
  }

  const urls: string[] = [];
  const regex = /<url>\s*<loc>([^<]+)<\/loc>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    urls.push(match[1]!.trim());
  }
  return { type: "urlset", urls };
}

/**
 * Filtra URLs relevantes de creatina em po.
 * Exclui kits/combos e capsulas/comprimidos (precisam de peso em g/kg).
 */
export function filterCreatinaUrls(urls: string[]): string[] {
  return urls.filter((url) => {
    const path = new URL(url).pathname.toLowerCase();
    if (!/creatin/.test(path)) return false;
    if (/\/kit[-_]/.test(path)) return false;
    if (/^\/pack[-_/]|\/pack-/.test(path)) return false;
    if (/comprimido|comp\b|capsul|caps\b|tablet|goma|barra/.test(path)) return false;
    if (/vegan/.test(path)) return false;
    return true;
  });
}

/** Normaliza URL removendo query params e barras finais */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return (u.origin + u.pathname).replace(/\/+$/, "");
  } catch {
    return url;
  }
}

async function fetchText(url: string, retries = 3): Promise<string> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const response = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (response.ok) return response.text();
    // Retry on transient server errors (5xx)
    if (response.status >= 500 && attempt < retries) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      continue;
    }
    throw new Error(`Fetch failed: ${response.status} ${url}`);
  }
  throw new Error(`Fetch failed after ${retries} retries: ${url}`);
}

async function expandSitemaps(sitemapUrls: string[], depth = 0): Promise<string[]> {
  if (depth >= MAX_SITEMAP_DEPTH) {
    console.warn(`[crawler] Max sitemap depth (${MAX_SITEMAP_DEPTH}) reached, stopping recursion`);
    return [];
  }

  const allProductUrls: string[] = [];

  for (let i = 0; i < sitemapUrls.length; i += 5) {
    if (allProductUrls.length >= MAX_URLS_PER_SITE) {
      console.warn(`[crawler] URL limit (${MAX_URLS_PER_SITE}) reached in sitemap expansion`);
      break;
    }

    const batch = sitemapUrls.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map(async (url) => {
        const xml = await fetchText(url);
        return parseSitemapXml(xml);
      })
    );

    for (const result of results) {
      if (result.status === "rejected") {
        console.error("Sitemap fetch failed:", result.reason);
        continue;
      }
      const parsed = result.value;
      if (parsed.type === "sitemapindex") {
        const productSitemaps = parsed.urls.filter((u) =>
          u.includes("product")
        );
        const nested = await expandSitemaps(productSitemaps, depth + 1);
        allProductUrls.push(...nested);
      } else {
        allProductUrls.push(...parsed.urls);
      }
    }
  }

  return allProductUrls.slice(0, MAX_URLS_PER_SITE);
}

/** Verifica se a URL responde com status 2xx via HEAD request */
async function checkUrlAlive(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      redirect: "follow",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function validateUrls(urls: string[]): Promise<string[]> {
  const alive: string[] = [];

  for (let i = 0; i < urls.length; i += HEAD_CONCURRENCY) {
    const batch = urls.slice(i, i + HEAD_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (url) => ({ url, ok: await checkUrlAlive(url) }))
    );
    for (const { url, ok } of results) {
      if (ok) alive.push(url);
    }
  }

  const removed = urls.length - alive.length;
  if (removed > 0) {
    console.log(`[crawler] HEAD validation: ${removed}/${urls.length} dead URLs removed`);
  }

  return alive;
}

/** Descobre produtos via busca interna do site (Playwright) */
export async function discoverFromSearch(
  config: SiteConfig
): Promise<string[]> {
  if (!config.search) return [];

  const searchUrl =
    config.baseUrl +
    config.search.path.replace("{query}", encodeURIComponent(SEARCH_QUERY));
  const maxPages = config.search.maxPages ?? 3;
  const linkSelector = config.search.linkSelector;
  const nextSelector = config.search.nextPageSelector;
  const loadMoreSelector = config.search.loadMoreSelector;

  console.log(`[crawler] Search discovery for ${config.brand}: ${searchUrl}`);

  const browser = await chromium.launch({ headless: true });
  const found = new Set<string>();

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      extraHTTPHeaders: {
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      },
    });
    const page = await context.newPage();

    console.log(`[crawler:search] Navigating to search page...`);
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    console.log(`[crawler:search] Page loaded (title: "${await page.title()}"), waiting 6s for JS...`);
    // Wait for Cloudflare/JS verification to resolve before scraping links
    await delay(6000);
    console.log(`[crawler:search] Wait done (title: "${await page.title()}")`);

    // Click "load more" buttons until none remain (JS-rendered pagination)
    if (loadMoreSelector) {
      console.log(`[crawler:search] Using load-more strategy (selector: "${loadMoreSelector}")`);
      let clicks = 0;
      while (clicks < 10) {
        const btn = await page.$(loadMoreSelector);
        if (!btn) {
          console.log(`[crawler:search] No more load-more button after ${clicks} click(s)`);
          break;
        }
        console.log(`[crawler:search] Clicking load-more (click #${clicks + 1})...`);
        await btn.click();
        await delay(3000);
        clicks++;
      }
      const links = await extractProductLinks(page, linkSelector, config.baseUrl);
      console.log(`[crawler:search] Extracted ${links.length} links after load-more`);
      for (const link of links) found.add(link);
    } else {
      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        const links = await extractProductLinks(page, linkSelector, config.baseUrl);
        console.log(`[crawler:search] Page ${pageNum}: extracted ${links.length} links`);
        for (const link of links) found.add(link);

        if (pageNum >= maxPages || !nextSelector) break;

        const nextBtn = await page.$(nextSelector);
        if (!nextBtn) {
          console.log(`[crawler:search] No next-page button found, stopping at page ${pageNum}`);
          break;
        }

        const nextLinks = await page.$$eval(nextSelector, (els) =>
          els.map((el) => (el as HTMLAnchorElement).href)
        );
        const nextPageUrl = nextLinks.find(
          (href) => href && !href.includes(`page=${pageNum}`)
        );
        if (!nextPageUrl) {
          console.log(`[crawler:search] No next-page URL found, stopping at page ${pageNum}`);
          break;
        }

        console.log(`[crawler:search] Navigating to page ${pageNum + 1}: ${nextPageUrl}`);
        await page.goto(nextPageUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        await delay(2000);
      }
    }

    await context.close();
  } finally {
    await browser.close();
  }

  console.log(
    `[crawler] Search found ${found.size} unique URL(s) for ${config.brand}`
  );
  return [...found];
}

async function extractProductLinks(
  page: Page,
  selector: string,
  baseUrl: string
): Promise<string[]> {
  const hrefs = await page.$$eval(selector, (els) =>
    els.map((el) => (el as HTMLAnchorElement).href).filter(Boolean)
  );

  return hrefs
    .map((href) => {
      try {
        return new URL(href, baseUrl).href;
      } catch {
        return null;
      }
    })
    .filter((u): u is string => u !== null);
}

/** Pipeline principal: sitemap + search → deduplica → valida HEAD */
export async function crawl(config: SiteConfig): Promise<string[]> {
  console.log(`[crawler] Starting crawl for ${config.brand} (${config.baseUrl})`);

  // 1. Sitemap-based discovery
  let sitemapUrls: string[] = [];
  try {
    const robotsTxt = await fetchText(`${config.baseUrl}/robots.txt`);
    let sitemaps = extractSitemapUrls(robotsTxt);

    if (config.sitemapFilter) {
      sitemaps = sitemaps.filter((url) => config.sitemapFilter!.test(url));
    }

    if (sitemaps.length > 0) {
      console.log(`[crawler] Using ${sitemaps.length} sitemap(s) for ${config.brand}`);
      const allUrls = await expandSitemaps(sitemaps);
      sitemapUrls = filterCreatinaUrls(allUrls);
      console.log(`[crawler] Sitemap: ${sitemapUrls.length} creatina URL(s)`);
    } else {
      console.warn(`[crawler] No sitemaps found for ${config.brand}`);
    }
  } catch (error) {
    console.error(`[crawler] Sitemap crawl failed for ${config.brand}:`, error);
  }

  // 2. Search-based discovery
  let searchUrls: string[] = [];
  try {
    searchUrls = await discoverFromSearch(config);
    searchUrls = filterCreatinaUrls(searchUrls);
    console.log(`[crawler] Search: ${searchUrls.length} creatina URL(s) after filter`);
  } catch (error) {
    console.error(`[crawler] Search discovery failed for ${config.brand}:`, error);
  }

  // 3. Merge & deduplicate
  const seen = new Map<string, string>();
  for (const url of [...searchUrls, ...sitemapUrls]) {
    const key = normalizeUrl(url);
    if (!seen.has(key)) seen.set(key, url);
  }
  const merged = [...seen.values()];
  console.log(
    `[crawler] Merged: ${merged.length} unique URL(s) (sitemap: ${sitemapUrls.length}, search: ${searchUrls.length})`
  );

  // 4. HEAD validation — remove dead URLs
  const validated = await validateUrls(merged);
  console.log(`[crawler] Final: ${validated.length} valid URL(s) for ${config.brand}`);

  return validated;
}
