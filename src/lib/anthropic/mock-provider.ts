import "server-only";
import type { z } from "zod";
import type {
  GarmentAnalysis,
  GarmentCategory,
  ListingPayload,
  NewDesign,
  TechPack,
  TrendReport,
  Usage,
} from "@/lib/domain/schemas";
import { TECH_PACK_DRAFT_STATUS, usageSchema } from "@/lib/domain/schemas";
import { logActivity } from "@/lib/logging/activity";
import {
  MARKER_TAGS,
  classifySchemaName,
  extractProductHints,
  readMarker,
  readMarkers,
  type ProductHint,
} from "@/lib/agents/common";
import {
  AnthropicCallError,
  type AnthropicUserContent,
  type StructuredCallOptions,
  type StructuredCallResult,
} from "./structured";
import type {
  AnthropicProvider,
  TrendResearchInput,
  TrendResearchOutput,
} from "./provider";

/**
 * High-quality deterministic mock Anthropic provider (spec section 25).
 *
 * Not an empty stub: it produces plausible, schema-valid outputs derived from
 * the machine-readable markers the agent builders embed in the prompt text
 * (HINTS, CANDIDATE, REVISION, GAP, DESIGN, LISTING, STORY). The same input
 * always yields the same output, so the demo behaves identically every run and
 * the unit tests can assert every output passes its Zod schema.
 *
 * Notable behaviours required by the spec:
 * - garment analysis includes exactly one ambiguous materialObservation
 *   (~0.55, unverified) for products whose title mentions linen;
 * - the critic rejects the lowest-scoring candidates (SEASON_MISMATCH for a
 *   layered look in a hot climate, else TOO_SIMILAR), approves ≥0.62, and
 *   revises the middle band;
 * - the reviser swaps the first product for the first permitted replacement;
 * - trend research returns 3 signals + 1 rejected signal, sourceMode "demo";
 * - the gap designer proposes one lightweight linen-blend top unlocking two
 *   outfits; the tech pack is a complete draft with TBD measurements; the
 *   listing is compliant DRAFT copy; the story is a short editorial paragraph.
 */

// ---------------------------------------------------------------------------
// Local marker shapes (structural mirrors of the agent builders' payloads)
// ---------------------------------------------------------------------------

interface CandidateMarker {
  candidateId: string;
  heuristicScore: number;
  productIds: string[];
  template: string;
  climate?: string;
}

interface RevisionMarker {
  originalIds: string[];
  permittedIds: string[];
  reasonCodes: string[];
}

interface StoryMarker {
  season: string;
  market: string;
  outfitCount: number;
}

interface GapMarker {
  market: string;
  season: string;
  targetGrossMargin: number;
  categories: string[];
  outfitIds: string[];
  priceMin: number;
  priceMax: number;
  currency: string;
}

interface DesignMarker {
  name: string;
  category: string;
  silhouette: string;
  colour: string;
  sketchTemplate: string;
  sizeRange: string[];
}

interface ListingMarker {
  name: string;
  price: number;
  currency: string;
  vendor: string;
  productType: string;
  sizeOptions: string[];
  imageUrl: string | null;
}

// ---------------------------------------------------------------------------
// Deterministic numeric helpers
// ---------------------------------------------------------------------------

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Stable 32-bit FNV-1a hash as an unsigned integer (for deterministic picks). */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pick<T>(items: readonly T[], seed: string): T {
  return items[hash(seed) % items.length];
}

// ---------------------------------------------------------------------------
// Prompt-text extraction
// ---------------------------------------------------------------------------

/** Flatten a user message (string or content blocks) to searchable text. */
function userText(user: string | AnthropicUserContent): string {
  if (typeof user === "string") return user;
  return user
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n");
}

function parseBriefField(text: string, label: string): string | null {
  const match = new RegExp(`${label}:\\s*(.+)`, "i").exec(text);
  return match ? match[1].trim() : null;
}

// ---------------------------------------------------------------------------
// Category-driven demo detail tables
// ---------------------------------------------------------------------------

