import type { SiteConfig } from "../types";

export const darklab: SiteConfig = {
  baseUrl: "https://darklabsuplementos.com.br",
  brand: "Dark Lab",
  jsonLdStrategy: "product",
  selectors: {
    productName: "h1",
    price: ".ec-price-custom__pix-value",
    inStock: ".product-form__submit",
  },
};
