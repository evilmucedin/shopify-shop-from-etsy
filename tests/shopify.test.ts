import { describe, it, expect, vi } from "vitest";
import { ShopifyClient } from "../src/shopify/client.js";
import type { NormalizedProduct } from "../src/types.js";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const product: NormalizedProduct = {
  externalId: "1",
  title: "Mug",
  descriptionHtml: "<p>nice</p>",
  tags: ["ceramic", "kitchen"],
  priceAmount: 12.5,
  currencyCode: "USD",
  quantity: 3,
  sku: "MUG-1",
  status: "active",
  imageUrls: ["https://img/1.jpg", "https://img/2.jpg"],
  productType: "Drinkware",
};

describe("ShopifyClient base URL", () => {
  it("normalizes domain with protocol and trailing slash", async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      seen.push(url);
      return jsonResponse({ shop: { name: "S", domain: "s.myshopify.com" } });
    });
    const client = new ShopifyClient(
      { storeDomain: "https://s.myshopify.com/", adminToken: "shpat_x" },
      fetchImpl as unknown as typeof fetch,
    );
    await client.verify();
    expect(seen[0]).toBe("https://s.myshopify.com/admin/api/2024-07/shop.json");
  });
});

describe("ShopifyClient.verify", () => {
  it("returns shop info on success", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ shop: { name: "Best Store", domain: "best.myshopify.com" } }),
    );
    const client = new ShopifyClient(
      { storeDomain: "best.myshopify.com", adminToken: "shpat_x" },
      fetchImpl as unknown as typeof fetch,
    );
    await expect(client.verify()).resolves.toEqual({
      name: "Best Store",
      domain: "best.myshopify.com",
    });
  });

  it("throws a descriptive error on auth failure", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ errors: "bad token" }, false, 401));
    const client = new ShopifyClient(
      { storeDomain: "s.myshopify.com", adminToken: "bad" },
      fetchImpl as unknown as typeof fetch,
    );
    await expect(client.verify()).rejects.toThrow(/Shopify auth failed \(401\)/);
  });
});

describe("ShopifyClient.createProduct", () => {
  it("sends a correct payload and parses the response", async () => {
    let captured: any;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      captured = { url, init };
      return jsonResponse({ product: { id: 555, images: [{ id: 1 }, { id: 2 }] } });
    });
    const client = new ShopifyClient(
      { storeDomain: "s.myshopify.com", adminToken: "shpat_x" },
      fetchImpl as unknown as typeof fetch,
    );

    const created = await client.createProduct(product);

    expect(created).toEqual({ id: "555", imagesAttached: 2 });
    expect(captured.url).toMatch(/\/products\.json$/);
    expect(captured.init.method).toBe("POST");
    expect(captured.init.headers["X-Shopify-Access-Token"]).toBe("shpat_x");

    const body = JSON.parse(captured.init.body);
    expect(body.product.title).toBe("Mug");
    expect(body.product.tags).toBe("ceramic, kitchen");
    expect(body.product.status).toBe("active");
    expect(body.product.product_type).toBe("Drinkware");
    expect(body.product.variants[0]).toMatchObject({
      price: "12.50",
      sku: "MUG-1",
      inventory_quantity: 3,
      inventory_management: "shopify",
    });
    expect(body.product.images).toEqual([
      { src: "https://img/1.jpg" },
      { src: "https://img/2.jpg" },
    ]);
  });

  it("defaults sku and product_type when absent", async () => {
    let body: any;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      body = JSON.parse((init?.body as string) ?? "{}");
      return jsonResponse({ product: { id: 1 } });
    });
    const client = new ShopifyClient(
      { storeDomain: "s.myshopify.com", adminToken: "shpat_x" },
      fetchImpl as unknown as typeof fetch,
    );
    const created = await client.createProduct({ ...product, sku: undefined, productType: undefined });
    expect(body.product.variants[0].sku).toBe("");
    expect(body.product.product_type).toBe("");
    expect(created.imagesAttached).toBe(0);
  });

  it("throws when product creation fails", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ errors: "title invalid" }, false, 422));
    const client = new ShopifyClient(
      { storeDomain: "s.myshopify.com", adminToken: "shpat_x" },
      fetchImpl as unknown as typeof fetch,
    );
    await expect(client.createProduct(product)).rejects.toThrow(/Create product failed \(422\)/);
  });
});