const SUBCATEGORY: Record<GarmentCategory, string> = {
  top: "shirt",
  bottom: "trousers",
  dress: "midi dress",
  outerwear: "lightweight jacket",
  footwear: "flat sandal",
  accessory: "accessory",
  other: "garment",
};

const SILHOUETTE: Record<GarmentCategory, string> = {
  top: "relaxed, straight hem",
  bottom: "wide-leg",
  dress: "bias-cut column",
  outerwear: "boxy, unlined",
  footwear: "minimal",
  accessory: "compact",
  other: "regular",
};

const LENGTH: Record<GarmentCategory, string> = {
  top: "hip",
  bottom: "full",
  dress: "midi",
  outerwear: "hip",
  footwear: "n/a",
  accessory: "n/a",
  other: "regular",
};

const FORMALITY: Record<GarmentCategory, number> = {
  top: 0.5,
  bottom: 0.55,
  dress: 0.62,
  outerwear: 0.58,
  footwear: 0.5,
  accessory: 0.45,
  other: 0.5,
};

const OCCASIONS: Record<GarmentCategory, string[]> = {
  top: ["work", "weekend"],
  bottom: ["work", "weekend", "travel"],
  dress: ["dinner", "occasion"],
  outerwear: ["commute", "evening"],
  footwear: ["everyday"],
  accessory: ["everyday", "occasion"],
  other: ["everyday"],
};

const LAYERING: Record<GarmentCategory, string> = {
  top: "base",
  bottom: "base",
  dress: "statement",
  outerwear: "layer",
  footwear: "finish",
  accessory: "accent",
  other: "base",
};

const COLOUR_WORDS = [
  "ivory",
  "sand",
  "charcoal",
  "palm green",
  "sea-salt blue",
  "black",
  "white",
  "olive",
  "stone",
  "navy",
];

function inferColors(hint: ProductHint | null, text: string): string[] {
  if (hint && hint.colors.length > 0) return hint.colors;
  const found = COLOUR_WORDS.filter((word) => text.toLowerCase().includes(word));
  return found.length > 0 ? found.slice(0, 2) : ["neutral"];
}

// ---------------------------------------------------------------------------
// Mock builders — each returns a plain object validated against its schema.
// ---------------------------------------------------------------------------

function mockGarmentAnalysis(text: string): GarmentAnalysis {
  const hint = extractProductHints(text)[0] ?? null;
  const category: GarmentCategory = hint?.category ?? "top";
  const title = hint?.title ?? "Garment";
  const colors = inferColors(hint, text);
  const titleMentionsLinen = /linen/i.test(title);

  const materialObservation = titleMentionsLinen
    ? {
        value: "linen (visual estimate)",
        confidence: 0.55,
        verified: false,
        caveat:
          "Visual guess only — the drape and slub read as linen, but confirm the exact fibre blend with the supplier or a burn test.",
      }
    : {
        value: `${hint?.material ?? "woven textile"} (visual estimate)`,
        confidence: 0.5,
        verified: false,
        caveat:
          "Fibre content inferred from appearance only and not verified against a spec sheet.",
      };

  return {
    category,
    subcategory: SUBCATEGORY[category],
    primaryColors: colors,
    secondaryColors: [],
    pattern: "solid",
    silhouette: SILHOUETTE[category],
    fit: "relaxed",
    length: LENGTH[category],
    texture: "soft, breathable hand-feel",
    materialObservation,
    formality: FORMALITY[category],
    climateTags: ["tropical", "hot", "humid", "breathable"],
    seasonTags: ["resort", "summer"],
    occasionTags: OCCASIONS[category],
    layeringRole: LAYERING[category],
    styleTags: ["understated", "modern", "climate-smart"],
    compatibilityNotes: [
      "Pairs cleanly with neutral separates from the capsule.",
      "Tonal palette layers well without colour conflict.",
    ],
    warnings: [
      "Visual analysis only; measurements and exact composition are unverified.",
    ],
    confidence: 0.72,
  };
}

