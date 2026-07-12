import type {
  CollectionBrief,
  GarmentAnalysis,
  GarmentCategory,
  OutfitCandidate,
} from "@/lib/domain/schemas";

/**
 * Deterministic outfit candidate generation.
 *
 * Claude never invents combinations from scratch: this module enumerates
 * valid templates from real catalog product IDs, applies hard exclusions,
 * scores each combination with transparent heuristics, and returns a stable,
 * reproducible candidate list. The same input always produces the same
 * candidates in the same order.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CandidateProduct {
  id: string;
  title: string;
  category: GarmentCategory;
  available: boolean;
  analysis: GarmentAnalysis | null;
  inventoryQuantity: number;
  price: number;
}

export interface GenerateCandidatesInput {
  products: CandidateProduct[];
  brief: CollectionBrief;
  /** Hard cap on returned candidates. Default 60. */
  maxCandidates?: number;
}

// ---------------------------------------------------------------------------
// Tuning constants (exported so the UI can explain the heuristics)
// ---------------------------------------------------------------------------

export const DEFAULT_MAX_CANDIDATES = 60;

/** Per-category enumeration cap to keep combination counts bounded. */
const MAX_PER_CATEGORY = 40;

/** Minimum accessory colour-pairing score before an accessory is appended. */
const ACCESSORY_PAIRING_THRESHOLD = 0.5;

/** Heuristic component weights. They sum to exactly 1.0. */
export const HEURISTIC_WEIGHTS = {
  colourCompatibility: 0.22,
  formalityAlignment: 0.18,
  climateFit: 0.15,
  seasonFit: 0.1,
  occasionOverlap: 0.15,
  silhouetteBalance: 0.1,
  heroPresence: 0.1,
} as const;

// ---------------------------------------------------------------------------
// Small deterministic utilities
// ---------------------------------------------------------------------------

/** 32-bit FNV-1a hash, returned as a zero-padded 8-char lowercase hex string. */
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

function byIdAsc(a: CandidateProduct, b: CandidateProduct): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Colour families
// ---------------------------------------------------------------------------

const COLOUR_FAMILY_KEYWORDS: ReadonlyArray<readonly [string, readonly string[]]> =
  [
    ["black", ["black", "jet", "onyx"]],
    ["white", ["white", "ivory", "cream", "offwhite", "ecru", "eggshell"]],
    ["grey", ["grey", "gray", "charcoal", "slate", "graphite", "silver"]],
    [
      "beige",
      ["beige", "tan", "khaki", "sand", "stone", "camel", "taupe", "oatmeal"],
    ],
    ["navy", ["navy", "midnight"]],
    ["blue", ["blue", "cobalt", "azure", "sky", "denim", "indigo", "teal"]],
    ["red", ["red", "burgundy", "maroon", "wine", "crimson", "scarlet", "cherry"]],
    ["pink", ["pink", "blush", "rose", "fuchsia", "magenta"]],
    ["orange", ["orange", "rust", "coral", "terracotta", "apricot", "peach"]],
    ["yellow", ["yellow", "mustard", "gold", "lemon", "butter"]],
    ["green", ["green", "olive", "sage", "emerald", "mint", "forest", "moss"]],
    ["purple", ["purple", "lilac", "lavender", "violet", "plum", "mauve"]],
    ["brown", ["brown", "chocolate", "coffee", "mocha", "espresso", "cognac"]],
  ];

const NEUTRAL_FAMILIES: ReadonlySet<string> = new Set([
  "black",
  "white",
  "grey",
  "beige",
  "navy",
  "brown",
]);

function colourFamiliesOf(colours: string[]): Set<string> {
  const families = new Set<string>();
  for (const colour of colours) {
    const tokens = tokenize(colour);
    let matched: string | null = null;
    for (const [family, keywords] of COLOUR_FAMILY_KEYWORDS) {
      if (keywords.some((keyword) => tokens.includes(keyword))) {
        matched = family;
        break;
      }
    }
    if (matched) {
      families.add(matched);
    } else if (tokens.length > 0) {
      families.add(tokens[tokens.length - 1]);
    }
  }
  return families;
}

