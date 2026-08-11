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
  // Growth mostra o "preço à vista" (PIX/boleto, com ~10% off) em destaque,
  // enquanto o JSON-LD expõe o preço cheio no cartão. Preferimos o PIX.
  pixSelector: ".topo__box-direito-preco-vista, .preco-vista-default",
  search: {
    path: "/busca?busca={query}",
    linkSelector: 'a[href*="creatina"]',
    maxPages: 3,
  },
};
