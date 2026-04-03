import type { SiteConfig } from "./types";

const HEADERS = {
  "User-Agent": "potebarato-bot/1.0",
};
const FETCH_TIMEOUT = 10_000;

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
    // Exclude kit/combo URLs — we want standalone creatina products only
    if (/\/kit[-_]/.test(path)) return false;
    return true;
  });
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

export async function crawl(config: SiteConfig): Promise<string[]> {
  console.log(`[crawler] Starting crawl for ${config.brand} (${config.baseUrl})`);

  const robotsTxt = await fetchText(`${config.baseUrl}/robots.txt`);
  let sitemapUrls = extractSitemapUrls(robotsTxt);

  if (sitemapUrls.length === 0) {
    console.warn(`[crawler] No sitemaps found for ${config.brand}`);
    return [];
  }

  // Filter sitemaps if config specifies a filter
  if (config.sitemapFilter) {
    sitemapUrls = sitemapUrls.filter((url) => config.sitemapFilter!.test(url));
  }

  console.log(`[crawler] Using ${sitemapUrls.length} sitemap(s) for ${config.brand}`);

  const allUrls = await expandSitemaps(sitemapUrls);
  const creatinUrls = filterCreatinaUrls(allUrls);

  console.log(`[crawler] Found ${creatinUrls.length} creatina URL(s) for ${config.brand}`);

  return creatinUrls;
}
