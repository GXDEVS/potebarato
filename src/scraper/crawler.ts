import { chromium, type Page } from "playwright";
import type { SiteConfig } from "./types";

const HEADERS = {
  "User-Agent": "potebarato-bot/1.0",
};
const FETCH_TIMEOUT = 10_000;
const HEAD_CONCURRENCY = 10;
const SEARCH_QUERY = "creatina";

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

export function filterCreatinaUrls(urls: string[]): string[] {
  return urls.filter((url) => {
    const path = new URL(url).pathname.toLowerCase();
    // Must contain "creatin" in path
    if (!/creatin/.test(path)) return false;
    // Exclude kit/combo URLs
    if (/\/kit[-_]/.test(path)) return false;
    // Exclude capsules/tablets — we need weight in g/kg for price-per-gram
    if (/comprimido|comp\b|capsul|caps\b|tablet/.test(path)) return false;
    return true;
  });
}

/** Normalize URL by removing query params and trailing slashes */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return (u.origin + u.pathname).replace(/\/+$/, "");
  } catch {
    return url;
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${url}`);
  }
  return response.text();
}

async function expandSitemaps(sitemapUrls: string[]): Promise<string[]> {
  const allProductUrls: string[] = [];

  for (let i = 0; i < sitemapUrls.length; i += 5) {
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
        const nested = await expandSitemaps(productSitemaps);
        allProductUrls.push(...nested);
      } else {
        allProductUrls.push(...parsed.urls);
      }
    }
  }

  return allProductUrls;
}

// ---------------------------------------------------------------------------
// HEAD validation — filter out 404/dead URLs cheaply before scraping
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Search-based discovery — find products via the site's own search
// ---------------------------------------------------------------------------

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

  console.log(`[crawler] Search discovery for ${config.brand}: ${searchUrl}`);

  const browser = await chromium.launch({ headless: true });
  const found = new Set<string>();

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      extraHTTPHeaders: { "Accept-Language": "pt-BR,pt;q=0.9" },
    });
    const page = await context.newPage();

    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    // Wait a bit for JS-rendered results
    await page.waitForTimeout(3000);

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const links = await extractProductLinks(page, linkSelector, config.baseUrl);
      for (const link of links) found.add(link);

      if (pageNum >= maxPages || !nextSelector) break;

      const nextBtn = await page.$(nextSelector);
      if (!nextBtn) break;

      // Find the next page number — avoid revisiting current page
      const nextLinks = await page.$$eval(nextSelector, (els) =>
        els.map((el) => (el as HTMLAnchorElement).href)
      );
      const nextPageUrl = nextLinks.find(
        (href) => href && !href.includes(`page=${pageNum}`)
      );
      if (!nextPageUrl) break;

      await page.goto(nextPageUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await page.waitForTimeout(2000);
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

// ---------------------------------------------------------------------------
// Main crawl — combines sitemap + search, deduplicates, validates
// ---------------------------------------------------------------------------

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