const COMPOSER_TITLE_WORDS_A = [
  "Ivory",
  "Sand",
  "Coastal",
  "Tonal",
  "Breeze",
  "Atrium",
  "Harbour",
  "Monsoon",
];
const COMPOSER_TITLE_WORDS_B = [
  "Ease",
  "Line",
  "Hours",
  "Layer",
  "Edit",
  "Uniform",
  "Drift",
  "Set",
];

const TEMPLATE_OCCASION: Record<string, string> = {
  top_bottom: "workday",
  top_bottom_outerwear: "commute to evening",
  dress: "dinner",
  dress_outerwear: "occasion",
};

interface ComposerRankingOut {
  rankings: Array<{
    candidateId: string;
    title: string;
    occasion: string;
    description: string;
    trendConnection: string;
    commercialReason: string;
    rank: number;
  }>;
}

function mockComposerRanking(text: string): ComposerRankingOut {
  const candidates = readMarkers<CandidateMarker>(MARKER_TAGS.candidate, text);
  const sorted = [...candidates].sort(
    (a, b) =>
      b.heuristicScore - a.heuristicScore ||
      (a.candidateId < b.candidateId ? -1 : 1),
  );

  return {
    rankings: sorted.map((candidate, index) => {
      const title = `${pick(COMPOSER_TITLE_WORDS_A, candidate.candidateId)} ${pick(
        COMPOSER_TITLE_WORDS_B,
        `${candidate.candidateId}-b`,
      )}`;
      const occasion = TEMPLATE_OCCASION[candidate.template] ?? "everyday";
      return {
        candidateId: candidate.candidateId,
        title,
        occasion,
        description:
          "A tonal, breathable combination built for a humid city day — clean lines, relaxed volume, and easy layering.",
        trendConnection:
          "Leans into the season's elevated-resort direction with restrained colour and natural texture.",
        commercialReason:
          "Anchors around in-stock core pieces, keeping the look accessible and repeat-wearable.",
        rank: index + 1,
      };
    }),
  };
}

interface OutfitReviewOut {
  scores: {
    brandFit: number;
    visualHarmony: number;
    seasonClimateFit: number;
    trendRelevance: number;
    commercialValue: number;
    novelty: number;
  };
  verdict: "approve" | "revise" | "reject";
  reasonCodes: string[];
  strengths: string[];
  issues: string[];
  revisionInstructions: string[];
}

function isHotClimate(climate: string | undefined): boolean {
  return /trop|hot|humid|warm|equator/i.test(climate ?? "");
}

function mockOutfitReview(text: string): OutfitReviewOut {
  const marker = readMarker<CandidateMarker>(MARKER_TAGS.candidate, text);
  const h = marker ? clamp01(marker.heuristicScore) : 0.6;
  const layered = (marker?.template ?? "").includes("outerwear");
  const hot = isHotClimate(marker?.climate);

  const scores = {
    brandFit: clamp01(round2(h + 0.04)),
    visualHarmony: clamp01(round2(h + 0.01)),
    seasonClimateFit: clamp01(round2(layered && hot ? h - 0.22 : h + 0.02)),
    trendRelevance: clamp01(round2(h - 0.03)),
    commercialValue: clamp01(round2(h + 0.02)),
    novelty: clamp01(round2(h - 0.05)),
  };

  if (h >= 0.62) {
    return {
      scores,
      verdict: "approve",
      reasonCodes: [],
      strengths: [
        "Cohesive tonal palette that fits the brand's understated voice.",
        "Breathable pieces suited to a hot, humid climate.",
      ],
      issues: [],
      revisionInstructions: [],
    };
  }

  if (h >= 0.5) {
    return {
      scores,
      verdict: "revise",
      reasonCodes: ["FORMALITY_MISMATCH"],
      strengths: ["Sound colour story and in-stock anchor piece."],
      issues: ["The formality levels of the pieces sit slightly apart."],
      revisionInstructions: [
        "Swap the more casual separate for a cleaner, mid-formality option from the permitted list.",
      ],
    };
  }

  // Lowest band → reject.
  const reasonCode = layered && hot ? "SEASON_MISMATCH" : "TOO_SIMILAR";
  return {
    scores,
    verdict: "reject",
    reasonCodes: [reasonCode],
    strengths: ["Uses catalog pieces the brand wants to move."],
    issues:
      reasonCode === "SEASON_MISMATCH"
        ? ["The added layer reads too warm for a tropical-city climate."]
        : ["Too close to another look already in the set; limited distinctiveness."],
    revisionInstructions:
      reasonCode === "SEASON_MISMATCH"
        ? [
            "Remove the outerwear layer or replace it with a lighter, more breathable piece from the permitted list.",
          ]
        : [
            "Replace one core piece with a more distinctive permitted option to differentiate this look from the rest of the capsule.",
          ],
  };
}

