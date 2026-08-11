import type { SiteConfig } from "../types";

export const masterway: SiteConfig = {
  baseUrl: "https://www.masterwaysuplementos.com.br",
  brand: "Masterway",
  // JSON-LD Product com offers válido — inclui price e availability
  jsonLdStrategy: "product",
  selectors: {
    productName: "h1",
    price: ".product-pix-value",
    inStock: "#button-cart",
  },
  // Masterway expõe .product-pix-value (5% off). JSON-LD traz o preço cheio.
  pixSelector: ".product-pix-value",
  // Sitemap apontado em robots.txt vai para domínio externo (demo.vowt.com.br).
  // Usa descoberta via página de categoria que lista todos os produtos.
  search: {
    path: "/creatina",
    linkSelector: 'a[href*="creatina"][href*="masterway"]',
  },
};
