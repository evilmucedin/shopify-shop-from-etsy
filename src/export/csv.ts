import type { NormalizedProduct } from "../types.js";

/**
 * Build a product CSV that can be imported into Shopify without any Admin API
 * access:
 *
 *  - **Shopify Store Importer** (Settings → the built-in CSV product import) —
 *    the default flavor. Best for small/medium catalogs.
 *  - **Matrixify** (the "Excelify" app) — pass `{ matrixify: true }` to prepend
 *    a `Command` column (`MERGE`). Matrixify reads the same Shopify columns but
 *    handles very large catalogs without the browser timeouts the built-in
 *    importer hits.
 *
 * One product becomes one primary row plus one extra row per additional image
 * (the Shopify convention: extra rows repeat only the Handle + Image columns).
 */

export interface CsvOptions {
  /** Emit the Matrixify flavor (adds a leading `Command: MERGE` column). */
  matrixify?: boolean;
}

/** Standard Shopify product-import columns, in canonical order. */
const SHOPIFY_COLUMNS = [
  "Handle",
  "Title",
  "Body (HTML)",
  "Vendor",
  "Type",
  "Tags",
  "Published",
  "Option1 Name",
  "Option1 Value",
  "Variant SKU",
  "Variant Inventory Tracker",
  "Variant Inventory Qty",
  "Variant Inventory Policy",
  "Variant Fulfillment Service",
  "Variant Price",
  "Variant Requires Shipping",
  "Variant Taxable",
  "Image Src",
  "Image Position",
  "Image Alt Text",
  "Status",
] as const;

type ShopifyColumn = (typeof SHOPIFY_COLUMNS)[number];
type Row = Partial<Record<ShopifyColumn, string>> & { Command?: string };

/** Convert a title into a URL-safe, unique-per-run Shopify handle. */
export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "") // strip combining accents
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "listing"
  );
}

/** Escape one CSV field per RFC 4180 (quote when it contains , " or newline). */
export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Turn normalized products into Shopify-importable CSV text.
 * Handles are made unique by suffixing the Etsy listing id on collision.
 */
export function buildProductCsv(
  products: NormalizedProduct[],
  options: CsvOptions = {},
): string {
  const columns: string[] = options.matrixify
    ? ["Command", ...SHOPIFY_COLUMNS]
    : [...SHOPIFY_COLUMNS];

  const rows: Row[] = [];
  const usedHandles = new Set<string>();

  for (const product of products) {
    let handle = slugify(product.title);
    if (usedHandles.has(handle)) handle = `${handle}-${product.externalId}`;
    usedHandles.add(handle);

    const [firstImage, ...restImages] = product.imageUrls;

    const primary: Row = {
      Handle: handle,
      Title: product.title,
      "Body (HTML)": product.descriptionHtml,
      Vendor: "",
      Type: product.productType ?? "",
      Tags: product.tags.join(", "),
      Published: product.status === "active" ? "TRUE" : "FALSE",
      "Option1 Name": "Title",
      "Option1 Value": "Default Title",
      "Variant SKU": product.sku ?? "",
      "Variant Inventory Tracker": "shopify",
      "Variant Inventory Qty": String(product.quantity),
      "Variant Inventory Policy": "deny",
      "Variant Fulfillment Service": "manual",
      "Variant Price": product.priceAmount.toFixed(2),
      "Variant Requires Shipping": "TRUE",
      "Variant Taxable": "TRUE",
      "Image Src": firstImage ?? "",
      "Image Position": firstImage ? "1" : "",
      "Image Alt Text": firstImage ? product.title : "",
      Status: product.status,
    };
    if (options.matrixify) primary.Command = "MERGE";
    rows.push(primary);

    // Extra images: one row each, repeating only the Handle + Image columns.
    restImages.forEach((src, i) => {
      const imageRow: Row = {
        Handle: handle,
        "Image Src": src,
        "Image Position": String(i + 2),
        "Image Alt Text": product.title,
      };
      if (options.matrixify) imageRow.Command = "MERGE";
      rows.push(imageRow);
    });
  }

  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(
      columns.map((col) => csvEscape((row as Record<string, string>)[col] ?? "")).join(","),
    );
  }
  // Trailing newline so the file is well-formed for spreadsheet tools.
  return lines.join("\n") + "\n";
}