interface RevisionOut {
  productIds: string[];
  corrections: Array<{ reasonCode: string; correction: string }>;
  summary: string;
}

function mockRevision(text: string): RevisionOut {
  const marker = readMarker<RevisionMarker>(MARKER_TAGS.revision, text);
  const originalIds = marker?.originalIds ?? [];
  const permittedIds = marker?.permittedIds ?? [];

  let productIds = [...originalIds];
  const replacement =
    permittedIds.find((id) => !originalIds.includes(id)) ?? permittedIds[0];
  if (replacement && originalIds.length > 0) {
    productIds = [replacement, ...originalIds.slice(1)];
  }
  // De-duplicate while preserving order.
  productIds = [...new Set(productIds)];

  const reasonCodes =
    marker?.reasonCodes && marker.reasonCodes.length > 0
      ? marker.reasonCodes
      : ["OTHER"];

  return {
    productIds,
    corrections: reasonCodes.map((reasonCode) => ({
      reasonCode,
      correction:
        "Swapped the first flagged product for a permitted replacement that better fits the brief and climate.",
    })),
    summary:
      "Replaced one product with a permitted alternative to resolve the jury's issues while keeping the outfit valid.",
  };
}

function mockStory(text: string): { story: string; title: string } {
  const marker = readMarker<StoryMarker>(MARKER_TAGS.story, text);
  const season = marker?.season ?? parseBriefField(text, "Season") ?? "This season";
  const market = marker?.market ?? parseBriefField(text, "Market") ?? "the city";
  return {
    title: `${season} — A ${market} Capsule`,
    story:
      `A tight edit for humid ${market} days, built on breathable naturals and a quiet, tonal palette. ` +
      "Each look moves from air-conditioned mornings to warm evenings without a change of clothes, layering lightly and never fighting the heat. " +
      "Understated, repeat-wearable, and made to work as a set.",
  };
}

function clampPrice(value: number, min?: number, max?: number): number {
  let result = value;
  if (typeof min === "number" && Number.isFinite(min) && min > 0) {
    result = Math.max(result, min);
  }
  if (typeof max === "number" && Number.isFinite(max) && max > 0) {
    result = Math.min(result, max);
  }
  return result > 0 ? round2(result) : 79;
}

