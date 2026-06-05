import type {
  MigrationItemResult,
  MigrationSummary,
  NormalizedProduct,
} from "../types.js";
import { EtsyClient } from "../etsy/client.js";
import { ShopifyClient } from "../shopify/client.js";

export interface MigrateOptions {
  /** Optional callback for streaming progress (e.g. SSE / logs). */
  onProgress?: (event: ProgressEvent) => void;
  /** When true, fetch + normalize but do not write to Shopify. */
  dryRun?: boolean;
}

export interface ProgressEvent {
  type: "fetched" | "item" | "done";
  message: string;
  index?: number;
  total?: number;
  item?: MigrationItemResult;
}

/**
 * Orchestrates the one-click migration: read everything useful from Etsy,
 * then create matching products in Shopify. Resilient per-item: one failed
 * listing does not abort the whole run.
 */
export async function migrate(
  etsy: EtsyClient,
  shopify: ShopifyClient,
  options: MigrateOptions = {},
): Promise<MigrationSummary> {
  const startedAt = new Date().toISOString();
  const items: MigrationItemResult[] = [];

  const products = await etsy.fetchNormalizedProducts();
  options.onProgress?.({
    type: "fetched",
    message: `Fetched ${products.length} listing(s) from Etsy`,
    total: products.length,
  });

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const result = await migrateOne(product, shopify, options.dryRun ?? false);
    items.push(result);
    options.onProgress?.({
      type: "item",
      message: `${result.status}: ${result.title}`,
      index: i + 1,
      total: products.length,
      item: result,
    });
  }

  const summary: MigrationSummary = {
    totalFetched: products.length,
    created: items.filter((i) => i.status === "created").length,
    skipped: items.filter((i) => i.status === "skipped").length,
    failed: items.filter((i) => i.status === "failed").length,
    items,
    startedAt,
    finishedAt: new Date().toISOString(),
  };

  options.onProgress?.({
    type: "done",
    message: `Done. created=${summary.created} skipped=${summary.skipped} failed=${summary.failed}`,
    total: products.length,
  });

  return summary;
}

async function migrateOne(
  product: NormalizedProduct,
  shopify: ShopifyClient,
  dryRun: boolean,
): Promise<MigrationItemResult> {
  if (!product.title) {
    return {
      externalId: product.externalId,
      title: product.title,
      status: "skipped",
      error: "missing title",
    };
  }

  if (dryRun) {
    return {
      externalId: product.externalId,
      title: product.title,
      status: "skipped",
      error: "dry-run",
    };
  }

  try {
    const created = await shopify.createProduct(product);
    return {
      externalId: product.externalId,
      title: product.title,
      status: "created",
      shopifyProductId: created.id,
      imagesAttached: created.imagesAttached,
    };
  } catch (err) {
    return {
      externalId: product.externalId,
      title: product.title,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
