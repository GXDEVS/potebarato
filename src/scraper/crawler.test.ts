import { test, expect, describe } from "bun:test";
import {
  extractSitemapUrls,
  parseSitemapXml,
  filterCreatinaUrls,
  normalizeUrl,
} from "./crawler";

describe("extractSitemapUrls", () => {
  test("extrai URLs de sitemaps do robots.txt", () => {
    const robotsTxt = `User-agent: *
Disallow: /admin/
Sitemap: https://example.com/sitemap.xml
Sitemap: https://example.com/sitemap2.xml`;

    const result = extractSitemapUrls(robotsTxt);
    expect(result).toEqual([
      "https://example.com/sitemap.xml",
      "https://example.com/sitemap2.xml",
    ]);
  });

  test("retorna array vazio sem sitemaps", () => {
    const robotsTxt = `User-agent: *
Disallow: /admin/`;
    expect(extractSitemapUrls(robotsTxt)).toEqual([]);
  });

  test("case insensitive no prefixo Sitemap:", () => {
    const robotsTxt = `sitemap: https://example.com/sitemap.xml`;
    expect(extractSitemapUrls(robotsTxt)).toEqual(["https://example.com/sitemap.xml"]);
  });

  test("ignora linhas vazias", () => {
    const robotsTxt = `
Sitemap: https://example.com/sitemap.xml

`;
    expect(extractSitemapUrls(robotsTxt)).toHaveLength(1);
  });
});

describe("parseSitemapXml", () => {
  test("parseia urlset com URLs", () => {
    const xml = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/page1</loc></url>
  <url><loc>https://example.com/page2</loc></url>
</urlset>`;

    const result = parseSitemapXml(xml);
    expect(result.type).toBe("urlset");
    expect(result.urls).toEqual([
      "https://example.com/page1",
      "https://example.com/page2",
    ]);
  });

  test("parseia sitemapindex", () => {
    const xml = `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-products.xml</loc></sitemap>
</sitemapindex>`;

    const result = parseSitemapXml(xml);
    expect(result.type).toBe("sitemapindex");
    expect(result.urls).toEqual(["https://example.com/sitemap-products.xml"]);
  });

  test("retorna urlset vazio para XML sem URLs", () => {
    const result = parseSitemapXml("<urlset></urlset>");
    expect(result.type).toBe("urlset");
    expect(result.urls).toEqual([]);
  });
});

describe("filterCreatinaUrls", () => {
  test("inclui URLs com creatina no path", () => {
    const urls = [
      "https://example.com/creatina-500g",
      "https://example.com/creatine-monohydrate",
      "https://example.com/whey-protein",
    ];
    const result = filterCreatinaUrls(urls);
    expect(result).toEqual([
      "https://example.com/creatina-500g",
      "https://example.com/creatine-monohydrate",
    ]);
  });

  test("exclui kits", () => {
    const urls = [
      "https://example.com/kit-creatina-whey",
      "https://example.com/creatina-500g",
    ];
    expect(filterCreatinaUrls(urls)).toEqual(["https://example.com/creatina-500g"]);
  });

  test("exclui cápsulas e comprimidos", () => {
    const urls = [
      "https://example.com/creatina-capsulas",
      "https://example.com/creatina-comprimido",
      "https://example.com/creatina-500g",
    ];
    expect(filterCreatinaUrls(urls)).toEqual(["https://example.com/creatina-500g"]);
  });

  test("retorna array vazio se nenhuma URL tem creatina", () => {
    expect(filterCreatinaUrls(["https://example.com/whey"])).toEqual([]);
  });
});

describe("normalizeUrl", () => {
  test("remove query params", () => {
    expect(normalizeUrl("https://example.com/page?ref=123")).toBe("https://example.com/page");
  });

  test("remove trailing slash", () => {
    expect(normalizeUrl("https://example.com/page/")).toBe("https://example.com/page");
  });

  test("mantém URL sem query/trailing slash", () => {
    expect(normalizeUrl("https://example.com/page")).toBe("https://example.com/page");
  });

  test("retorna URL original se inválida", () => {
    expect(normalizeUrl("not-a-url")).toBe("not-a-url");
  });
});
