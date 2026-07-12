import type {
  BrandProfile,
  GarmentAnalysis,
  GarmentCategory,
} from "@/lib/domain/schemas";

/**
 * Shared building blocks for every LabelOS agent prompt (spec Part VI).
 *
 * This module is intentionally free of secrets and I/O so it can be imported
 * from anywhere (agent builders, the mock provider, and tests). It provides:
 *
 * - {@link GROUNDING_RULES}: the common safety/grounding block appended to
 *   every agent system prompt, verbatim from the master spec;
 * - {@link PROMPT_VERSIONS}: versioned prompt identifiers so a stored output
 *   can be traced back to the exact prompt that produced it;
 * - {@link AGENT_SCHEMA_NAMES} + {@link classifySchemaName}: the canonical
 *   structured-output schema names the deterministic mock switches on;
 * - {@link formatProductRecord}: a compact, grounded text record for a catalog
 *   product that ALSO embeds a machine-readable `<!--HINTS {json} -->` marker
 *   so the mock provider can extract structured data straight from the prompt;
 * - small {@link marker}/{@link readMarkers} helpers used to embed and recover
 *   deterministic context (product hints, candidates, permitted replacements,
 *   design/listing/story context) inside prompt text.
 */

// ---------------------------------------------------------------------------
// Grounding block (Part VI — "Common safety and grounding block"), verbatim.
// ---------------------------------------------------------------------------

export const GROUNDING_RULES = `Grounding rules:
- Treat supplied database records as the only source of truth for product IDs,
  SKUs, prices, inventory, and verified materials.
- Never create, rename, or silently replace a product.
- When information is uncertain, state that it is uncertain.
- Do not infer sensitive traits about people shown in an image.
- Do not copy logos, trademarked graphics, or a distinctive named brand design.
- Separate evidence, inference, and creative suggestion.
- Return only the requested structured output.`;

/**
 * Compose a full agent system prompt: the agent-specific role text followed by
 * the shared grounding block. Every LabelOS agent uses this so grounding is
 * never accidentally dropped.
 */
export function withGrounding(rolePrompt: string): string {
  return `${rolePrompt.trim()}\n\n${GROUNDING_RULES}`;
}

// ---------------------------------------------------------------------------
// Prompt versions — bump the suffix when a prompt's wording changes so stored
// outputs remain traceable to the prompt that produced them.
// ---------------------------------------------------------------------------

export const PROMPT_VERSIONS = {
  garmentLibrarian: "garment-librarian@1",
  trendScout: "trend-scout@1",
  outfitComposer: "outfit-composer@1",
  runwayJury: "runway-jury@1",
  outfitReviser: "outfit-reviser@1",
  collectionCurator: "collection-curator@1",
  gapDesigner: "gap-designer@1",
  techPackWriter: "tech-pack-writer@1",
  listingWriter: "listing-writer@1",
} as const;

export type PromptVersionKey = keyof typeof PROMPT_VERSIONS;

// ---------------------------------------------------------------------------
// Canonical structured-output schema names. Routes pass these as `schemaName`
// to `provider.structuredCall`; the mock provider switches on them. A tolerant
// classifier ({@link classifySchemaName}) keeps the mock robust to variants.
// ---------------------------------------------------------------------------

export const AGENT_SCHEMA_NAMES = {
  garmentAnalysis: "garment_analysis",
  trendReport: "trend_report",
  composerRanking: "composer_ranking",
  outfitReview: "outfit_review",
  revisionResult: "revision_result",
  collectionStory: "collection_story",
  newDesign: "new_design",
  techPack: "tech_pack",
  listingPayload: "listing_payload",
} as const;

export type AgentSchemaKind =
  | "garment"
  | "trend"
  | "composer"
  | "critic"
  | "reviser"
  | "story"
  | "gap"
  | "techpack"
  | "listing"
  | "unknown";

/**
 * Best-effort classification of a `schemaName` into the agent it belongs to.
 * Matches the canonical names exactly and also keyword-matches common variants
 * so the mock provider keeps working regardless of the precise string a route
 * chooses to pass.
 */
