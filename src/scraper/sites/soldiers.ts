import type { SiteConfig } from "../types";

export const soldiers: SiteConfig = {
  baseUrl: "https://soldiersnutrition.com.br",
  brand: "Soldiers Nutrition",
  jsonLdStrategy: "product-group",
  selectors: {
    productName: "h1",
    price: ".ec-price-custom__pix-value",
    inStock: ".product-form__submit",
  },
};
