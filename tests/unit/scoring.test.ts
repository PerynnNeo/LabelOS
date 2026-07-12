import { describe, it, expect } from "vitest";
import { computeWeightedScore } from "@/lib/domain/scoring";
import {
  REVIEW_SCORE_WEIGHTS,
  type OutfitReviewScores,
} from "@/lib/domain/schemas";

const FULL: OutfitReviewScores = {
  brandFit: 1,
  visualHarmony: 1,
  seasonClimateFit: 1,
  trendRelevance: 1,
  commercialValue: 1,
  novelty: 1,
};

function zeros(): OutfitReviewScores {
  return {
    brandFit: 0,
    visualHarmony: 0,
    seasonClimateFit: 0,
    trendRelevance: 0,
    commercialValue: 0,
    novelty: 0,
  };
}

describe("computeWeightedScore — exact arithmetic", () => {
  it("weights sum to 1 so all-ones yields exactly 1", () => {
    const total = Object.values(REVIEW_SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
    expect(computeWeightedScore(FULL)).toBe(1);
  });

  it("all-zeros yields exactly 0", () => {
    expect(computeWeightedScore(zeros())).toBe(0);
  });

  it("matches a hand-computed weighted total", () => {
    // 0.8*.25 + 0.6*.2 + 0.5*.15 + 0.4*.15 + 0.7*.15 + 0.2*.1
    // = 0.2 + 0.12 + 0.075 + 0.06 + 0.105 + 0.02 = 0.58
    const scores: OutfitReviewScores = {
      brandFit: 0.8,
      visualHarmony: 0.6,
      seasonClimateFit: 0.5,
      trendRelevance: 0.4,
      commercialValue: 0.7,
      novelty: 0.2,
    };
    expect(computeWeightedScore(scores)).toBe(0.58);
  });

  it("rounds to four decimal places", () => {
    // Only brandFit is non-zero: (1/3) * 0.25 = 0.0833333… → 0.0833
    const scores = { ...zeros(), brandFit: 1 / 3 };
    expect(computeWeightedScore(scores)).toBe(0.0833);
  });
});

describe("computeWeightedScore — out-of-range guard", () => {
  it("throws when any component exceeds 1", () => {
    expect(() =>
      computeWeightedScore({ ...zeros(), novelty: 1.1 }),
    ).toThrow(RangeError);
  });

  it("throws when any component is below 0", () => {
    expect(() =>
      computeWeightedScore({ ...zeros(), brandFit: -0.01 }),
    ).toThrow(RangeError);
  });

  it("throws on non-finite components", () => {
    expect(() =>
      computeWeightedScore({ ...zeros(), commercialValue: Number.NaN }),
    ).toThrow(RangeError);
    expect(() =>
      computeWeightedScore({ ...zeros(), trendRelevance: Number.POSITIVE_INFINITY }),
    ).toThrow(RangeError);
  });

  it("throws when a required component is missing", () => {
    const missing = {
      brandFit: 0.5,
      visualHarmony: 0.5,
      seasonClimateFit: 0.5,
      trendRelevance: 0.5,
      commercialValue: 0.5,
      // novelty omitted
    } as unknown as OutfitReviewScores;
    expect(() => computeWeightedScore(missing)).toThrow(RangeError);
  });
});
