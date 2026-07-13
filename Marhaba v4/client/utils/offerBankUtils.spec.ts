import { describe, it, expect } from "vitest";
import {
  getRegionsForCountry,
  getCurrency,
  sameStringArray,
  splitRegionValues,
  normalizeSingleValue,
  normalizeMultiSelectForRpc,
  tryParseDate,
  parseValidRange,
  parsePrice
} from "./offerBankUtils";

describe("Offer Bank Utility Helpers", () => {
  describe("getRegionsForCountry", () => {
    it("should return regions for a valid country", () => {
      const qatarRegions = getRegionsForCountry("Qatar");
      expect(qatarRegions).toContain("Doha");
      expect(qatarRegions).toContain("Al Rayyan");
    });

    it("should return empty list for null/empty/invalid country", () => {
      expect(getRegionsForCountry(null)).toEqual([]);
      expect(getRegionsForCountry("Invalid")).toEqual([]);
    });
  });

  describe("getCurrency", () => {
    it("should return currency code for a valid country", () => {
      expect(getCurrency("Saudi Arabia")).toBe("SAR");
      expect(getCurrency("United Arab Emirates")).toBe("AED");
    });

    it("should return empty string for null/empty/invalid country", () => {
      expect(getCurrency(null)).toBe("");
      expect(getCurrency("Invalid")).toBe("");
    });
  });

  describe("sameStringArray", () => {
    it("should return true for identical string arrays", () => {
      expect(sameStringArray(["a", "b"], ["a", "b"])).toBe(true);
    });

    it("should return false for different arrays", () => {
      expect(sameStringArray(["a", "b"], ["a", "c"])).toBe(false);
      expect(sameStringArray(["a", "b"], ["a"])).toBe(false);
    });
  });

  describe("splitRegionValues", () => {
    it("should split multiple regions by separator, trim whitespace and filter out blanks", () => {
      expect(splitRegionValues("Doha; Al Rayyan | Abu Dhabi, Dubai")).toEqual([
        "Doha",
        "Al Rayyan",
        "Abu Dhabi",
        "Dubai"
      ]);
    });

    it("should return empty array for non-string input", () => {
      expect(splitRegionValues(null)).toEqual([]);
      expect(splitRegionValues(123)).toEqual([]);
    });
  });

  describe("normalizeSingleValue", () => {
    it("should trim string values", () => {
      expect(normalizeSingleValue("   test value   ")).toBe("test value");
    });

    it("should return empty string for non-string input", () => {
      expect(normalizeSingleValue(null)).toBe("");
      expect(normalizeSingleValue(123)).toBe("");
    });
  });

  describe("normalizeMultiSelectForRpc", () => {
    it("should return normalized list of items when subset is selected", () => {
      expect(
        normalizeMultiSelectForRpc(["  Doha  ", "Doha"], ["Doha", "Al Rayyan"])
      ).toEqual(["Doha"]);
    });

    it("should return null if empty selection list is passed", () => {
      expect(normalizeMultiSelectForRpc([], ["Doha"])).toBeNull();
    });

    it("should return null if all available options are selected", () => {
      expect(
        normalizeMultiSelectForRpc(["Doha", "Al Rayyan"], ["Doha", "Al Rayyan"])
      ).toBeNull();
    });
  });

  describe("tryParseDate", () => {
    it("should parse standard ISO dates", () => {
      const parsed = tryParseDate("2026-05-24");
      expect(parsed).toBeInstanceOf(Date);
      expect(parsed?.getFullYear()).toBe(2026);
    });

    it("should parse textual months", () => {
      const parsed = tryParseDate("May 24, 2026");
      expect(parsed?.getMonth()).toBe(4); // 0-indexed May
    });

    it("should parse slash and hyphen patterns", () => {
      const parsed = tryParseDate("24/05/2026");
      expect(parsed?.getDate()).toBe(24);
    });

    it("should return null for completely invalid text", () => {
      expect(tryParseDate("not-a-date")).toBeNull();
    });
  });

  describe("parseValidRange", () => {
    it("should parse a valid date range text separated by hyphens", () => {
      const range = parseValidRange("May 10, 2026 - May 20, 2026");
      expect(range?.from).toBeInstanceOf(Date);
      expect(range?.to).toBeInstanceOf(Date);
      expect(range?.from.getDate()).toBe(10);
      expect(range?.to.getDate()).toBe(20);
    });

    it("should infer missing year from end date", () => {
      const range = parseValidRange("May 10 - May 20, 2026");
      expect(range?.from.getFullYear()).toBe(2026);
      expect(range?.to.getFullYear()).toBe(2026);
    });

    it("should return null for invalid layouts", () => {
      expect(parseValidRange("May 10")).toBeNull();
      expect(parseValidRange("invalid range - string")).toBeNull();
    });
  });

  describe("parsePrice", () => {
    it("should return number for pure numbers", () => {
      expect(parsePrice(12.34)).toBe(12.34);
    });

    it("should parse number string", () => {
      expect(parsePrice("12.34")).toBe(12.34);
    });

    it("should return null for empty/dummy placeholders", () => {
      expect(parsePrice(null)).toBeNull();
      expect(parsePrice(undefined)).toBeNull();
      expect(parsePrice("")).toBeNull();
      expect(parsePrice("N/A")).toBeNull();
      expect(parsePrice("EMPTY")).toBeNull();
    });

    it("should return null for invalid text parse", () => {
      expect(parsePrice("invalid-price")).toBeNull();
    });
  });
});
