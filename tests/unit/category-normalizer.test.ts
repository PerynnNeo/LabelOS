import { describe, it, expect } from "vitest";
import { normalizeCategory } from "@/lib/domain/category-normalizer";

describe("normalizeCategory — product-type keyword mapping", () => {
  it("maps common product types onto canonical categories", () => {
    expect(normalizeCategory({ productType: "Shirt" })).toBe("top");
    expect(normalizeCategory({ productType: "Blouse" })).toBe("top");
    expect(normalizeCategory({ productType: "Trousers" })).toBe("bottom");
    expect(normalizeCategory({ productType: "Jeans" })).toBe("bottom");
    expect(normalizeCategory({ productType: "Midi Dress" })).toBe("dress");
    expect(normalizeCategory({ productType: "Blazer" })).toBe("outerwear");
    expect(normalizeCategory({ productType: "Bomber Jacket" })).toBe("outerwear");
    expect(normalizeCategory({ productType: "Sneakers" })).toBe("footwear");
    expect(normalizeCategory({ productType: "Woven Tote" })).toBe("accessory");
  });
});

describe("normalizeCategory — plural and case tolerance", () => {
  it("tolerates casing and simple English plurals", () => {
    expect(normalizeCategory({ productType: "DRESSES" })).toBe("dress");
    expect(normalizeCategory({ productType: "jeans" })).toBe("bottom");
    expect(normalizeCategory({ productType: "  Boots  " })).toBe("footwear");
    // canonical category words, pluralised, still resolve
    expect(normalizeCategory({ analysisCategory: "Accessories" })).toBe(
      "accessory",
    );
    expect(normalizeCategory({ analysisCategory: "TOPS" })).toBe("top");
  });
});

describe("normalizeCategory — last matching noun wins", () => {
  it("uses the head noun (last matching token) for multi-word types", () => {
    // "short" → bottom, "shirt" → top; the head noun is the shirt.
    expect(normalizeCategory({ productType: "Short Sleeve Shirt" })).toBe("top");
    // "jacket" is the head noun over "shirt".
    expect(normalizeCategory({ productType: "Shirt Jacket" })).toBe("outerwear");
  });
});

describe("normalizeCategory — analysis-category precedence", () => {
  it("prefers a valid analysis category over the product type", () => {
    expect(
      normalizeCategory({ productType: "Shirt", analysisCategory: "dress" }),
    ).toBe("dress");
    expect(
      normalizeCategory({ productType: "Jeans", analysisCategory: "outerwear" }),
    ).toBe("outerwear");
  });

  it("falls back to the product type when the analysis category is not canonical", () => {
    // A descriptive analysis string that is not one of the canonical categories
    // must not win — the product-type mapping is used instead.
    expect(
      normalizeCategory({
        productType: "Trousers",
        analysisCategory: "sequinned party number",
      }),
    ).toBe("bottom");
  });

  it("ignores an empty/whitespace analysis category", () => {
    expect(
      normalizeCategory({ productType: "Shirt", analysisCategory: "   " }),
    ).toBe("top");
  });
});

describe("normalizeCategory — unknown falls back to other", () => {
  it("returns 'other' when nothing matches", () => {
    expect(normalizeCategory({ productType: "Umbrella" })).toBe("other");
    expect(normalizeCategory({ productType: "" })).toBe("other");
    expect(normalizeCategory({})).toBe("other");
    expect(normalizeCategory({ productType: null, analysisCategory: null })).toBe(
      "other",
    );
  });
});