function isAllNeutral(families: Set<string>): boolean {
  if (families.size === 0) return false;
  for (const family of families) {
    if (!NEUTRAL_FAMILIES.has(family)) return false;
  }
  return true;
}

function hasSharedFamily(a: Set<string>, b: Set<string>): string | null {
  for (const family of a) {
    if (b.has(family)) return family;
  }
  return null;
}

/** Pairwise colour-compatibility score between two garments' primary palettes. */
function colourPairScore(a: Set<string>, b: Set<string>): number {
  if (hasSharedFamily(a, b)) return 1;
  if (isAllNeutral(a) || isAllNeutral(b)) return 0.85;
  const anyNeutral = [...a, ...b].some((family) =>
    NEUTRAL_FAMILIES.has(family),
  );
  if (anyNeutral) return 0.6;
  return 0.35;
}

// ---------------------------------------------------------------------------
// Hard exclusions
// ---------------------------------------------------------------------------

const HOT_BRIEF_HINTS: ReadonlySet<string> = new Set([
  "tropical",
  "hot",
  "humid",
  "warm",
  "equatorial",
]);

const COLD_ONLY_TAG_TOKENS: ReadonlySet<string> = new Set([
  "cold",
  "coldweather",
  "heavy",
  "winter",
  "thermal",
  "insulated",
]);

const HOT_COMPATIBLE_TAG_TOKENS: ReadonlySet<string> = new Set([
  "hot",
  "warm",
  "tropical",
  "humid",
  "summer",
  "breathable",
  "lightweight",
  "light",
]);

function briefIsHotClimate(brief: CollectionBrief): boolean {
  return tokenize(brief.climate).some((token) => HOT_BRIEF_HINTS.has(token));
}

/**
 * Hard climate conflict: a tropical/hot brief excludes garments whose climate
 * tags are cold-only (e.g. "cold-weather", "heavy") with no hot-compatible
 * tag to offset them.
 */
function isHardClimateConflict(
  brief: CollectionBrief,
  analysis: GarmentAnalysis,
): boolean {
  if (!briefIsHotClimate(brief)) return false;
  const tagTokens = analysis.climateTags.flatMap(tokenize);
  const hasColdOnly = tagTokens.some((token) =>
    COLD_ONLY_TAG_TOKENS.has(token),
  );
  const hasHotCompatible = tagTokens.some((token) =>
    HOT_COMPATIBLE_TAG_TOKENS.has(token),
  );
  return hasColdOnly && !hasHotCompatible;
}

function violatesProhibitedStyles(
  brief: CollectionBrief,
  analysis: GarmentAnalysis,
): boolean {
  if (brief.prohibitedStyles.length === 0) return false;
  const prohibited = new Set(
    brief.prohibitedStyles.map((style) => style.trim().toLowerCase()),
  );
  return analysis.styleTags.some((tag) =>
    prohibited.has(tag.trim().toLowerCase()),
  );
}

// ---------------------------------------------------------------------------
// Heuristic components
// ---------------------------------------------------------------------------

const FITTED_WORDS = [
  "fitted",
  "slim",
  "tailored",
  "bodycon",
  "cinched",
  "structured",
];
const RELAXED_WORDS = [
  "relaxed",
  "oversized",
  "loose",
  "wide",
  "boxy",
  "flowy",
  "draped",
  "a-line",
];

interface ScoreResult {
  score: number;
  reasons: string[];
}

function pairs<T>(items: T[]): Array<[T, T]> {
  const result: Array<[T, T]> = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      result.push([items[i], items[j]]);
    }
  }
  return result;
}

