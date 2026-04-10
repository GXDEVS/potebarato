export interface SearchConfig {
  /** Search URL with {query} placeholder, e.g. "/search?q={query}&type=product" */
  path: string;
  /** CSS selector for product links in search results */
  linkSelector: string;
  /** CSS selector for "next page" link (optional, for classic pagination) */
  nextPageSelector?: string;
  /** CSS selector for JS "load more" button (optional, clicked until gone) */
  loadMoreSelector?: string;
  /** Max pages to follow during search pagination */
  maxPages?: number;
}

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
  /** Search-based URL discovery config */
  search?: SearchConfig;
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
  imageUrl: string | null;
  lastUpdate: Date;
}
