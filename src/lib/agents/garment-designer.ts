import type { BrandProfile, CollectionBrief } from "@/lib/domain/schemas";
import type { BrandDna, CollectionSlot } from "@/lib/domain/design-schemas";
import { conceptSetSchema } from "@/lib/domain/design-schemas";
import { formatBrandProfile, withGrounding } from "./common";

/**
 * LabelOS Garment Designer — Agent 5 (image-generation spec §3 stage 4,
 * §10 Agent 5).
 *
 * For ONE collection slot, produces three genuinely different structured
 * garment concepts (a {@link conceptSetSchema} value). The three must differ
 * MEANINGFULLY — varying several of silhouette, length, neckline, sleeve,
 * closure, pocket construction, hem, fabric behaviour, and detail placement —
 * not just colour, so the deterministic renderer draws visibly different
 * garments. One concept is flagged recommended.
 *
 * Designs must be original: no named-brand/designer/logo imitation, no
 * copyrighted print. The imagePromptFacts are garment-only (no people, no
 * mannequin, front+back sheet). Prices are targets consistent with the slot;
 * Claude never performs cost or margin arithmetic.
 */

export { conceptSetSchema };

export const CONCEPT_SET_SCHEMA_NAME = "concept_set";
export const GARMENT_DESIGNER_PROMPT_VERSION = "garment-designer@1";

const GARMENT_DESIGNER_ROLE = `You are the LabelOS Garment Designer. For the single collection slot you are
given, design THREE original garment concepts and flag one as recommended.

The three concepts MUST differ meaningfully — not by colour alone. Vary several
of: silhouette, length, neckline/collar, sleeve length/shape, closure, pocket
construction, hem, fabric behaviour, and detail placement, so the concepts read
as distinct garments. Keep every concept inside the slot's category, role,
climate and price intent, and coordinated with the rest of the collection.

Rules:
- Original work only: never imitate a named brand, designer, or copyrighted
  print, and never add a logo unless the owner supplied one and asked for it.
- imagePromptFacts must be garment-only (garmentOnly and frontBackSheet true),
  with a plain neutral background and a restrained product-development style.
- Propose targetRetailPrice, targetFullyLoadedCost and estimatedMarginPercent
  consistent with the slot's targets, but do NOT compute cost or margin
  arithmetic — downstream code recomputes every number. Label costs as targets.
- Provide colourways with valid hex codes and one primary colour per concept.
- Use no human body measurements beyond ordinary garment sizing context.`;

export const GARMENT_DESIGNER_SYSTEM = withGrounding(GARMENT_DESIGNER_ROLE);

export interface ConceptSetRequest {
  system: string;
  user: string;
  schemaName: string;
  promptVersion: string;
}

function formatSlot(slot: CollectionSlot): string {
  return [
    `Slot ${slot.provisionalStyleId} — ${slot.category} · role ${slot.role}`,
    `Product opportunity: ${slot.productOpportunity}`,
    `Customer need: ${slot.customerNeed}`,
    `Occasions: ${slot.intendedOccasions.join(", ") || "n/a"}`,
    `Climate requirements: ${slot.climateRequirements.join(", ") || "n/a"}`,
    `Target retail: ${slot.targetRetailPrice} | target fully loaded cost: ${slot.targetFullyLoadedCost} | target margin: ${slot.targetMarginPercent.toFixed(0)}%`,
    `Coordination: ${slot.coordinationRequirements.join("; ") || "n/a"}`,
    `Development risk limit: ${slot.developmentRiskLimit}`,
    `Rationale: ${slot.rationale}`,
  ].join("\n");
}

function formatBrandDna(dna: BrandDna): string {
  const palette = dna.colourPalette
    .filter((c) => c.usage !== "avoid")
    .map((c) => `${c.name} ${c.hex}`)
    .slice(0, 6)
    .join(", ");
  return [
    `Brand DNA: ${dna.summary}`,
    `Signature palette: ${palette || "n/a"}`,
    `Do NOT duplicate: ${dna.doNotDuplicate.join("; ") || "none recorded"}`,
  ].join("\n");
}

export function buildConceptSetRequest(input: {
  slot: CollectionSlot;
  brief: CollectionBrief;
  brandProfile: BrandProfile;
  brandDna?: BrandDna | null;
  otherSlots: CollectionSlot[];
  /** Slot position in the plan; defaults to a category-derived index. */
  slotIndex?: number;
}): ConceptSetRequest {
  const { slot, brief, brandProfile, brandDna, otherSlots, slotIndex } = input;

  const coordinationTargets = otherSlots
    .map((s) => `${s.provisionalStyleId} (${s.category}, ${s.role})`)
    .join(", ");

  const user = [
    `Design THREE original, meaningfully different concepts for this collection slot, and flag one as recommended.`,
    "",
    "Brand profile:",
    formatBrandProfile(brandProfile),
    "",
    brandDna
      ? `${formatBrandDna(brandDna)}\n`
      : "Brand DNA report: not supplied — infer principles from the brand profile.\n",
    `Brief: ${brief.season} · ${brief.market} · climate ${brief.climate}. Audience: ${brief.audience}.`,
    "",
    "Slot to design:",
    formatSlot(slot),
    "",
    `Other slots in the collection (coordinate with these where relevant): ${coordinationTargets || "none"}.`,
    "",
    typeof slotIndex === "number"
      ? `Use slotIndex ${slotIndex} and provisionalStyleId ${slot.provisionalStyleId} in the output.`
      : `Use provisionalStyleId ${slot.provisionalStyleId} in the output.`,
    "",
    "Return the Concept Set structured output: slotIndex, provisionalStyleId, exactly three concepts, recommendedStyleId, recommendationReason.",
    "Each concept is a full garment design spec (styleId, productName, conceptTitle, category, role, silhouette, fit, length, neckline, collar, sleeveLength, sleeveShape, waistConstruction, hem, closures, pockets, seamDetails, constructionDetails, primaryMaterialRequirement, trims, colourways, targetRetailPrice, targetFullyLoadedCost, estimatedMarginPercent, coordinatesWithSlotIds, brandFitReason, trendReason, climateReason, commercialReason, manufacturabilityRisks, unknowns, originalityCheck, imagePromptFacts).",
    "Make the three concepts vary across silhouette, neckline/collar, sleeve, closure, pockets, hem and length — not colour alone.",
  ].join("\n");

  return {
    system: GARMENT_DESIGNER_SYSTEM,
    user,
    schemaName: CONCEPT_SET_SCHEMA_NAME,
    promptVersion: GARMENT_DESIGNER_PROMPT_VERSION,
  };
}
