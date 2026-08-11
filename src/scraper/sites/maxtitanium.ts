import type { SiteConfig } from "../types";

export const maxtitanium: SiteConfig = {
  baseUrl: "https://www.maxtitanium.com.br",
  brand: "Max Titanium",
  // JSON-LD ProductGroup com hasVariant — mesmo padrão do Soldiers Nutrition.
  jsonLdStrategy: "product-group",
  selectors: {
    productName: "h1",
    // IDs têm sufixo "-product-list-price" (preço cheio) e
    // "-product-promotional-price" (preço com desconto PIX exibido como
    // "R$ X,XX No Pix").
    price: "[id$='-product-list-price']",
    inStock: "button[class*='buy']:not([disabled])",
  },
  pixSelector: "[id$='-product-promotional-price']",
  // Sitemap disponível em /sitemap.xml
  search: {
    path: "/produtos/aminoacidos/creatina",
    linkSelector: 'a[href*="maxtitanium"][href*="/p"]',
  },
};
