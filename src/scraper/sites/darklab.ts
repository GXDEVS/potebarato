import type { SiteConfig } from "../types";

export const darklab: SiteConfig = {
  baseUrl: "https://darklabsuplementos.com.br",
  brand: "Dark Lab",
  jsonLdStrategy: "product",
  selectors: {
    productName: ".product__title h1, .product__title .h3",
    price: ".product__info-wrapper .price-item--sale.price-item--last",
    inStock: "[name='add']:not([disabled])",
  },
  search: {
    path: "/search?q={query}&type=product",
    linkSelector: 'a[href*="/products/"]',
    nextPageSelector: 'a[href*="page="]',
    maxPages: 3,
  },
};
