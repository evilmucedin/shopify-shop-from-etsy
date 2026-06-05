import type { EtsyCredentials, EtsyListing, NormalizedProduct } from "../types.js";

const ETSY_BASE = "https://openapi.etsy.com/v3/application";

export type Fetcher = typeof fetch;

/**
 * Read-side client for the Etsy Open API v3.
 * Network access is injected via `fetchImpl` so it can be mocked in tests.
 */
export class EtsyClient {
  constructor(
    private readonly creds: EtsyCredentials,
    private readonly fetchImpl: Fetcher = fetch,
  ) {}

  private headers(): Record<string, string> {
    return {
      "x-api-key": this.creds.apiKey,
      Authorization: `Bearer ${this.creds.accessToken}`,
      Accept: "application/json",
    };
  }

  private async getJson<T>(url: string): Promise<T> {
    const res = await this.fetchImpl(url, { headers: this.headers() });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Etsy API ${res.status} for ${url}: ${body.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }

  /** Fetch all active listings for the shop, following pagination. */
  async listAllActiveListings(pageSize = 100): Promise<EtsyListing[]> {
    const out: EtsyListing[] = [];
    let offset = 0;
    // Cap pages to avoid runaway loops against an unexpected API.
    for (let page = 0; page < 1000; page++) {
      const url =
        `${ETSY_BASE}/shops/${encodeURIComponent(this.creds.shopId)}/listings/active` +
        `?limit=${pageSize}&offset=${offset}`;
      const data = await this.getJson<{ count: number; results: EtsyListing[] }>(url);
      const results = data.results ?? [];
      out.push(...results);
      if (results.length < pageSize) break;
      offset += pageSize;
    }
    return out;
  }

  /** Fetch image URLs for a listing, largest available first. */
  async listingImageUrls(listingId: number): Promise<string[]> {
    const url = `${ETSY_BASE}/listings/${listingId}/images`;
    const data = await this.getJson<{
      results: Array<{
        url_fullxfull?: string;
        url_570xN?: string;
        url_75x75?: string;
      }>;
    }>(url);
    return (data.results ?? [])
      .map((img) => img.url_fullxfull ?? img.url_570xN ?? img.url_75x75)
      .filter((u): u is string => Boolean(u));
  }

  /** Fetch listings and normalize them (including images) into NormalizedProduct. */
  async fetchNormalizedProducts(): Promise<NormalizedProduct[]> {
    const listings = await this.listAllActiveListings();
    const products: NormalizedProduct[] = [];
    for (const listing of listings) {
      const imageUrls = await this.listingImageUrls(listing.listing_id).catch(() => []);
      products.push(normalizeListing(listing, imageUrls));
    }
    return products;
  }
}

/** Pure transform: Etsy listing -> NormalizedProduct. Exported for testing. */
export function normalizeListing(
  listing: EtsyListing,
  imageUrls: string[],
): NormalizedProduct {
  const divisor = listing.price?.divisor || 100;
  const priceAmount = listing.price ? listing.price.amount / divisor : 0;
  return {
    externalId: String(listing.listing_id),
    title: listing.title?.trim() || "Untitled listing",
    descriptionHtml: textToHtml(listing.description ?? ""),
    tags: listing.tags ?? [],
    priceAmount: Number.isFinite(priceAmount) ? Number(priceAmount.toFixed(2)) : 0,
    currencyCode: listing.price?.currency_code ?? "USD",
    quantity: listing.quantity ?? 0,
    sku: listing.skus?.[0],
    status: listing.state === "active" ? "active" : "draft",
    imageUrls,
  };
}

function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}