function mockNewDesign(text: string): NewDesign {
  const marker = readMarker<GapMarker>(MARKER_TAGS.gap, text);
  const outfitIds = (marker?.outfitIds ?? []).slice(0, 2);
  const targetRetailPrice = clampPrice(79, marker?.priceMin, marker?.priceMax);

  return {
    category: "top",
    name: "Featherweight Linen-Blend Overshirt",
    problemSolved:
      "The capsule lacks a light layering piece that bridges air-conditioned interiors and humid streets, leaving several looks without a topper that still breathes.",
    outfitIdsUnlocked: outfitIds,
    targetCustomer:
      "A 20-30 year-old urban professional who commutes in the heat but spends the day in air-conditioning.",
    silhouette: "boxy, hip-length overshirt with a half-placket",
    colour: "sea-salt blue",
    colourHex: "#A9C4CE",
    constructionDirection:
      "Unlined, single-needle side seams, patch chest pocket, mother-of-pearl buttons, gently dropped shoulder.",
    fabricRequirements: [
      "lightweight linen-cotton blend, open weave for airflow",
      "pre-washed for a soft, lived-in hand",
      "colour-fast dye suited to frequent laundering",
    ],
    verifiedData: [
      "Category and target price derived from the brand's stated price architecture.",
      "Unlocked outfit IDs reference existing curated looks.",
    ],
    assumedData: [
      "Exact blend ratio and fabric weight (GSM) assumed — to confirm with the supplier.",
      "Fit block assumed from the brand's existing tops.",
    ],
    targetRetailPrice,
    estimatedRisk: "low",
    originalitySafeguards: [
      "Built on a generic overshirt block with no named-brand design references.",
      "Colour, trim, and proportions are brand-standard, not copied from any label.",
    ],
    openQuestions: [
      "Confirm the final linen-cotton blend ratio and GSM.",
      "Confirm button and interlining sourcing.",
      "Confirm grading and fit across the full size range.",
    ],
    sketchTemplate: "top",
    neckline: "camp collar",
    sleeveLength: "short",
    garmentLength: "regular",
  };
}

function mockTechPack(text: string): TechPack {
  const marker = readMarker<DesignMarker>(MARKER_TAGS.design, text);
  const garmentName = marker?.name ?? "New Design";
  const sizeRange =
    marker?.sizeRange && marker.sizeRange.length > 0
      ? marker.sizeRange
      : ["S", "M", "L"];
  const tbdSizes: Record<string, string> = Object.fromEntries(
    sizeRange.map((size) => [size, "TBD"]),
  );

  const measurementPoints = [
    "Chest width (1cm below armhole)",
    "Body length (HPS to hem)",
    "Shoulder width",
    "Sleeve length",
    "Hem width",
  ];

  return {
    styleCode: `LOS-${(garmentName.replace(/[^A-Za-z]/g, "").slice(0, 3) || "GAR").toUpperCase()}-001`,
    version: 1,
    status: TECH_PACK_DRAFT_STATUS,
    garmentName,
    frontDetails: [
      "Half-placket with mother-of-pearl buttons.",
      "Single patch chest pocket.",
      "Camp collar with a clean topstitch.",
    ],
    backDetails: ["Plain back yoke.", "Straight hem, no vents."],
    constructionNotes: [
      "Single-needle side and shoulder seams.",
      "1cm clean-finished hems.",
      "Interlining and stitch density: TBD by the technical designer.",
    ],
    billOfMaterials: [
      {
        item: "Main fabric",
        placement: "Body and sleeves",
        composition: "Linen-cotton blend (ratio TBD)",
        supplierReference: "TBD",
        verified: false,
      },
      {
        item: "Buttons",
        placement: "Front placket",
        composition: "Mother-of-pearl (TBD)",
        supplierReference: "TBD",
        verified: false,
      },
      {
        item: "Sewing thread",
        placement: "All seams",
        composition: "Core-spun polyester (TBD)",
        supplierReference: "TBD",
        verified: false,
      },
    ],
    trims: ["Woven brand label", "Care/content label (content TBD)"],
    measurementTable: measurementPoints.map((pointOfMeasure) => ({
      pointOfMeasure,
      sizes: { ...tbdSizes },
      toleranceCm: "TBD",
    })),
    sizeRange,
    artworkPlacement: ["No artwork on this style in the current draft."],
    labelling: [
      "Woven brand label at centre-back neck.",
      "Care and content label at the left side seam (content TBD).",
    ],
    packaging: [
      "Individual recyclable polybag with size sticker.",
      "Flat-pack; folding spec TBD.",
    ],
    qualityChecks: [
      "Confirm colour approval against a lab dip before bulk.",
      "Inline seam and button-attach checks.",
      "Final AQL inspection level to be agreed with the supplier.",
    ],
    unresolvedQuestions: [
      "Final fabric blend, weight, and shrinkage after wash.",
      "Confirmed graded measurements for every size.",
      "Care instructions once fibre content is verified.",
    ],
    assumptions: [
      "Measurements are placeholders (TBD) pending a fit sample.",
      "Construction reflects a typical overshirt and must be confirmed.",
    ],
    disclaimer:
      "DRAFT outline only — this is NOT a production-authorised specification. All measurements are TBD and every field must be verified by a qualified technical designer and manufacturer before production.",
  };
}

