import type { SiteConfig } from "../types";

export const blackskull: SiteConfig = {
  baseUrl: "https://www.blackskullusa.com.br",
  brand: "Black Skull",
  // JSON-LD Product existe mas sem offers/price — CSS fallback obrigatório.
  // A loja é VTEX e preço é renderizado via React state.
  jsonLdStrategy: "product",
  selectors: {
    productName: "h1",
    price: ".vtex-product-price-1-x-sellingPriceValue",
    inStock: "button.vtex-button:not([disabled])",
  },
  // Sitemap disponível em /sitemap.xml (VTEX sitemap index com product sitemaps)
  search: {
    path: "/aminoacidos/creatina",
    linkSelector: 'a[href*="blackskullusa"][href*="/p"]',
  },
};
