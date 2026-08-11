import type { SiteConfig } from "../types";

export const maxtitanium: SiteConfig = {
  baseUrl: "https://www.maxtitanium.com.br",
  brand: "Max Titanium",
  // JSON-LD ProductGroup com hasVariant — mesmo padrão do Soldiers Nutrition.
  jsonLdStrategy: "product-group",
  selectors: {
    productName: "h1",
    price: "span[style]:not([class])",
    inStock: "button[class*='buy']:not([disabled])",
  },
  // Sitemap disponível em /sitemap.xml
  search: {
    path: "/produtos/aminoacidos/creatina",
    linkSelector: 'a[href*="maxtitanium"][href*="/p"]',
  },
};
