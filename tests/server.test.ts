import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { app } from "../src/server.js";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const fullCreds = {
  etsy: { apiKey: "k", accessToken: "t", shopId: "42" },
  shopify: { storeDomain: "s.myshopify.com", adminToken: "shpat_x" },
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("static PWA", () => {
  it("serves index.html at /", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Etsy");
  });
});

describe("credential validation", () => {
  it("POST /api/verify rejects missing credentials with 400", async () => {
    const res = await fetch(`${baseUrl}/api/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.error).toMatch(/Missing credentials/);
  });

  it("POST /api/migrate rejects missing credentials with 400", async () => {
    const res = await fetch(`${baseUrl}/api/migrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ etsy: { apiKey: "only" } }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/shopify.storeDomain/);
  });
});

describe("POST /api/verify (network mocked)", () => {
  it("returns shop info when Shopify accepts the credentials", async () => {
    const realFetch = globalThis.fetch;
    const mock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/shop.json")) {
        return jsonResponse({ shop: { name: "Mocked", domain: "m.myshopify.com" } });
      }
      return realFetch(url as any, init as any);
    });
    vi.stubGlobal("fetch", mock);

    const res = await realFetch(`${baseUrl}/api/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fullCreds),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true, shop: { name: "Mocked", domain: "m.myshopify.com" } });
  });
});

describe("POST /api/export (CSV, network mocked)", () => {
  it("returns a downloadable CSV using only Etsy credentials", async () => {
    const realFetch = globalThis.fetch;
    const mock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/listings/active")) {
        return jsonResponse({
          count: 1,
          results: [
            {
              listing_id: 7,
              title: "Woven Basket",
              description: "d",
              price: { amount: 1500, divisor: 100, currency_code: "USD" },
              quantity: 2,
              state: "active",
            },
          ],
        });
      }
      if (u.includes("/images")) return jsonResponse({ results: [] });
      return realFetch(url as any, init as any);
    });
    vi.stubGlobal("fetch", mock);

    const res = await realFetch(`${baseUrl}/api/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ etsy: fullCreds.etsy }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/csv/);
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename=/);
    expect(res.headers.get("x-product-count")).toBe("1");
    const body = await res.text();
    expect(body.split("\n")[0]).toMatch(/^Handle,Title,Body \(HTML\)/);
    expect(body).toContain("woven-basket");
    expect(body).toContain("15.00");
  });

  it("uses the Matrixify flavor when format=matrixify", async () => {
    const realFetch = globalThis.fetch;
    const mock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/listings/active")) {
        return jsonResponse({
          count: 1,
          results: [{ listing_id: 7, title: "Basket", description: "d", state: "active" }],
        });
      }
      if (u.includes("/images")) return jsonResponse({ results: [] });
      return realFetch(url as any, init as any);
    });
    vi.stubGlobal("fetch", mock);

    const res = await realFetch(`${baseUrl}/api/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ etsy: fullCreds.etsy, format: "matrixify" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/matrixify/);
    const body = await res.text();
    expect(body.split("\n")[0].startsWith("Command,Handle,")).toBe(true);
  });

  it("rejects missing Etsy credentials with 400 (Shopify creds not required)", async () => {
    const res = await fetch(`${baseUrl}/api/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ etsy: { apiKey: "only" } }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/etsy.accessToken/);
    expect(data.error).not.toMatch(/shopify/);
  });
});

describe("POST /api/migrate (network mocked, SSE)", () => {
  it("streams progress and a final summary", async () => {
    const realFetch = globalThis.fetch;
    const mock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/listings/active")) {
        return jsonResponse({
          count: 1,
          results: [
            {
              listing_id: 1,
              title: "Thing",
              description: "d",
              price: { amount: 1000, divisor: 100, currency_code: "USD" },
              quantity: 1,
              state: "active",
            },
          ],
        });
      }
      if (u.includes("/images")) return jsonResponse({ results: [] });
      if (u.includes("/products.json")) return jsonResponse({ product: { id: 9, images: [] } });
      // Fall back to the real fetch for the test's own HTTP request to the server.
      return realFetch(url as any, init as any);
    });
    vi.stubGlobal("fetch", mock);

    const res = await realFetch(`${baseUrl}/api/migrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fullCreds),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);

    const body = await res.text();
    expect(body).toContain("event: progress");
    expect(body).toContain("event: summary");
    expect(body).toMatch(/"created":1/);
    expect(body).toMatch(/"shopifyProductId":"9"/);
  });
});