export function classifySchemaName(schemaName: string): AgentSchemaKind {
  const name = schemaName.toLowerCase();
  const has = (...needles: string[]): boolean =>
    needles.some((needle) => name.includes(needle));

  if (has("garment", "analysis", "librarian")) return "garment";
  if (has("trend")) return "trend";
  if (has("composer", "ranking")) return "composer";
  if (has("review", "critic", "jury")) return "critic";
  if (has("revis")) return "reviser";
  if (has("story", "curat")) return "story";
  if (has("design", "gap")) return "gap";
  if (has("tech")) return "techpack";
  if (has("listing")) return "listing";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Deterministic prompt markers.
//
// Agent builders embed compact JSON markers in the prompt text so the mock
// provider can reconstruct structured data without any model. Markers are HTML
// comments (`<!--TAG {json} -->`) so they read as inert annotations to Claude
// and never appear in rendered UI. Real Claude simply ignores them.
// ---------------------------------------------------------------------------

/** Marker tags. `HINTS` matches the format named in the build spec. */
export const MARKER_TAGS = {
  hints: "HINTS",
  candidate: "CANDIDATE",
  permitted: "PERMITTED",
  revision: "REVISION",
  story: "STORY",
  gap: "GAP",
  design: "DESIGN",
  listing: "LISTING",
} as const;

/** Serialise a single marker, e.g. `<!--HINTS {"id":"..."} -->`. */
export function marker(tag: string, data: unknown): string {
  return `<!--${tag} ${JSON.stringify(data)} -->`;
}

/**
 * Recover every marker with the given tag from prompt text, in document order.
 * Malformed JSON is skipped rather than throwing so a partial prompt can never
 * crash the mock provider.
 */
export function readMarkers<T = unknown>(tag: string, text: string): T[] {
  const re = new RegExp(`<!--${tag} ([\\[{][\\s\\S]*?[\\]}]) -->`, "g");
  const out: T[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    try {
      out.push(JSON.parse(match[1]) as T);
    } catch {
      // Ignore an unparseable marker; the caller falls back to defaults.
    }
  }
  return out;
}

/** Convenience: the first marker with a tag, or null. */
export function readMarker<T = unknown>(tag: string, text: string): T | null {
  const all = readMarkers<T>(tag, text);
  return all.length > 0 ? all[0] : null;
}

// ---------------------------------------------------------------------------
// Product hints — embedded by formatProductRecord, consumed by the mock.
// ---------------------------------------------------------------------------

export interface ProductHint {
  id: string;
  category: GarmentCategory;
  title: string;
  colors: string[];
  price: number | null;
  inventory: number | null;
  /** Observed/known material keyword, when available. Never authoritative. */
  material: string | null;
}

/** Recover all product hints from a prompt's text. */
export function extractProductHints(text: string): ProductHint[] {
  return readMarkers<ProductHint>(MARKER_TAGS.hints, text);
}

// ---------------------------------------------------------------------------
// formatProductRecord
// ---------------------------------------------------------------------------

export interface ProductRecordInput {
  id: string;
  title: string;
  category: GarmentCategory;
  sku?: string | null;
  price?: number | null;
  currency?: string | null;
  inventoryQuantity?: number | null;
  available?: boolean | null;
  description?: string | null;
  /** Known colour names (e.g. from seed metadata) when analysis is absent. */
  colors?: string[] | null;
  /** Completed garment analysis, when the product has been analysed. */
  analysis?: GarmentAnalysis | null;
}

function money(value: number | null | undefined, currency: string | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "price unknown";
  }
  return `${currency ?? "SGD"} ${value.toFixed(2)}`;
}

/**
 * Render a compact, grounded text record for one catalog product and append a
 * machine-readable `<!--HINTS {json} -->` marker carrying category, title,
 * colours, price and inventory. Works with or without a completed analysis.
 *
 * The human-readable lines are what a real Claude reads; the HINTS marker is
 * what the deterministic mock parses. Both describe the same product, so the
 * demo behaves identically whether Claude is live or mocked.
 */
