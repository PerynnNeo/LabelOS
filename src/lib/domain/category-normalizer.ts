import {
  garmentCategorySchema,
  type GarmentCategory,
} from "@/lib/domain/schemas";

/**
 * Deterministic category normalisation.
 *
 * Maps imported Shopify product types and Claude analysis categories onto the
 * canonical LabelOS garment categories. Pure — no I/O, no randomness.
 *
 * Precedence:
 * 1. `analysisCategory` wins when it is (after normalisation) a valid
 *    canonical category.
 * 2. Otherwise the `productType` string is keyword-mapped.
 * 3. Otherwise "other".
 *
 * Matching is case- and whitespace-insensitive and tolerant of simple
 * English plurals ("Jeans" → "jean", "Dresses" → "dress").
 * When a product type contains several garment nouns (for example
 * "Short Sleeve Shirt"), the LAST matching token wins because English
 * product types put the head noun last.
 */

const CANONICAL_CATEGORIES: ReadonlySet<string> = new Set(
  garmentCategorySchema.options,
);

/** Keyword → category lookup. Keywords are single, singular, lowercase tokens. */
const KEYWORD_TO_CATEGORY: ReadonlyMap<string, GarmentCategory> = new Map<
  string,
  GarmentCategory
>([
  // top
  ["top", "top"],
  ["tee", "top"],
  ["tshirt", "top"],
  ["shirt", "top"],
  ["blouse", "top"],
  ["tank", "top"],
  ["camisole", "top"],
  ["cami", "top"],
  ["polo", "top"],
  ["tunic", "top"],
  ["sweater", "top"],
  ["jumper", "top"],
  ["pullover", "top"],
  ["knit", "top"],
  ["sweatshirt", "top"],
  ["hoodie", "top"],
  ["bodysuit", "top"],
  ["henley", "top"],
  ["turtleneck", "top"],
  // bottom
  ["bottom", "bottom"],
  ["trouser", "bottom"],
  ["pant", "bottom"],
  ["jean", "bottom"],
  ["short", "bottom"],
  ["skirt", "bottom"],
  ["chino", "bottom"],
  ["legging", "bottom"],
  ["jogger", "bottom"],
  ["culotte", "bottom"],
  ["slack", "bottom"],
  ["palazzo", "bottom"],
  // dress
  ["dress", "dress"],
  ["gown", "dress"],
  ["sundress", "dress"],
  // outerwear
  ["outerwear", "outerwear"],
  ["jacket", "outerwear"],
  ["coat", "outerwear"],
  ["blazer", "outerwear"],
  ["cardigan", "outerwear"],
  ["trench", "outerwear"],
  ["parka", "outerwear"],
  ["anorak", "outerwear"],
  ["windbreaker", "outerwear"],
  ["overcoat", "outerwear"],
  ["raincoat", "outerwear"],
  ["puffer", "outerwear"],
  ["bomber", "outerwear"],
  // footwear
  ["footwear", "footwear"],
  ["shoe", "footwear"],
  ["sneaker", "footwear"],
  ["sandal", "footwear"],
  ["boot", "footwear"],
  ["loafer", "footwear"],
  ["heel", "footwear"],
  ["trainer", "footwear"],
  ["mule", "footwear"],
  ["slipper", "footwear"],
  ["espadrille", "footwear"],
  // accessory
  ["accessory", "accessory"],
  ["bag", "accessory"],
  ["handbag", "accessory"],
  ["tote", "accessory"],
  ["clutch", "accessory"],
  ["scarf", "accessory"],
  ["belt", "accessory"],
  ["hat", "accessory"],
  ["cap", "accessory"],
  ["beanie", "accessory"],
  ["jewellery", "accessory"],
  ["jewelry", "accessory"],
  ["necklace", "accessory"],
  ["earring", "accessory"],
  ["bracelet", "accessory"],
  ["sunglass", "accessory"],
  ["purse", "accessory"],
  ["wallet", "accessory"],
  ["sock", "accessory"],
  ["glove", "accessory"],
]);

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

/**
 * Produce candidate singular forms for a token:
 * "dresses" → ["dresses", "dresse", "dress"], "jeans" → ["jeans", "jean"],
 * "accessories" → ["accessories", "accessory"].
 */
function singularForms(token: string): string[] {
  const forms = [token];
  if (token.length > 4 && token.endsWith("ies")) {
    forms.push(`${token.slice(0, -3)}y`);
  }
  if (token.length > 3 && token.endsWith("es")) {
    forms.push(token.slice(0, -2));
  }
  if (token.length > 2 && token.endsWith("s") && !token.endsWith("ss")) {
    forms.push(token.slice(0, -1));
  }
  return forms;
}

/** Returns the canonical category when the raw string IS one (plural tolerated). */
function matchCanonicalCategory(raw: string): GarmentCategory | null {
  const normalized = normalizeText(raw);
  for (const form of singularForms(normalized)) {
    if (CANONICAL_CATEGORIES.has(form)) {
      return form as GarmentCategory;
    }
  }
  return null;
}

/** Keyword-maps a free-form product type. Last matching token wins. */
function matchProductType(raw: string): GarmentCategory | null {
  let match: GarmentCategory | null = null;
  for (const token of tokenize(raw)) {
    for (const form of singularForms(token)) {
      const category = KEYWORD_TO_CATEGORY.get(form);
      if (category) {
        match = category;
        break;
      }
    }
  }
  return match;
}

export interface NormalizeCategoryInput {
  productType?: string | null;
  analysisCategory?: string | null;
}

/**
 * Normalise a product's category from its Claude analysis category and/or its
 * imported product type. Analysis wins when valid; product-type keyword
 * mapping is the fallback; the default is "other".
 */
export function normalizeCategory(
  input: NormalizeCategoryInput,
): GarmentCategory {
  const { productType, analysisCategory } = input;

  if (typeof analysisCategory === "string" && analysisCategory.trim() !== "") {
    const canonical = matchCanonicalCategory(analysisCategory);
    if (canonical) {
      return canonical;
    }
  }

  if (typeof productType === "string" && productType.trim() !== "") {
    const mapped =
      matchCanonicalCategory(productType) ?? matchProductType(productType);
    if (mapped) {
      return mapped;
    }
  }

  return "other";
}