function colourComponent(
  analyses: GarmentAnalysis[],
  reasons: string[],
): number {
  const families = analyses.map((analysis) =>
    colourFamiliesOf(analysis.primaryColors),
  );
  const garmentPairs = pairs(families);
  if (garmentPairs.length === 0) {
    reasons.push("Single-garment look: no colour conflicts possible.");
    return 0.75;
  }
  let total = 0;
  let shared: string | null = null;
  let neutralBridge = false;
  for (const [a, b] of garmentPairs) {
    total += colourPairScore(a, b);
    shared = shared ?? hasSharedFamily(a, b);
    neutralBridge = neutralBridge || isAllNeutral(a) || isAllNeutral(b);
  }
  const score = total / garmentPairs.length;
  if (shared) {
    reasons.push(`Shared colour family "${shared}" ties the pieces together.`);
  } else if (neutralBridge) {
    reasons.push("A neutral palette bridges the combination.");
  } else if (score < 0.5) {
    reasons.push("Primary colours sit in different, non-neutral families.");
  }
  return score;
}

function formalityComponent(
  analyses: GarmentAnalysis[],
  reasons: string[],
): number {
  const garmentPairs = pairs(analyses.map((analysis) => analysis.formality));
  if (garmentPairs.length === 0) {
    return 0.75;
  }
  const averageGap =
    garmentPairs.reduce((sum, [a, b]) => sum + Math.abs(a - b), 0) /
    garmentPairs.length;
  const score = clamp01(1 - averageGap * 1.25);
  if (averageGap <= 0.25) {
    reasons.push(
      `Formality levels align (average gap ${averageGap.toFixed(2)}).`,
    );
  } else {
    reasons.push(
      `Noticeable formality gap between pieces (average gap ${averageGap.toFixed(2)}).`,
    );
  }
  return score;
}

function briefTagComponent(
  tagLists: string[][],
  briefValue: string,
  label: "climate" | "season",
  reasons: string[],
): number {
  const briefTokens = new Set(tokenize(briefValue));
  if (briefTokens.size === 0 || tagLists.length === 0) return 0.5;
  let matched = 0;
  for (const tags of tagLists) {
    const tagTokens = tags.flatMap(tokenize);
    if (tagTokens.some((token) => briefTokens.has(token))) {
      matched += 1;
    }
  }
  const score = matched / tagLists.length;
  reasons.push(
    `${matched}/${tagLists.length} item(s) match the brief ${label} "${briefValue}".`,
  );
  return score;
}

function occasionComponent(
  analyses: GarmentAnalysis[],
  reasons: string[],
): number {
  if (analyses.length === 1) {
    return analyses[0].occasionTags.length > 0 ? 0.75 : 0.5;
  }
  const sets = analyses.map(
    (analysis) =>
      new Set(analysis.occasionTags.map((tag) => tag.trim().toLowerCase())),
  );
  const sharedByAll = [...sets[0]].filter((tag) =>
    sets.every((set) => set.has(tag)),
  );
  if (sharedByAll.length > 0) {
    reasons.push(
      `All items share occasion tag(s): ${sharedByAll.slice(0, 2).join(", ")}.`,
    );
    return 1;
  }
  const anyPairShared = pairs(sets).some(([a, b]) =>
    [...a].some((tag) => b.has(tag)),
  );
  if (anyPairShared) {
    reasons.push("Some items share an occasion tag.");
    return 0.6;
  }
  reasons.push("No shared occasion tags across items.");
  return 0.2;
}

function silhouetteComponent(
  analyses: GarmentAnalysis[],
  reasons: string[],
): number {
  const classify = (analysis: GarmentAnalysis): "fitted" | "relaxed" | null => {
    const text = `${analysis.fit} ${analysis.silhouette}`.toLowerCase();
    if (FITTED_WORDS.some((word) => text.includes(word))) return "fitted";
    if (RELAXED_WORDS.some((word) => text.includes(word))) return "relaxed";
    return null;
  };
  const classes = analyses.map(classify);
  const hasFitted = classes.includes("fitted");
  const hasRelaxed = classes.includes("relaxed");
  if (hasFitted && hasRelaxed) {
    reasons.push("Balanced silhouettes: fitted and relaxed pieces mix well.");
    return 1;
  }
  if (hasFitted || hasRelaxed) {
    return 0.6;
  }
  return 0.5;
}

