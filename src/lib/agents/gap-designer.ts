import type { BrandProfile, CollectionBrief } from "@/lib/domain/schemas";
import { newDesignSchema } from "@/lib/domain/schemas";
import {
  AGENT_SCHEMA_NAMES,
  MARKER_TAGS,
  PROMPT_VERSIONS,
  formatBrandProfile,
  formatProductRecords,
  marker,
  withGrounding,
  type ProductRecordInput,
} from "./common";

/**
 * LabelOS Assortment Gap Designer (spec section 16, Part VI — "Gap Designer").
 *
 * Proposes exactly ONE original product that solves a demonstrated gap and
 * unlocks at least two outfits from existing products. Claude proposes a
 * targetRetailPrice but never computes costs or margins — the deterministic
 * costing module owns all arithmetic (spec: "Do not use Claude to perform
 * margin arithmetic").
 */

const GAP_DESIGNER_ROLE = `You are the LabelOS Assortment Gap Designer. Propose exactly one original product
that solves a demonstrated gap in the final capsule and unlocks at least two
outfits using existing products. Fit the target audience, climate, brand,
category plan, price range, and target margin. Do not imitate a named brand.
Separate requirements from assumptions and list human decisions still needed.

You may propose a targetRetailPrice inside the brand's stated price range. Do NOT
compute costs, landed cost, or margins — the application derives every cost
number deterministically from your target retail price. Reference existing
outfits by their real IDs when listing what the new product unlocks.`;

export const GAP_DESIGNER_SYSTEM = withGrounding(GAP_DESIGNER_ROLE);

export { newDesignSchema };
export const gapSchema = newDesignSchema;

/** Marker payload the mock gap designer reads to propose without a model. */
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

export interface GapOutfit {
  id: string;
  name: string;
  occasion?: string;
}

export interface PriceArchitecture {
  min: number;
  max: number;
  currency: string;
}

export interface GapRequest {
  system: string;
  user: string;
  schemaName: string;
  promptVersion: string;
}

export function buildGapRequest(input: {
  brief: CollectionBrief;
  brandProfile: BrandProfile;
  finalOutfits: GapOutfit[];
  unusedProducts: ProductRecordInput[];
  priceArchitecture: PriceArchitecture;
  targetGrossMargin: number;
  categories: string[];
}): GapRequest {
  const {
    brief,
    brandProfile,
    finalOutfits,
    unusedProducts,
    priceArchitecture,
    targetGrossMargin,
    categories,
  } = input;

  const payload: GapMarker = {
    market: brief.market,
    season: brief.season,
    targetGrossMargin,
    categories,
    outfitIds: finalOutfits.map((outfit) => outfit.id),
    priceMin: priceArchitecture.min,
    priceMax: priceArchitecture.max,
    currency: priceArchitecture.currency,
  };

  const outfitLines = finalOutfits
    .map((outfit, index) => `${index + 1}. ${outfit.name} [${outfit.id}]${outfit.occasion ? ` — ${outfit.occasion}` : ""}`)
    .join("\n");

  const user = [
    "Propose exactly ONE new product that fills a demonstrated gap in this capsule and unlocks at least two outfits using existing products.",
    "",
    "Brand profile:",
    formatBrandProfile(brandProfile),
    "",
    `Brief: ${brief.season} · ${brief.market} · climate ${brief.climate}. Audience: ${brief.audience}.`,
    `Existing product categories in the capsule: ${categories.join(", ") || "none recorded"}.`,
    `Price architecture: ${priceArchitecture.currency} ${priceArchitecture.min}–${priceArchitecture.max}. Target gross margin: ${(targetGrossMargin * 100).toFixed(0)}%.`,
    "",
    "Final outfits (reference by ID for outfitIdsUnlocked):",
    outfitLines || "(none)",
    "",
    unusedProducts.length
      ? `Currently unused products (for context):\n${formatProductRecords(unusedProducts)}`
      : "No unused products supplied.",
    "",
    `  ${marker(MARKER_TAGS.gap, payload)}`,
    "",
    "Return the New Design structured output: category, name, problemSolved, outfitIdsUnlocked, targetCustomer, silhouette, colour, colourHex, constructionDirection, fabricRequirements, verifiedData, assumedData, targetRetailPrice (within the price range), estimatedRisk, originalitySafeguards, openQuestions, and the sketch hints (sketchTemplate, neckline, sleeveLength, garmentLength). Do NOT include any cost or margin numbers.",
  ].join("\n");

  return {
    system: GAP_DESIGNER_SYSTEM,
    user,
    schemaName: AGENT_SCHEMA_NAMES.newDesign,
    promptVersion: PROMPT_VERSIONS.gapDesigner,
  };
}
