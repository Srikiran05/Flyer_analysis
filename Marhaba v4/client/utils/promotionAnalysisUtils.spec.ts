import { describe, it, expect } from "vitest";
import {
  getRawValue,
  formatValue,
  getPriceData,
  formatPriceSummary,
  PeriodAnalysis
} from "./promotionAnalysisUtils";

describe("Promotion Analysis Utility Helpers", () => {
  const dummyPeriod: PeriodAnalysis = {
    myBrandCount: 10,
    competitorCount: 20,
    totalCount: 30,
    myBrandShare: 0.33,
    competitorShare: 0.67,
    avgOfferPrice: { myBrand: 12.34, competitor: 15.67 },
    avgRegularPrice: { myBrand: 14.50, competitor: 18.00 },
    avgDiscount: { myBrand: 14.9, competitor: 12.9 },
    avgPricePerKg: { myBrand: 24.68, competitor: 31.34 },
  };

  describe("getRawValue", () => {
    it("should extract raw metric values correctly when fully populated", () => {
      expect(getRawValue(dummyPeriod, "offer", "myBrand")).toBe(12.34);
      expect(getRawValue(dummyPeriod, "regular", "competitor")).toBe(18.00);
      expect(getRawValue(dummyPeriod, "discount", "myBrand")).toBe(14.9);
      expect(getRawValue(dummyPeriod, "perkg", "competitor")).toBe(31.34);
    });

    it("should handle null or undefined periods gracefully and return 0", () => {
      expect(getRawValue(null, "offer", "myBrand")).toBe(0);
      expect(getRawValue(undefined, "regular", "competitor")).toBe(0);
    });

    it("should handle missing sub-objects and properties gracefully and return 0", () => {
      const partialPeriod = {
        avgOfferPrice: { myBrand: 10.00 }
      } as any;
      expect(getRawValue(partialPeriod, "offer", "competitor")).toBe(0);
      expect(getRawValue(partialPeriod, "regular", "myBrand")).toBe(0);
    });

    it("should handle NaN values gracefully and return 0", () => {
      const badPeriod = {
        avgOfferPrice: { myBrand: NaN, competitor: undefined }
      } as any;
      expect(getRawValue(badPeriod, "offer", "myBrand")).toBe(0);
    });
  });

  describe("formatValue", () => {
    it("should format currency values correctly", () => {
      expect(formatValue(12.34, "offer", "SAR")).toBe("SAR 12.3");
      expect(formatValue(15, "regular", "AED")).toBe("AED 15.0");
    });

    it("should format discount values as percentage correctly", () => {
      expect(formatValue(14.9, "discount", "SAR")).toBe("14.9%");
      expect(formatValue(0, "discount", "SAR")).toBe("0.0%");
    });

    it("should handle NaN or bad number inputs gracefully", () => {
      expect(formatValue(NaN, "offer", "SAR")).toBe("SAR 0.0");
    });
  });

  describe("getPriceData", () => {
    it("should parse and format a valid period correctly", () => {
      expect(getPriceData(dummyPeriod, "offer", "myBrand", "SAR")).toBe("SAR 12.3");
      expect(getPriceData(dummyPeriod, "discount", "competitor", "SAR")).toBe("12.9%");
    });

    it("should parse and format a null period gracefully", () => {
      expect(getPriceData(null, "offer", "myBrand", "SAR")).toBe("SAR 0.0");
      expect(getPriceData(undefined, "discount", "competitor", "SAR")).toBe("0.0%");
    });
  });

  describe("formatPriceSummary", () => {
    it("should create a formatted price summary mapping when fully populated", () => {
      const summary = formatPriceSummary(dummyPeriod, "SAR");
      expect(summary.offerPrice.myBrand).toBe("SAR 12.3");
      expect(summary.offerPrice.competitor).toBe("SAR 15.7");
      expect(summary.regularPrice.myBrand).toBe("SAR 14.5");
      expect(summary.regularPrice.competitor).toBe("SAR 18.0");
      expect(summary.discount.myBrand).toBe("14.9%");
      expect(summary.discount.competitor).toBe("12.9%");
      expect(summary.pricePerKg.myBrand).toBe("SAR 24.7");
      expect(summary.pricePerKg.competitor).toBe("SAR 31.3");
    });

    it("should build default summaries gracefully when period is empty or partial", () => {
      const summary = formatPriceSummary({}, "SAR");
      expect(summary.offerPrice.myBrand).toBe("SAR 0.0");
      expect(summary.offerPrice.competitor).toBe("SAR 0.0");
      expect(summary.discount.myBrand).toBe("0.0%");
      expect(summary.discount.competitor).toBe("0.0%");
    });
  });
});
