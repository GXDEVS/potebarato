import type { SiteConfig } from "../types";

export const gsuplementos: SiteConfig = {
  baseUrl: "https://www.gsuplementos.com.br",
  brand: "Growth Supplements",
  jsonLdStrategy: "product",
  sitemapFilter: /\/xml\/sitemap\.xml$/,
  selectors: {
    productName: "h1",
    price: ".preco-vista-default",
    inStock: ".em-estoque-default",
  },
  search: {
    path: "/busca?busca={query}",
    linkSelector: 'a[href*="creatina"]',
    maxPages: 3,
  },
};