export function formatProductRecord(product: ProductRecordInput): string {
  const analysis = product.analysis ?? null;
  const colors =
    analysis?.primaryColors && analysis.primaryColors.length > 0
      ? analysis.primaryColors
      : (product.colors ?? []);
  const available =
    product.available ??
    (typeof product.inventoryQuantity === "number"
      ? product.inventoryQuantity > 0
      : null);

  const lines: string[] = [];
  lines.push(`- ${product.title} (${product.category})`);
  lines.push(`  id: ${product.id}`);
  const stockText =
    typeof product.inventoryQuantity === "number"
      ? `${product.inventoryQuantity}${available === false ? " (out of stock)" : available === true ? " (available)" : ""}`
      : "unknown";
  lines.push(
    `  sku: ${product.sku ?? "n/a"} | ${money(product.price, product.currency)} | inventory: ${stockText}`,
  );
  if (colors.length > 0) {
    lines.push(`  colours: ${colors.join(", ")}`);
  }
  if (analysis) {
    lines.push(
      `  silhouette: ${analysis.silhouette} | fit: ${analysis.fit} | length: ${analysis.length} | formality: ${analysis.formality.toFixed(2)}`,
    );
    lines.push(
      `  material (observed, ${analysis.materialObservation.verified ? "verified" : "UNVERIFIED"}): ${analysis.materialObservation.value} (confidence ${analysis.materialObservation.confidence.toFixed(2)})`,
    );
    if (analysis.seasonTags.length || analysis.climateTags.length) {
      lines.push(
        `  season: ${analysis.seasonTags.join(", ") || "n/a"} | climate: ${analysis.climateTags.join(", ") || "n/a"}`,
      );
    }
    if (analysis.occasionTags.length) {
      lines.push(`  occasion: ${analysis.occasionTags.join(", ")}`);
    }
    if (analysis.styleTags.length) {
      lines.push(`  style: ${analysis.styleTags.join(", ")}`);
    }
  } else if (product.description) {
    lines.push(`  description: ${truncateOneLine(product.description, 240)}`);
  }

  const material =
    analysis?.materialObservation.value ??
    detectMaterialKeyword(`${product.title} ${product.description ?? ""}`);

  const hint: ProductHint = {
    id: product.id,
    category: product.category,
    title: product.title,
    colors,
    price: typeof product.price === "number" ? product.price : null,
    inventory:
      typeof product.inventoryQuantity === "number"
        ? product.inventoryQuantity
        : null,
    material,
  };
  lines.push(`  ${marker(MARKER_TAGS.hints, hint)}`);

  return lines.join("\n");
}

/** Format many product records into one block, in the given order. */
export function formatProductRecords(products: ProductRecordInput[]): string {
  return products.map(formatProductRecord).join("\n");
}

// ---------------------------------------------------------------------------
// Small text utilities
// ---------------------------------------------------------------------------

const MATERIAL_KEYWORDS = [
  "linen",
  "cotton",
  "silk",
  "viscose",
  "wool",
  "cashmere",
  "denim",
  "leather",
  "polyester",
  "nylon",
  "ripstop",
  "poplin",
  "seersucker",
  "twill",
  "jersey",
  "knit",
] as const;

/** First recognised fabric keyword in free text, or null. Purely a hint. */
export function detectMaterialKeyword(text: string): string | null {
  const lower = text.toLowerCase();
  for (const keyword of MATERIAL_KEYWORDS) {
    if (lower.includes(keyword)) return keyword;
  }
  return null;
}

function truncateOneLine(value: string, max: number): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

/** Render a brand profile as a short grounded briefing block. */
export function formatBrandProfile(brand: BrandProfile): string {
  return [
    `Audience: ${brand.audience}`,
    `Personality: ${brand.personality.join(", ")}`,
    `Signature colours: ${brand.colours.join(", ")}`,
    `Climate: ${brand.climate}`,
    `Prohibited styles: ${brand.prohibitedStyles.join(", ") || "none stated"}`,
    `Typical price range: ${brand.typicalPriceRange.currency} ${brand.typicalPriceRange.min}–${brand.typicalPriceRange.max}`,
    `Target gross margin: ${(brand.targetGrossMargin * 100).toFixed(0)}%`,
    `Default season: ${brand.defaultSeason}`,
  ].join("\n");
}
