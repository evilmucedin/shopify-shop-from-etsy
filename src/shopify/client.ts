import type { NormalizedProduct, ShopifyCredentials } from "../types.js";
import type { Fetcher } from "../etsy/client.js";

const API_VERSION = "2024-07";

export interface CreatedProduct {
  id: string;
  imagesAttached: number;
}

/**
 * Write-side client for the Shopify Admin REST API.
 * Network access is injected via `fetchImpl` so it can be mocked in tests.
 */
export class ShopifyClient {
  private readonly base: string;

  constructor(
    private readonly creds: ShopifyCredentials,
    private readonly fetchImpl: Fetcher = fetch,
  ) {
    const domain = creds.storeDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    this.base = `https://${domain}/admin/api/${API_VERSION}`;
  }

  private headers(): Record<string, string> {
    return {
      "X-Shopify-Access-Token": this.creds.adminToken,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  /** Verify credentials by fetching the shop record. Throws on failure. */
  async verify(): Promise<{ name: string; domain: string }> {
    const res = await this.fetchImpl(`${this.base}/shop.json`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Shopify auth failed (${res.status}): ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as { shop: { name: string; domain: string } };
    return { name: data.shop.name, domain: data.shop.domain };
  }

  /** Create a single product (with variant price/inventory + images). */
  async createProduct(product: NormalizedProduct): Promise<CreatedProduct> {
    const payload = {
      product: {
        title: product.title,
        body_html: product.descriptionHtml,
        tags: product.tags.join(", "),
        status: product.status,
        product_type: product.productType ?? "",
        variants: [
          {
            price: product.priceAmount.toFixed(2),
            sku: product.sku ?? "",
            inventory_quantity: product.quantity,
            inventory_management: "shopify",
          },
        ],
        images: product.imageUrls.map((src) => ({ src })),
      },
    };

    const res = await this.fetchImpl(`${this.base}/products.json`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Create product failed (${res.status}): ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      product: { id: number; images?: unknown[] };
    };
    return {
      id: String(data.product.id),
      imagesAttached: data.product.images?.length ?? 0,
    };
  }
}
