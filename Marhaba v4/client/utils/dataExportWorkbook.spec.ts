import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import {
  weightInKg,
  toFullDataRow,
  buildFullDataSheet,
  patchCacheDefinition,
  FULLDATA_COLUMNS,
  type ExportRow,
} from "./dataExportWorkbook";

const row: ExportRow = {
  type: "Crinkle",
  brand: "Lamb & Weston",
  product_name: "Fries 750g",
  weight_quantity: "750 gm",
  discounted_price: "6",
  regular_price: "10",
  country: "Kuwait",
  end_date: "2025-05-12",
};

const template = unzipSync(
  new Uint8Array(readFileSync(resolve(__dirname, "../../public/pivot-template.xlsx"))),
);

describe("data export workbook", () => {
  describe("weightInKg", () => {
    it("normalises grams, kilos and multipacks", () => {
      expect(weightInKg("750 gm")).toBeCloseTo(0.75);
      expect(weightInKg("2.5 kg")).toBeCloseTo(2.5);
      expect(weightInKg("4 x 200 gm")).toBeCloseTo(0.8);
      expect(weightInKg(null)).toBe(0);
    });
  });

  describe("toFullDataRow", () => {
    it("derives year, month, price per kg and discount", () => {
      const r = toFullDataRow(row);
      expect(r.flyer_year).toBe(2025);
      expect(r.mymonth).toBe(5);
      expect(r.pricperkg).toBeCloseTo(8); // 6 / 0.75
      expect(r.discount_percentage).toBeCloseTo(40); // (10-6)/10
    });

    it("leaves discount blank when the promo price is missing", () => {
      // A 0 promo price must not read as a 100% discount.
      expect(toFullDataRow({ regular_price: "10", discounted_price: "" }).discount_percentage).toBe(
        "",
      );
    });
  });

  describe("buildFullDataSheet", () => {
    const { xml } = buildFullDataSheet([toFullDataRow(row)]);

    it("writes the header in cache-field order and escapes text", () => {
      expect(xml).toContain('<t xml:space="preserve">country</t>');
      expect(xml).toContain('<t xml:space="preserve">Lamb &amp; Weston</t>');
      expect(xml).toContain('<dimension ref="A1:Q2"/>');
    });

    it("turns image URLs into hyperlinks on the image_location column", () => {
      const withImage = buildFullDataSheet([
        toFullDataRow({ ...row, image_path: "https://cdn.example.com/a.jpg?w=1&h=2" }),
      ]);
      // image_location is column O.
      expect(withImage.xml).toContain('<hyperlink ref="O2" r:id="rId1"/>');
      expect(withImage.rels).toContain('Target="https://cdn.example.com/a.jpg?w=1&amp;h=2"');
      expect(withImage.rels).toContain('TargetMode="External"');
    });

    it("skips hyperlinks for non-URL image paths", () => {
      const relative = buildFullDataSheet([toFullDataRow({ ...row, image_path: "pics/a.jpg" })]);
      expect(relative.xml).not.toContain("<hyperlinks>");
      expect(relative.rels).not.toContain("<Relationship ");
    });

    it("keeps the 15 pivot cache fields inside A:O", () => {
      // The cache source range is A:O, so nothing the pivots read may move.
      expect(FULLDATA_COLUMNS.slice(0, 15)).toEqual([
        "country",
        "retailer",
        "flyer_year",
        "mymonth",
        "segment",
        "sub_segment",
        "brand",
        "Variant",
        "retailer_desc",
        "price",
        "pricperkg",
        "discounted_from",
        "discount_percentage",
        "base_size",
        "image_location",
      ]);
    });
  });

  describe("pivot template", () => {
    const cacheXml = strFromU8(template["xl/pivotCache/pivotCacheDefinition1.xml"]);

    it("still declares exactly the cache fields the sheet writes into A:O", () => {
      const names = [...cacheXml.matchAll(/<cacheField name="([^"]+)"/g)].map((m) => m[1]);
      expect(names.map((n) => n.toLowerCase())).toEqual(
        FULLDATA_COLUMNS.slice(0, 15).map((n) => n.toLowerCase()),
      );
    });

    it("ships all five pivot tables", () => {
      const pivots = Object.keys(template).filter((f) =>
        /^xl\/pivotTables\/pivotTable\d+\.xml$/.test(f),
      );
      expect(pivots).toHaveLength(5);
    });

    it("repoints the cache and forces a refresh on open", () => {
      const patched = patchCacheDefinition(cacheXml, 3);
      expect(patched).toContain('<worksheetSource ref="A1:O4" sheet="fulldata"/>');
      expect(patched).toContain('refreshOnLoad="1"');
      expect(patched).toContain('recordCount="0"');
    });
  });
});
