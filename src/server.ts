import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import dotenv from "dotenv";
import type { EtsyCredentials, MigrationCredentials } from "./types.js";
import { EtsyClient } from "./etsy/client.js";
import { ShopifyClient } from "./shopify/client.js";
import { migrate } from "./migrate/migrator.js";
import { buildProductCsv } from "./export/csv.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Source lives in src/ (dev via tsx) and dist/ (prod). public/ is one level up.
const publicDir = path.resolve(__dirname, "..", "public");

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(express.static(publicDir));

/**
 * Resolve credentials: prefer request body, fall back to server env vars so the
 * app can also run in a single-operator mode.
 */
function resolveCredentials(body: any): MigrationCredentials | { error: string } {
  const etsy = {
    apiKey: body?.etsy?.apiKey || process.env.ETSY_API_KEY || "",
    accessToken: body?.etsy?.accessToken || process.env.ETSY_ACCESS_TOKEN || "",
    shopId: body?.etsy?.shopId || process.env.ETSY_SHOP_ID || "",
  };
  const shopify = {
    storeDomain: body?.shopify?.storeDomain || process.env.SHOPIFY_STORE_DOMAIN || "",
    adminToken: body?.shopify?.adminToken || process.env.SHOPIFY_ADMIN_TOKEN || "",
  };

  const missing: string[] = [];
  if (!etsy.apiKey) missing.push("etsy.apiKey");
  if (!etsy.accessToken) missing.push("etsy.accessToken");
  if (!etsy.shopId) missing.push("etsy.shopId");
  if (!shopify.storeDomain) missing.push("shopify.storeDomain");
  if (!shopify.adminToken) missing.push("shopify.adminToken");
  if (missing.length) return { error: `Missing credentials: ${missing.join(", ")}` };

  return { etsy, shopify };
}

/**
 * Resolve just the Etsy (read-side) credentials. Used by the CSV export path,
 * which needs no Shopify API access at all.
 */
function resolveEtsyCredentials(body: any): EtsyCredentials | { error: string } {
  const etsy = {
    apiKey: body?.etsy?.apiKey || process.env.ETSY_API_KEY || "",
    accessToken: body?.etsy?.accessToken || process.env.ETSY_ACCESS_TOKEN || "",
    shopId: body?.etsy?.shopId || process.env.ETSY_SHOP_ID || "",
  };
  const missing: string[] = [];
  if (!etsy.apiKey) missing.push("etsy.apiKey");
  if (!etsy.accessToken) missing.push("etsy.accessToken");
  if (!etsy.shopId) missing.push("etsy.shopId");
  if (missing.length) return { error: `Missing credentials: ${missing.join(", ")}` };
  return etsy;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

/** Validate that the supplied Shopify credentials work. */
app.post("/api/verify", async (req, res) => {
  const creds = resolveCredentials(req.body);
  if ("error" in creds) return res.status(400).json({ ok: false, error: creds.error });
  try {
    const shopify = new ShopifyClient(creds.shopify);
    const shop = await shopify.verify();
    res.json({ ok: true, shop });
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * The one-click migration. Streams progress as Server-Sent Events so phones and
 * laptops both get live feedback during a long run.
 */
app.post("/api/migrate", async (req, res) => {
  const creds = resolveCredentials(req.body);
  if ("error" in creds) return res.status(400).json({ ok: false, error: creds.error });

  const dryRun = Boolean(req.body?.dryRun);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const etsy = new EtsyClient(creds.etsy);
    const shopify = new ShopifyClient(creds.shopify);
    const summary = await migrate(etsy, shopify, {
      dryRun,
      onProgress: (e) => send("progress", e),
    });
    send("summary", summary);
  } catch (err) {
    send("error", { error: err instanceof Error ? err.message : String(err) });
  } finally {
    res.end();
  }
});

/**
 * Export listings as a Shopify-importable product CSV. This path needs only
 * Etsy credentials — no Shopify API access — so shops can bring listings over
 * via Shopify's built-in Store Importer, or via Matrixify for large catalogs.
 */
app.post("/api/export", async (req, res) => {
  const etsy = resolveEtsyCredentials(req.body);
  if ("error" in etsy) return res.status(400).json({ ok: false, error: etsy.error });

  const matrixify = req.body?.format === "matrixify" || Boolean(req.body?.matrixify);

  try {
    const client = new EtsyClient(etsy);
    const products = await client.fetchNormalizedProducts();
    const csv = buildProductCsv(products, { matrixify });

    const filename = matrixify
      ? "etsy-shopify-matrixify.csv"
      : "etsy-shopify-products.csv";
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-Product-Count", String(products.length));
    res.send(csv);
  } catch (err) {
    res.status(502).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

const port = Number(process.env.PORT) || 3000;
// Avoid binding a port when imported by tests.
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`shopify-shop-from-etsy running on http://localhost:${port}`);
  });
}

export { app };