function mockListing(text: string): ListingPayload {
  const marker = readMarker<ListingMarker>(MARKER_TAGS.listing, text);
  const name = marker?.name ?? "New Product";
  const price = marker && marker.price > 0 ? round2(marker.price) : 79;
  const currency = marker?.currency ?? "SGD";
  const vendor = marker?.vendor ?? "LabelOS";
  const productType = marker?.productType ?? "Apparel";
  const sizeOptions =
    marker?.sizeOptions && marker.sizeOptions.length > 0
      ? marker.sizeOptions
      : ["XS", "S", "M", "L", "XL"];
  const imageUrl = marker?.imageUrl ?? null;

  return {
    title: name,
    shortDescription:
      "A featherweight layering piece built for humid-city days — clean lines, easy volume, and breathable comfort.",
    htmlDescription:
      `<p>${name} is a light, breathable layer designed to move from air-conditioned mornings to warm evenings.</p>` +
      "<p>Cut with a relaxed, hip-length silhouette and finished with a clean placket, it layers over the capsule's core pieces without adding weight.</p>",
    bulletFeatures: [
      "Relaxed, hip-length silhouette",
      "Breathable, lightweight construction",
      "Clean half-placket with tonal buttons",
      "Designed to layer over the capsule's core pieces",
    ],
    productType,
    vendor,
    tags: ["tropical", "layering", "linen-blend", productType.toLowerCase()],
    seoTitle: `${name} | ${vendor}`,
    seoDescription:
      "A breathable, lightweight overshirt for humid-city days — an easy layer over your everyday pieces.",
    sizeOptions,
    price,
    currency,
    status: "DRAFT",
    careInformation:
      "Care instructions to be confirmed once fibre content is verified. Machine wash cold suggested, subject to final fabric.",
    materialInformationStatus: "unverified",
    collectionStory:
      "Part of a tonal, climate-smart capsule built for humid-city living.",
    imageUrl,
  };
}

function mockDemoTrendReport(market: string, season: string): TrendReport {
  return {
    title: `${season} — demonstration trend directions`,
    market,
    season,
    generatedAt: new Date().toISOString(),
    sourceMode: "demo",
    signals: [
      {
        name: "Elevated resort dressing",
        summary:
          "Polished but relaxed warm-weather pieces that read considered rather than casual.",
        adoptionStage: "growing",
        relevanceToBrand:
          "Fits the brand's understated, climate-smart positioning for a tropical city audience.",
        climateFit: "Strong — breathable naturals suit hot, humid conditions.",
        confidence: 0.6,
        recommendedUse: [
          "Lead with tonal separates.",
          "Emphasise drape and airflow over structure.",
        ],
        avoidBecause: [],
        sources: [],
      },
      {
        name: "Tonal sand-and-stone palettes",
        summary:
          "Quiet, warm neutrals layered tone-on-tone for an easy, cohesive wardrobe.",
        adoptionStage: "established",
        relevanceToBrand: "Matches the brand's signature ivory/sand/charcoal palette.",
        climateFit: "Good — light colours reflect heat and photograph cleanly.",
        confidence: 0.62,
        recommendedUse: ["Merchandise looks as tonal sets."],
        avoidBecause: [],
        sources: [],
      },
      {
        name: "Breathable soft tailoring",
        summary:
          "Unlined, fluid tailoring in linen and cotton blends that keeps a clean line in the heat.",
        adoptionStage: "emerging",
        relevanceToBrand: "Extends the brand's wide-leg trouser and overshirt story.",
        climateFit: "Strong — designed specifically for warm climates.",
        confidence: 0.5,
        recommendedUse: ["Pair soft-tailored bottoms with light knit or shell tops."],
        avoidBecause: ["Avoid heavy interlinings or structured shoulders."],
        sources: [],
      },
    ],
    rejectedSignals: [
      {
        name: "Heavy layered knitwear",
        reason:
          "A strong cold-climate direction that is unwearable in a hot, humid city and conflicts with the brand's prohibited styles.",
      },
    ],
    limitations: [
      "Demonstration data only — these directions are not live market evidence.",
      "Confidence scores are illustrative and should not drive buying decisions.",
      "Enable live web search for cited, current sources.",
    ],
  };
}