function scoreCombo(
  items: CandidateProduct[],
  brief: CollectionBrief,
  heroes: Set<string>,
  metadataOnly: boolean,
): ScoreResult {
  const reasons: string[] = [];
  let colour = 0.5;
  let formality = 0.5;
  let climate = 0.5;
  let season = 0.5;
  let occasion = 0.5;
  let silhouette = 0.5;

  if (metadataOnly) {
    reasons.push(
      "Metadata-only generation: no completed garment analyses were available, so compatibility heuristics use neutral scores.",
    );
  } else {
    // All items have analyses here — the generator filters unanalysed
    // products out before enumeration (except in metadata-only mode).
    const analyses = items.map((item) => item.analysis as GarmentAnalysis);
    colour = colourComponent(analyses, reasons);
    formality = formalityComponent(analyses, reasons);
    climate = briefTagComponent(
      analyses.map((analysis) => analysis.climateTags),
      brief.climate,
      "climate",
      reasons,
    );
    season = briefTagComponent(
      analyses.map((analysis) => analysis.seasonTags),
      brief.season,
      "season",
      reasons,
    );
    occasion = occasionComponent(analyses, reasons);
    silhouette = silhouetteComponent(analyses, reasons);
  }

  const hero = items.some((item) => heroes.has(item.id)) ? 1 : 0;
  if (hero === 1) {
    reasons.push("Includes a hero product from the brief.");
  }

  const score = round4(
    clamp01(
      colour * HEURISTIC_WEIGHTS.colourCompatibility +
        formality * HEURISTIC_WEIGHTS.formalityAlignment +
        climate * HEURISTIC_WEIGHTS.climateFit +
        season * HEURISTIC_WEIGHTS.seasonFit +
        occasion * HEURISTIC_WEIGHTS.occasionOverlap +
        silhouette * HEURISTIC_WEIGHTS.silhouetteBalance +
        hero * HEURISTIC_WEIGHTS.heroPresence,
    ),
  );
  return { score, reasons };
}

// ---------------------------------------------------------------------------
// Accessory selection
// ---------------------------------------------------------------------------

