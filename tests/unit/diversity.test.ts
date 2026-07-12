import { describe, it, expect } from "vitest";
import {
  jaccard,
  maxPairwiseJaccard,
  productUsageCounts,
} from "@/lib/domain/diversity";
import { curateFinalOutfits, type CurationOutfit } from "@/lib/domain/curation";

// ---------------------------------------------------------------------------
// jaccard / maxPairwiseJaccard / productUsageCounts
// ---------------------------------------------------------------------------

describe("jaccard similarity", () => {
  it("computes |A∩B| / |A∪B|", () => {
    expect(jaccard(["a", "b"], ["b", "c"])).toBeCloseTo(1 / 3, 10);
    expect(jaccard(["a", "b"], ["a", "b"])).toBe(1);
    expect(jaccard(["a"], ["b"])).toBe(0);
  });

  it("deduplicates each array before comparing", () => {
    expect(jaccard(["a", "a", "b"], ["b"])).toBe(1 / 2);
  });

  it("treats two empty sets as 0 (not identical)", () => {
    expect(jaccard([], [])).toBe(0);
  });
});

describe("maxPairwiseJaccard", () => {
  it("returns the largest pairwise similarity", () => {
    expect(
      maxPairwiseJaccard([
        ["a", "b"],
        ["b", "c"],
        ["x", "y"],
      ]),
    ).toBeCloseTo(1 / 3, 10);
  });

  it("returns 0 with fewer than two sets", () => {
    expect(maxPairwiseJaccard([])).toBe(0);
    expect(maxPairwiseJaccard([["a", "b"]])).toBe(0);
  });
});

describe("productUsageCounts", () => {
  it("counts each product once per outfit", () => {
    const counts = productUsageCounts([
      { productIds: ["a", "b"] },
      { productIds: ["b", "b", "c"] },
    ]);
    expect(counts.get("a")).toBe(1);
    expect(counts.get("b")).toBe(2);
    expect(counts.get("c")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// curateFinalOutfits
// ---------------------------------------------------------------------------

function outfit(
  id: string,
  productIds: string[],
  occasion: string,
  overallScore: number,
): CurationOutfit {
  return { id, productIds, occasion, overallScore, status: "approved" };
}

describe("curateFinalOutfits — happy path", () => {
  // Six fully-disjoint approved outfits, three occasions, scores descending.
  const outfits: CurationOutfit[] = [
    outfit("o1", ["p1", "p2"], "work", 0.9),
    outfit("o2", ["p3", "p4"], "dinner", 0.85),
    outfit("o3", ["p5", "p6"], "weekend", 0.8),
    outfit("o4", ["p7", "p8"], "work", 0.75),
    outfit("o5", ["p9", "p10"], "dinner", 0.7),
    outfit("o6", ["p11", "p12"], "weekend", 0.65),
  ];

  it("selects six and labels Core×3 / Directional×2 / Statement×1", () => {
    const summary = curateFinalOutfits({ outfits, heroProductIds: [] });
    expect(summary.selectedOutfitIds).toHaveLength(6);

    const labels = summary.labels;
    const byLabel = (l: string) =>
      Object.values(labels).filter((v) => v === l).length;
    expect(byLabel("Core")).toBe(3);
    expect(byLabel("Directional")).toBe(2);
    expect(byLabel("Statement")).toBe(1);

    // Top three by score are Core.
    expect(labels.o1).toBe("Core");
    expect(labels.o2).toBe("Core");
    expect(labels.o3).toBe("Core");
    expect(labels.o6).toBe("Statement");
  });

  it("covers at least three distinct occasions when the pool allows", () => {
    const summary = curateFinalOutfits({ outfits, heroProductIds: [] });
    const occasions = new Set(
      summary.occasionsCovered.map((o) => o.toLowerCase()),
    );
    expect(occasions.size).toBeGreaterThanOrEqual(3);
    expect(summary.unmetConstraints).toHaveLength(0);
  });

  it("is deterministic across runs", () => {
    const a = curateFinalOutfits({ outfits, heroProductIds: [] });
    const b = curateFinalOutfits({ outfits, heroProductIds: [] });
    expect(a.selectedOutfitIds).toEqual(b.selectedOutfitIds);
    expect(a.labels).toEqual(b.labels);
    expect(a.occasionsCovered).toEqual(b.occasionsCovered);
    expect(a.unmetConstraints).toEqual(b.unmetConstraints);
  });
});

describe("curateFinalOutfits — per-product usage cap (heroes exempt)", () => {
  // Three outfits all share the non-hero product "shared".
  const outfits: CurationOutfit[] = [
    outfit("o1", ["shared", "a"], "work", 0.9),
    outfit("o2", ["shared", "b"], "dinner", 0.85),
    outfit("o3", ["shared", "c"], "weekend", 0.8),
  ];

  it("relaxes the usage cap (and records it) when a non-hero product is overused", () => {
    const summary = curateFinalOutfits({
      outfits,
      heroProductIds: [],
      maxFinal: 3,
      maxJaccard: 1, // disable the diversity constraint to isolate usage
      maxUsesPerProduct: 2,
    });
    expect(summary.selectedOutfitIds).toContain("o3");
    expect(
      summary.unmetConstraints.some((c) => /per-product usage cap/i.test(c)),
    ).toBe(true);
  });

  it("exempts hero products from the usage cap (no relaxation needed)", () => {
    const summary = curateFinalOutfits({
      outfits,
      heroProductIds: ["shared"],
      maxFinal: 3,
      maxJaccard: 1,
      maxUsesPerProduct: 2,
    });
    expect(summary.selectedOutfitIds.sort()).toEqual(["o1", "o2", "o3"]);
    expect(
      summary.unmetConstraints.some((c) => /per-product usage cap/i.test(c)),
    ).toBe(false);
  });
});

describe("curateFinalOutfits — Jaccard diversity cap", () => {
  it("excludes a near-identical outfit under the strict pass", () => {
    const outfits: CurationOutfit[] = [
      outfit("oA", ["p1", "p2"], "work", 0.9),
      outfit("oB", ["p1", "p2"], "dinner", 0.85), // identical products to oA
      outfit("oC", ["p3", "p4"], "weekend", 0.8),
    ];
    const summary = curateFinalOutfits({
      outfits,
      heroProductIds: [],
      maxFinal: 2,
      maxJaccard: 0.5,
      maxUsesPerProduct: 5,
    });
    // oA (higher score) is kept; oB (Jaccard 1 vs oA) is excluded in favour of oC.
    expect(summary.selectedOutfitIds).toContain("oA");
    expect(summary.selectedOutfitIds).not.toContain("oB");
    expect(summary.selectedOutfitIds).toContain("oC");
    // The diversity constraint was satisfied (not relaxed).
    expect(
      summary.unmetConstraints.some((c) => /pairwise similarity/i.test(c)),
    ).toBe(false);
  });
});

describe("curateFinalOutfits — eligibility", () => {
  it("ignores outfits that are neither approved nor revised", () => {
    const outfits: CurationOutfit[] = [
      { ...outfit("o1", ["p1", "p2"], "work", 0.9), status: "candidate" },
      { ...outfit("o2", ["p3", "p4"], "dinner", 0.8), status: "rejected" },
    ];
    const summary = curateFinalOutfits({ outfits, heroProductIds: [] });
    expect(summary.selectedOutfitIds).toHaveLength(0);
  });
});
