import type { BrandProfile, CollectionBrief } from "@/lib/domain/schemas";
import type { BrandDna } from "@/lib/domain/design-schemas";
import { collectionPlanSchema } from "@/lib/domain/design-schemas";
import {
  formatBrandProfile,
  formatProductRecords,
  withGrounding,
  type ProductRecordInput,
} from "./common";

/**
 * LabelOS Collection Architect — Agent 4 (image-generation spec §3 stage 3,
 * §10 Agent 4, §15).
 *
 * Produces the commercial + creative blueprint for a brand-new seasonal
 * capsule: EXACTLY four collection slots (a top, a bottom, a dress, and a
 * lightweight outer layer). The existing reference catalog is supplied ONLY so
 * the architect can avoid duplicating what the brand already sells and stay
 * on-brand — it must never recreate an existing garment.
 *
 * Hard rules encoded in the system prompt (spec §10 "Agent 4", §15):
 * - exactly four slots: top, bottom, dress, lightweight outer layer;
 * - at least two Core slots and no more than one Statement slot;
 * - every slot coordinates with at least two other slots;
 * - every slot has a positive target margin;
 * - each slot explains why it does NOT duplicate the reference catalog.
 *
 * Claude proposes target retail prices; it never computes cost or margin
 * arithmetic — the deterministic costing module owns every number downstream.
 */

// Re-export so routes/providers import the plan contract from the agent.
export { collectionPlanSchema };

/** Canonical structured-output schema name for the plan call. */
export const COLLECTION_PLAN_SCHEMA_NAME = "collection_plan";
/** Bump when the wording below changes so stored plans stay traceable. */
export const COLLECTION_ARCHITECT_PROMPT_VERSION = "collection-architect@1";

const COLLECTION_ARCHITECT_ROLE = `You are the LabelOS Collection Architect. Design the architecture for a brand-new
seasonal capsule of ORIGINAL garments — not outfits assembled from existing
inventory. You are given the brand's reference catalog only so you can (a) stay
on-brand and (b) prove each new slot does not simply duplicate a product the
brand already sells. Do NOT recreate, re-skin, or lightly restyle any existing
reference garment.

Return EXACTLY four collection slots, in this order and covering these needs:
1. a new TOP (category "top"),
2. a new BOTTOM (category "bottom"),
3. a new DRESS or coordinated one-piece (category "dress"),
4. a new LIGHTWEIGHT OUTER LAYER (category "outerwear").

Hard rules:
- Product roles: at least TWO slots must be "core" and AT MOST ONE may be
  "statement". Use "directional" for the rest.
- Every slot must coordinate with at least two OTHER slots — express this in
  coordinationRequirements by referencing the other slots' provisional style IDs.
- Every slot must have a positive target margin and a sensible price so the four
  retail prices form a coherent ladder.
- Each slot must give a nonDuplicationReason that names how it differs
  structurally from the closest reference product (silhouette, length, neckline,
  sleeve, closure, pocket layout, colour, or material behaviour).
- Provisional style IDs are new and must not reuse any reference product ID.

You may propose targetRetailPrice, targetFullyLoadedCost and targetMarginPercent
as targets, but do NOT perform cost or margin arithmetic — downstream code
recomputes every cost deterministically. Label costs as targets, never as quotes.`;

export const COLLECTION_ARCHITECT_SYSTEM = withGrounding(COLLECTION_ARCHITECT_ROLE);

export interface CollectionPlanRequest {
  system: string;
  user: string;
  schemaName: string;
  promptVersion: string;
}

/** Compact briefing of the learned brand DNA, when it is available. */
function formatBrandDna(dna: BrandDna): string {
  const palette = dna.colourPalette
    .filter((c) => c.usage !== "avoid")
    .map((c) => `${c.name} ${c.hex}`)
    .slice(0, 6)
    .join(", ");
  const avoid = dna.colourPalette
    .filter((c) => c.usage === "avoid")
    .map((c) => c.name)
    .join(", ");
  const silhouettes = dna.silhouettePatterns.map((s) => s.name).join(", ");
  return [
    `Brand DNA summary: ${dna.summary}`,
    `Signature palette: ${palette || "n/a"}${avoid ? ` | avoid: ${avoid}` : ""}`,
    `Recurring silhouettes: ${silhouettes || "n/a"}`,
    `Do NOT duplicate: ${dna.doNotDuplicate.join("; ") || "none recorded"}`,
    dna.uncertaintyNotes.length
      ? `Uncertainty: ${dna.uncertaintyNotes.join("; ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Build the Collection Architect request for a brand's new capsule.
 *
 * @param input.referenceProducts existing catalog products, supplied purely so
 *   the architect can avoid duplication — never as garments to reproduce.
 */
export function buildCollectionPlanRequest(input: {
  brief: CollectionBrief;
  brandProfile: BrandProfile;
  referenceProducts: ProductRecordInput[];
  brandDna?: BrandDna | null;
}): CollectionPlanRequest {
  const { brief, brandProfile, referenceProducts, brandDna } = input;

  const user = [
    "Design a brand-new four-piece capsule for this brand. The reference catalog below is for context and non-duplication only — do not recreate any of it.",
    "",
    "Brand profile:",
    formatBrandProfile(brandProfile),
    "",
    brandDna
      ? `${formatBrandDna(brandDna)}\n`
      : "Brand DNA report: not supplied — infer principles from the brand profile and catalog.\n",
    `Brief: ${brief.season} · ${brief.market} · climate ${brief.climate}.`,
    `Audience: ${brief.audience}. Price tier: ${brief.priceTier}.`,
    `Commercial objective: ${brief.commercialObjective}`,
    `Target gross margin: ${(brief.targetGrossMargin * 100).toFixed(0)}%.`,
    "",
    "Reference catalog (existing products — avoid duplicating these):",
    referenceProducts.length
      ? formatProductRecords(referenceProducts)
      : "(no reference products supplied)",
    "",
    "Return the Collection Plan structured output: collectionName, season, colourStory, exactly four slots (top, bottom, dress, lightweight outerwear), totalFirstRunCommitmentEstimate, fitsProductionBudget, budgetNote.",
    "Each slot needs: provisionalStyleId, category, role, productOpportunity, customerNeed, intendedOccasions, climateRequirements, targetRetailPrice, targetFullyLoadedCost, targetMarginPercent, coordinationRequirements (referencing at least two other slots' style IDs), nonDuplicationReason, developmentRiskLimit, rationale.",
    "At least two slots must be core, at most one statement; every margin must be positive.",
  ].join("\n");

  return {
    system: COLLECTION_ARCHITECT_SYSTEM,
    user,
    schemaName: COLLECTION_PLAN_SCHEMA_NAME,
    promptVersion: COLLECTION_ARCHITECT_PROMPT_VERSION,
  };
}
