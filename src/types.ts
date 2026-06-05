// Shared domain types for the Etsy -> Shopify migration.

export interface EtsyCredentials {
  apiKey: string;
  accessToken: string;
  shopId: string;
}

export interface ShopifyCredentials {
  /** e.g. "my-store.myshopify.com" */
  storeDomain: string;
  /** Admin API access token, e.g. "shpat_..." */
  adminToken: string;
}

export interface MigrationCredentials {
  etsy: EtsyCredentials;
  shopify: ShopifyCredentials;
}

/** A normalized product, decoupled from both Etsy and Shopify wire formats. */
export interface NormalizedProduct {
  externalId: string; // Etsy listing id
  title: string;
  descriptionHtml: string;
  tags: string[];
  priceAmount: number; // major units, e.g. 12.50
  currencyCode: string;
  quantity: number;
  sku?: string;
  status: "active" | "draft";
  imageUrls: string[];
  productType?: string;
}

export interface MigrationItemResult {
  externalId: string;
  title: string;
  status: "created" | "skipped" | "failed";
  shopifyProductId?: string;
  imagesAttached?: number;
  error?: string;
}

export interface MigrationSummary {
  totalFetched: number;
  created: number;
  skipped: number;
  failed: number;
  items: MigrationItemResult[];
  startedAt: string;
  finishedAt: string;
}

/** Minimal subset of the Etsy Open API v3 listing shape we consume. */
export interface EtsyListing {
  listing_id: number;
  title: string;
  description: string;
  tags?: string[];
  price?: { amount: number; divisor: number; currency_code: string };
  quantity?: number;
  skus?: string[];
  state?: string;
  taxonomy_id?: number;
}
