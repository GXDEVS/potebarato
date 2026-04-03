export interface SiteConfig {
  baseUrl: string;
  brand: string;
  /** CSS selectors used as fallback when JSON-LD is not available */
  selectors: {
    productName: string;
    price: string;
    inStock: string;
  };
  /**
   * JSON-LD extraction strategy:
   * - "product" = top-level Product with offers.price (gsuplementos, darklab)
   * - "product-group" = ProductGroup with hasVariant[].offers.price (soldiers)
   */
  jsonLdStrategy: "product" | "product-group";
  /** Filter to select which sitemaps from robots.txt to use. If not set, uses all. */
  sitemapFilter?: RegExp;
}

export interface ProductData {
  brand: string;
  productName: string;
  totalPrice: number;
  weightGrams: number;
  pricePerGram: number;
  currency: string;
  inStock: boolean;
  url: string;
  lastUpdate: Date;
}
