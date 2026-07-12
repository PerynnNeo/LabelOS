import { describe, it, expect } from "vitest";
import {
  computeCosting,
  normalizeQuote,
  compareQuotes,
  QUOTE_COMPARISON_WEIGHTS,
  type RfqQuoteInput,
} from "@/lib/domain/costing";
import type { QuotePayload } from "@/lib/domain/schemas";

function quote(overrides: Partial<QuotePayload> = {}): QuotePayload {
  return {
    unitPrice: 10,
    currency: "SGD",
    minimumOrderQuantity: 100,
    sampleFee: 0,
    sampleLeadDays: 14,
    productionLeadDays: 45,
    fabricResponsibility: "supplier",
    packagingIncluded: true,
    paymentTerms: "30/70",
    qualityProcess: "",
    defectPolicy: "",
    communicationNotes: "",
    freightEstimatePerUnit: 0,
    dutyEstimatePerUnit: 0,
    ...overrides,
  };
}

describe("computeCosting — maximum landed cost", () => {
  it("uses price × (1 − margin): 100 × (1 − 0.7) = 30", () => {
    const costing = computeCosting({
      targetRetailPrice: 100,
      targetGrossMargin: 0.7,
      currency: "SGD",
    });
    expect(costing.maximumLandedCost).toBe(30);
  });

  it("computes the detailed allowance breakdown at documented rates", () => {
    const { detailedEstimate } = computeCosting({
      targetRetailPrice: 100,
      targetGrossMargin: 0.7,
      currency: "SGD",
    });
    // Each allowance is a share of the 30.00 landed cost.
    expect(detailedEstimate.packagingAllowance).toBe(0.9); // 3%
    expect(detailedEstimate.freightAllowance).toBe(2.4); // 8%
    expect(detailedEstimate.dutyAllowance).toBe(1.5); // 5%
    expect(detailedEstimate.sampleAllocation).toBe(1.2); // 4%
    expect(detailedEstimate.returnAllowance).toBe(1.5); // 5%
    expect(detailedEstimate.maximumFactoryCost).toBe(22.5); // 30 − 7.5
  });

  it("the detailed estimate sums to no more than the landed cost", () => {
    const { maximumLandedCost, detailedEstimate: d } = computeCosting({
      targetRetailPrice: 129,
      targetGrossMargin: 0.62,
      currency: "SGD",
    });
    const allowances =
      d.packagingAllowance +
      d.freightAllowance +
      d.dutyAllowance +
      d.sampleAllocation +
      d.returnAllowance;
    expect(allowances).toBeLessThanOrEqual(maximumLandedCost + 1e-9);
    expect(allowances + d.maximumFactoryCost).toBeLessThanOrEqual(
      maximumLandedCost + 0.01,
    );
  });

  it("rounds money values to two decimals", () => {
    // 49.99 × 0.4 = 19.996 → 20.00
    const costing = computeCosting({
      targetRetailPrice: 49.99,
      targetGrossMargin: 0.6,
      currency: "SGD",
    });
    expect(costing.maximumLandedCost).toBe(20);
  });

  it("throws on an invalid price", () => {
    expect(() =>
      computeCosting({ targetRetailPrice: 0, targetGrossMargin: 0.7, currency: "SGD" }),
    ).toThrow(RangeError);
    expect(() =>
      computeCosting({ targetRetailPrice: -5, targetGrossMargin: 0.7, currency: "SGD" }),
    ).toThrow(RangeError);
    expect(() =>
      computeCosting({
        targetRetailPrice: Number.NaN,
        targetGrossMargin: 0.7,
        currency: "SGD",
      }),
    ).toThrow(RangeError);
  });

  it("throws on an out-of-range margin", () => {
    expect(() =>
      computeCosting({ targetRetailPrice: 100, targetGrossMargin: -0.1, currency: "SGD" }),
    ).toThrow(RangeError);
    expect(() =>
      computeCosting({ targetRetailPrice: 100, targetGrossMargin: 0.96, currency: "SGD" }),
    ).toThrow(RangeError);
  });
});

