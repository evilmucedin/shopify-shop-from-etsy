import { describe, it, expect } from "vitest";
import { buildProductCsv, slugify, csvEscape } from "../src/export/csv.js";
import type { NormalizedProduct } from "../src/types.js";

const base: NormalizedProduct = {
  externalId: "1",
  title: "Hand-knit Scarf",
  descriptionHtml: "<p>Cozy &amp; warm</p>",
  tags: ["scarf", "wool"],
  priceAmount: 25.99,
  currencyCode: "USD",
  quantity: 4,
  sku: "SC-001",
  status: "active",
  imageUrls: ["https://img/1.jpg", "https://img/2.jpg"],
  productType: "Accessories",
};

/** Split CSV into non-empty rows for easy assertions. */
function rows(csv: string): string[] {
  return csv.trimEnd().split("\n");
}

describe("slugify", () => {
  it("produces a url-safe handle", () => {
    expect(slugify("Hand-knit Scarf!")).toBe("hand-knit-scarf");
  });
  it("strips accents", () => {
    expect(slugify("Café Crème")).toBe("cafe-creme");
  });
  it("falls back for empty/symbol-only titles", () => {
    expect(slugify("")).toBe("listing");
    expect(slugify("!!!")).toBe("listing");
  });
});

describe("csvEscape", () => {
  it("leaves plain values untouched", () => {
    expect(csvEscape("hello")).toBe("hello");
  });
  it("quotes and doubles quotes for commas/quotes/newlines", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("buildProductCsv (Shopify Store Importer)", () => {
  it("emits a header plus one row per product and per extra image", () => {
    const csv = buildProductCsv([base]);
    const lines = rows(csv);
    expect(lines[0]).toMatch(/^Handle,Title,Body \(HTML\)/);
    expect(lines[0]).not.toMatch(/^Command,/);
    // primary row + one extra-image row
    expect(lines).toHaveLength(3);
    expect(csv.endsWith("\n")).toBe(true);
  });

  it("maps the core Shopify columns from a normalized product", () => {
    const csv = buildProductCsv([base]);
    const [, primary] = rows(csv);
    const cols = primary.split(",");
    expect(cols[0]).toBe("hand-knit-scarf"); // Handle
    expect(cols[1]).toBe("Hand-knit Scarf"); // Title
    expect(primary).toContain("Default Title"); // single-variant option value
    expect(primary).toContain("SC-001"); // SKU
    expect(primary).toContain("25.99"); // price, 2dp
    expect(primary).toContain("https://img/1.jpg"); // first image
    expect(primary).toMatch(/,active$/); // Status column last
  });

  it("puts extra images on their own handle-only rows", () => {
    const csv = buildProductCsv([base]);
    const imageRow = rows(csv)[2];
    expect(imageRow).toContain("hand-knit-scarf");
    expect(imageRow).toContain("https://img/2.jpg");
    expect(imageRow).toContain("2"); // Image Position
    // extra-image rows repeat only Handle + Image columns — no variant data
    expect(imageRow).not.toContain("SC-001");
    expect(imageRow).not.toContain("25.99");
  });

  it("escapes descriptions and tags containing commas/quotes", () => {
    const csv = buildProductCsv([
      { ...base, descriptionHtml: "<p>Soft, warm & \"cozy\"</p>", imageUrls: [] },
    ]);
    expect(csv).toContain('"<p>Soft, warm & ""cozy""</p>"');
  });

  it("marks draft/inactive listings as not published", () => {
    const csv = buildProductCsv([{ ...base, status: "draft", imageUrls: [] }]);
    const primary = rows(csv)[1];
    expect(primary).toContain("FALSE");
    expect(primary).toMatch(/,draft$/);
  });

  it("keeps handles unique when titles collide", () => {
    const csv = buildProductCsv([
      { ...base, externalId: "1", imageUrls: [] },
      { ...base, externalId: "2", imageUrls: [] },
    ]);
    const handles = rows(csv).slice(1).map((r) => r.split(",")[0]);
    expect(handles).toEqual(["hand-knit-scarf", "hand-knit-scarf-2"]);
  });
});

describe("buildProductCsv (Matrixify)", () => {
  it("prepends a Command column set to MERGE on every row", () => {
    const csv = buildProductCsv([base], { matrixify: true });
    const lines = rows(csv);
    expect(lines[0].startsWith("Command,Handle,Title,")).toBe(true);
    expect(lines[1].startsWith("MERGE,")).toBe(true);
    expect(lines[2].startsWith("MERGE,")).toBe(true); // extra-image row too
  });
});
