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
  // Dark Lab renderiza "R$ X,XX no Pix" dentro de p.sticky-product-price,
  // enquanto o JSON-LD expõe o preço cheio no cartão.
  pixSelector: "p.sticky-product-price, .price__sale .price-item--last",
  search: {
    path: "/search?q={query}&type=product",
    linkSelector: 'a[href*="/products/"]',
    nextPageSelector: 'a[href*="page="]',
    maxPages: 3,
  },
};