function bestAccessory(
  items: CandidateProduct[],
  accessories: CandidateProduct[],
  metadataOnly: boolean,
): CandidateProduct | null {
  let best: CandidateProduct | null = null;
  let bestScore = -1;
  for (const accessory of accessories) {
    let pairing = 0.5;
    if (!metadataOnly && accessory.analysis) {
      const accessoryFamilies = colourFamiliesOf(
        accessory.analysis.primaryColors,
      );
      let total = 0;
      for (const item of items) {
        const itemFamilies = colourFamiliesOf(
          (item.analysis as GarmentAnalysis).primaryColors,
        );
        total += colourPairScore(accessoryFamilies, itemFamilies);
      }
      pairing = items.length > 0 ? total / items.length : 0.5;
    }
    // `accessories` arrives sorted by ID ascending, so a strict `>` keeps the
    // lowest-ID accessory on ties — deterministic across runs.
    if (pairing > bestScore) {
      best = accessory;
      bestScore = pairing;
    }
  }
  return bestScore >= ACCESSORY_PAIRING_THRESHOLD ? best : null;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/**
 * Generate deterministic outfit candidates from real catalog products.
 *
 * Rules enforced here (never delegated to Claude):
 * - only products with a complete garment analysis participate, UNLESS no
 *   product has one — then generation falls back to metadata-only mode and
 *   every candidate carries a reason note saying so;
 * - unavailable products are excluded unless `brief.allowUnavailableProducts`;
 * - products whose style tags intersect `brief.prohibitedStyles` are excluded;
 * - products with a hard climate conflict against the brief are excluded;
 * - templates: top+bottom, top+bottom+outerwear, dress, dress+outerwear,
 *   each optionally with exactly ONE best-matching accessory appended
 *   (the accessory is included in `productIds` and flagged via
 *   `accessoryProductId`);
 * - no duplicate product IDs, at most one outerwear item;
 * - candidates are scored 0–1 with transparent heuristics, sorted by score
 *   descending then candidateId ascending, and capped at `maxCandidates`.
 *
 * `candidateId` is "cand-" plus an FNV-1a hash of the sorted product IDs, so
 * the same combination always gets the same ID across runs.
 */
export function generateCandidates(
  input: GenerateCandidatesInput,
): OutfitCandidate[] {
  const { products, brief } = input;
  const maxCandidates = input.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const heroes = new Set(brief.heroProductIds);

  const metadataOnly = !products.some((product) => product.analysis !== null);

  const usable = products.filter((product) => {
    if (!product.available && !brief.allowUnavailableProducts) return false;
    if (metadataOnly) return true;
    if (product.analysis === null) return false;
    if (violatesProhibitedStyles(brief, product.analysis)) return false;
    if (isHardClimateConflict(brief, product.analysis)) return false;
    return true;
  });

  const byCategory = (category: GarmentCategory): CandidateProduct[] =>
    usable
      .filter((product) => product.category === category)
      .sort(byIdAsc)
      .slice(0, MAX_PER_CATEGORY);

  const tops = byCategory("top");
  const bottoms = byCategory("bottom");
  const dresses = byCategory("dress");
  const outerwear = byCategory("outerwear");
  const accessories = byCategory("accessory");

  const combos: Array<{
    items: CandidateProduct[];
    template: OutfitCandidate["template"];
  }> = [];
  for (const top of tops) {
    for (const bottom of bottoms) {
      combos.push({ items: [top, bottom], template: "top_bottom" });
      for (const layer of outerwear) {
        combos.push({
          items: [top, bottom, layer],
          template: "top_bottom_outerwear",
        });
      }
    }
  }
  for (const dress of dresses) {
    combos.push({ items: [dress], template: "dress" });
    for (const layer of outerwear) {
      combos.push({ items: [dress, layer], template: "dress_outerwear" });
    }
  }

  const candidates: OutfitCandidate[] = [];
  const seen = new Set<string>();

  const push = (
    items: CandidateProduct[],
    template: OutfitCandidate["template"],
    accessory: CandidateProduct | null,
  ): void => {
    const allItems = accessory ? [...items, accessory] : items;
    const ids = allItems.map((item) => item.id);
    if (new Set(ids).size !== ids.length) return; // duplicate-ID guard
    const candidateId = `cand-${fnv1a([...ids].sort().join("|"))}`;
    if (seen.has(candidateId)) return;
    seen.add(candidateId);

    const { score, reasons } = scoreCombo(allItems, brief, heroes, metadataOnly);
    if (accessory) {
      reasons.push(`Accessory added: ${accessory.title}.`);
    }
    candidates.push({
      candidateId,
      productIds: ids,
      template,
      accessoryProductId: accessory ? accessory.id : null,
      heuristicScore: score,
      heuristicReasons: reasons,
    });
  };

  for (const { items, template } of combos) {
    push(items, template, null);
    const accessory = bestAccessory(items, accessories, metadataOnly);
    if (accessory) {
      push(items, template, accessory);
    }
  }

  candidates.sort(
    (a, b) =>
      b.heuristicScore - a.heuristicScore ||
      (a.candidateId < b.candidateId
        ? -1
        : a.candidateId > b.candidateId
          ? 1
          : 0),
  );

  return candidates.slice(0, maxCandidates);
}
