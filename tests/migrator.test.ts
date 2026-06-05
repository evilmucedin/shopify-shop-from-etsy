import { describe, it, expect, vi } from "vitest";
import { EtsyClient, normalizeListing } from "../src/etsy/client.js";
import { ShopifyClient } from "../src/shopify/client.js";
import { migrate } from "../src/migrate/migrator.js";
import type { EtsyListing } from "../src/types.js";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("normalizeListing", () => {
  it("converts Etsy price divisor and maps fields", () => {
    const listing: EtsyListing = {
      listing_id: 1,
      title: "  Hand-knit Scarf  ",
      description: "Cozy & warm\n\nMade to order",
      tags: ["scarf", "wool"],
      price: { amount: 2599, divisor: 100, currency_code: "USD" },
      quantity: 4,
      skus: ["SC-001"],
      state: "active",
    };
    const p = normalizeListing(listing, ["https://img/1.jpg"]);
    expect(p.title).toBe("Hand-knit Scarf");
    expect(p.priceAmount).toBe(25.99);
    expect(p.currencyCode).toBe("USD");
    expect(p.quantity).toBe(4);
    expect(p.sku).toBe("SC-001");
    expect(p.status).toBe("active");
    expect(p.imageUrls).toEqual(["https://img/1.jpg"]);
    expect(p.descriptionHtml).toContain("<p>Cozy &amp; warm</p>");
    expect(p.descriptionHtml).toContain("<p>Made to order</p>");
  });

  it("falls back gracefully on missing data", () => {
    const p = normalizeListing({ listing_id: 9, title: "", description: "" }, []);
    expect(p.title).toBe("Untitled listing");
    expect(p.priceAmount).toBe(0);
    expect(p.status).toBe("draft");
  });
});

describe("EtsyClient", () => {
  it("paginates active listings and fetches images", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("/listings/active") && url.includes("offset=0")) {
        const results = Array.from({ length: 100 }, (_, i) => ({
          listing_id: i,
          title: `L${i}`,
          description: "d",
          price: { amount: 100, divisor: 100, currency_code: "USD" },
          quantity: 1,
          state: "active",
        }));
        return jsonResponse({ count: 101, results });
      }
      if (url.includes("/listings/active") && url.includes("offset=100")) {
        return jsonResponse({
          count: 101,
          results: [
            {
              listing_id: 100,
              title: "L100",
              description: "d",
              price: { amount: 100, divisor: 100, currency_code: "USD" },
              quantity: 1,
              state: "active",
            },
          ],
        });
      }
      if (url.includes("/images")) {
        return jsonResponse({ results: [{ url_fullxfull: "https://img/x.jpg" }] });
      }
      throw new Error("unexpected url " + url);
    });

    const etsy = new EtsyClient(
      { apiKey: "k", accessToken: "t", shopId: "42" },
      fetchImpl as unknown as typeof fetch,
    );
    const products = await etsy.fetchNormalizedProducts();
    expect(products).toHaveLength(101);
    expect(products[0].imageUrls).toEqual(["https://img/x.jpg"]);
  });

  it("throws a descriptive error on non-ok responses", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "nope" }, false, 401));
    const etsy = new EtsyClient(
      { apiKey: "k", accessToken: "t", shopId: "1" },
      fetchImpl as unknown as typeof fetch,
    );
    await expect(etsy.listAllActiveListings()).rejects.toThrow(/Etsy API 401/);
  });
});

describe("migrate", () => {
  it("creates products in Shopify and summarizes results", async () => {
    const etsyFetch = vi.fn(async (url: string) => {
      if (url.includes("/listings/active")) {
        return jsonResponse({
          count: 2,
          results: [
            {
              listing_id: 1,
              title: "A",
              description: "a",
              price: { amount: 500, divisor: 100, currency_code: "USD" },
              quantity: 2,
              state: "active",
            },
            {
              listing_id: 2,
              title: "B",
              description: "b",
              price: { amount: 999, divisor: 100, currency_code: "USD" },
              quantity: 1,
              state: "active",
            },
          ],
        });
      }
      return jsonResponse({ results: [{ url_fullxfull: "https://img/a.jpg" }] });
    });

    let created = 0;
    const shopifyFetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/products.json") && init?.method === "POST") {
        created++;
        return jsonResponse({ product: { id: 1000 + created, images: [{ id: 1 }] } });
      }
      throw new Error("unexpected " + url);
    });

    const etsy = new EtsyClient(
      { apiKey: "k", accessToken: "t", shopId: "1" },
      etsyFetch as unknown as typeof fetch,
    );
    const shopify = new ShopifyClient(
      { storeDomain: "s.myshopify.com", adminToken: "shpat_x" },
      shopifyFetch as unknown as typeof fetch,
    );

    const events: string[] = [];
    const summary = await migrate(etsy, shopify, {
      onProgress: (e) => events.push(e.type),
    });

    expect(summary.totalFetched).toBe(2);
    expect(summary.created).toBe(2);
    expect(summary.failed).toBe(0);
    expect(summary.items[0].shopifyProductId).toBe("1001");
    expect(summary.items[0].imagesAttached).toBe(1);
    expect(events).toContain("done");
  });

  it("does not write during a dry run", async () => {
    const etsyFetch = vi.fn(async (url: string) => {
      if (url.includes("/listings/active")) {
        return jsonResponse({
          count: 1,
          results: [{ listing_id: 1, title: "A", description: "a", state: "active" }],
        });
      }
      return jsonResponse({ results: [] });
    });
    const shopifyFetch = vi.fn(async () => jsonResponse({}));

    const etsy = new EtsyClient(
      { apiKey: "k", accessToken: "t", shopId: "1" },
      etsyFetch as unknown as typeof fetch,
    );
    const shopify = new ShopifyClient(
      { storeDomain: "s.myshopify.com", adminToken: "shpat_x" },
      shopifyFetch as unknown as typeof fetch,
    );

    const summary = await migrate(etsy, shopify, { dryRun: true });
    expect(summary.skipped).toBe(1);
    expect(summary.created).toBe(0);
    expect(shopifyFetch).not.toHaveBeenCalled();
  });

  it("isolates per-item failures without aborting the run", async () => {
    const etsyFetch = vi.fn(async (url: string) => {
      if (url.includes("/listings/active")) {
        return jsonResponse({
          count: 2,
          results: [
            { listing_id: 1, title: "ok", description: "a", state: "active" },
            { listing_id: 2, title: "bad", description: "b", state: "active" },
          ],
        });
      }
      return jsonResponse({ results: [] });
    });
    const shopifyFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse((init?.body as string) ?? "{}");
      if (body.product?.title === "bad") return jsonResponse({ errors: "boom" }, false, 422);
      return jsonResponse({ product: { id: 7, images: [] } });
    });

    const etsy = new EtsyClient(
      { apiKey: "k", accessToken: "t", shopId: "1" },
      etsyFetch as unknown as typeof fetch,
    );
    const shopify = new ShopifyClient(
      { storeDomain: "s.myshopify.com", adminToken: "shpat_x" },
      shopifyFetch as unknown as typeof fetch,
    );

    const summary = await migrate(etsy, shopify);
    expect(summary.created).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.items.find((i) => i.title === "bad")?.error).toMatch(/422/);
  });
});