describe("normalizeQuote — amortised sample fee", () => {
  it("adds unit price, freight, duty and the amortised sample fee", () => {
    const result = normalizeQuote(
      quote({
        unitPrice: 10,
        freightEstimatePerUnit: 1,
        dutyEstimatePerUnit: 0.5,
        sampleFee: 100,
      }),
      100,
    );
    // 10 + 1 + 0.5 + 100/100 = 12.5
    expect(result.landedCostPerUnit).toBe(12.5);
  });

  it("throws on a non-positive-integer quantity", () => {
    expect(() => normalizeQuote(quote(), 0)).toThrow(RangeError);
    expect(() => normalizeQuote(quote(), -1)).toThrow(RangeError);
    expect(() => normalizeQuote(quote(), 3.5)).toThrow(RangeError);
  });
});

describe("compareQuotes", () => {
  it("has comparison weights that sum to exactly 1", () => {
    const total = Object.values(QUOTE_COMPARISON_WEIGHTS).reduce(
      (a, b) => a + b,
      0,
    );
    expect(total).toBeCloseTo(1, 10);
  });

  it("does NOT let the cheapest supplier auto-win when capability/quality is worse", () => {
    const cheapWeak: RfqQuoteInput = {
      rfqId: "11111111-1111-1111-1111-111111111111",
      supplierName: "CheapWeak",
      capabilities: [], // no required capabilities
      quote: quote({
        unitPrice: 8,
        sampleLeadDays: 30,
        productionLeadDays: 60,
        qualityProcess: "",
        defectPolicy: "",
      }),
    };
    const pricierStrong: RfqQuoteInput = {
      rfqId: "22222222-2222-2222-2222-222222222222",
      supplierName: "PricierStrong",
      capabilities: ["screenprint", "embroidery"],
      quote: quote({
        unitPrice: 12,
        sampleLeadDays: 10,
        productionLeadDays: 30,
        qualityProcess:
          "Documented AQL 2.5 inline and final inspection with a third-party audit and ISO-certified process controls across every production run.",
        defectPolicy:
          "Any defect above the agreed AQL is replaced or refunded, with a written inspection report.",
      }),
    };

    const results = compareQuotes({
      rfqs: [cheapWeak, pricierStrong],
      requiredCapabilities: ["screenprint", "embroidery"],
      quantity: 100,
      maximumLandedCost: 10,
    });

    // The stronger supplier wins overall despite being pricier.
    expect(results[0].supplierName).toBe("PricierStrong");
    const cheap = results.find((r) => r.supplierName === "CheapWeak")!;
    const strong = results.find((r) => r.supplierName === "PricierStrong")!;
    // The cheap supplier does have the best price fit…
    expect(cheap.priceFit).toBe(1);
    // …yet still loses on total score.
    expect(strong.totalScore).toBeGreaterThan(cheap.totalScore);
  });

  it("flags withinMaxLandedCost per supplier", () => {
    const results = compareQuotes({
      rfqs: [
        {
          rfqId: "11111111-1111-1111-1111-111111111111",
          supplierName: "CheapWeak",
          capabilities: [],
          quote: quote({ unitPrice: 8 }),
        },
        {
          rfqId: "22222222-2222-2222-2222-222222222222",
          supplierName: "PricierStrong",
          capabilities: ["screenprint", "embroidery"],
          quote: quote({ unitPrice: 12 }),
        },
      ],
      requiredCapabilities: [],
      quantity: 100,
      maximumLandedCost: 10,
    });
    const cheap = results.find((r) => r.supplierName === "CheapWeak")!;
    const strong = results.find((r) => r.supplierName === "PricierStrong")!;
    expect(cheap.withinMaxLandedCost).toBe(true); // 8 ≤ 10
    expect(strong.withinMaxLandedCost).toBe(false); // 12 > 10
  });

  it("throws on invalid quantity or negative maximumLandedCost", () => {
    const rfq: RfqQuoteInput = {
      rfqId: "11111111-1111-1111-1111-111111111111",
      supplierName: "X",
      capabilities: [],
      quote: quote(),
    };
    expect(() =>
      compareQuotes({ rfqs: [rfq], requiredCapabilities: [], quantity: 0, maximumLandedCost: 10 }),
    ).toThrow(RangeError);
    expect(() =>
      compareQuotes({ rfqs: [rfq], requiredCapabilities: [], quantity: 100, maximumLandedCost: -1 }),
    ).toThrow(RangeError);
  });
});