// ---------------------------------------------------------------------------
// Usage + provider
// ---------------------------------------------------------------------------

function mockUsage(promptText: string): Usage {
  return usageSchema.parse({
    inputTokens: Math.min(6000, Math.ceil(promptText.length / 4)),
    outputTokens: 420,
    webSearchRequests: 0,
    durationMs: 8,
  });
}

class MockAnthropicProvider implements AnthropicProvider {
  readonly isLive = false;

  async structuredCall<S extends z.ZodType>(
    opts: StructuredCallOptions<S>,
  ): Promise<StructuredCallResult<z.infer<S>>> {
    const text = userText(opts.user);
    const kind = classifySchemaName(opts.schemaName);

    let built: unknown;
    switch (kind) {
      case "garment":
        built = mockGarmentAnalysis(text);
        break;
      case "composer":
        built = mockComposerRanking(text);
        break;
      case "critic":
        built = mockOutfitReview(text);
        break;
      case "reviser":
        built = mockRevision(text);
        break;
      case "story":
        built = mockStory(text);
        break;
      case "gap":
        built = mockNewDesign(text);
        break;
      case "techpack":
        built = mockTechPack(text);
        break;
      case "listing":
        built = mockListing(text);
        break;
      case "trend":
        built = mockDemoTrendReport(
          parseBriefField(text, "Market") ?? "Singapore",
          parseBriefField(text, "Season") ?? "Tropical Resort",
        );
        break;
      default:
        throw new AnthropicCallError(
          "unknown",
          `Mock Anthropic provider has no handler for schema "${opts.schemaName}".`,
        );
    }

    const parsed = opts.schema.safeParse(built);
    if (!parsed.success) {
      throw new AnthropicCallError(
        "invalid_output",
        `Mock output for "${opts.schemaName}" failed its schema: ${parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("; ")}`,
      );
    }

    const usage = mockUsage(text);
    await logActivity({
      actor: opts.schemaName,
      action: opts.route,
      entityId: opts.entityId ?? null,
      provider: "anthropic-mock",
      model: "mock",
      usage,
      inputSummary: `${opts.schemaName} (mock)`,
      outputSummary: "ok — deterministic mock output",
      rawMetadata: { schemaName: opts.schemaName, status: "success", mock: true },
    });

    return { data: parsed.data, usage };
  }

  async trendResearch({
    brief,
  }: TrendResearchInput): Promise<TrendResearchOutput> {
    const report = mockDemoTrendReport(brief.market, brief.season);
    const usage = mockUsage(`${brief.market} ${brief.season} ${brief.commercialObjective}`);
    await logActivity({
      actor: "trend-scout",
      action: "collections.trends",
      provider: "anthropic-mock",
      model: "mock",
      usage,
      inputSummary: `demo trend research (${brief.market} · ${brief.season})`,
      outputSummary: `3 signals, 1 rejected — sourceMode "demo"`,
      rawMetadata: { status: "success", mock: true, sourceMode: "demo" },
    });
    return { report, usage };
  }
}

const mockProvider = new MockAnthropicProvider();

/** The singleton deterministic mock provider (state-free, safe to share). */
export function getMockAnthropicProvider(): AnthropicProvider {
  return mockProvider;
}
