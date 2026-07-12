import type { BrandProfile, CollectionBrief } from "@/lib/domain/schemas";
import type { GarmentDesignSpec } from "@/lib/domain/design-schemas";
import { collectionReviewSchema } from "@/lib/domain/design-schemas";
import { formatBrandProfile, withGrounding } from "./common";

/**
 * LabelOS Collection Curator (new-collection) — Agent 7 (image-generation spec
 * §3 stage 4/"Collection Review", §10 Agent 7, §15).
 *
 * Evaluates the four owner-SELECTED new designs as ONE collection and returns a
 * {@link collectionReviewSchema}: 0–100 scores across brand coherence, category
 * balance, colour story, climate suitability, price architecture, outfit
 * compatibility, manufacturability, production-budget fit and duplicate risk;
 * strengths; blocking issues; and recommended outfits built primarily from the
 * selected new design IDs. It never invents products outside the selected set.
 */

export { collectionReviewSchema };

export const COLLECTION_REVIEW_SCHEMA_NAME = "collection_review";
export const COLLECTION_CURATOR_NEW_PROMPT_VERSION = "collection-curator-new@1";

const COLLECTION_CURATOR_ROLE = `You are the LabelOS Collection Curator. Evaluate the four owner-selected new
garment designs as a single seasonal collection.

Score each dimension from 0 to 100 (higher is better, except duplicateRisk where
a HIGHER score means MORE duplicate risk): brandCoherence, categoryBalance,
colourStory, climateSuitability, priceArchitecture, outfitCompatibility,
manufacturability, productionBudgetFit, duplicateRisk, and an overallScore.

Then:
- List concrete strengths of the collection.
- List blockingIssues only for real problems, each with the offending designId
  (or null), a short code, an explanation, and a suggestedRevision.
- Propose recommendedOutfits built PRIMARILY from the selected new design IDs —
  reference designs by their real style IDs and do NOT invent other products.
- Give a recommendation of approve, revise, or reject.

Do not perform cost or margin arithmetic; judge the collection qualitatively and
use the supplied target numbers as given.`;

export const COLLECTION_CURATOR_NEW_SYSTEM = withGrounding(COLLECTION_CURATOR_ROLE);

export interface CollectionReviewRequest {
  system: string;
  user: string;
  schemaName: string;
  promptVersion: string;
}

function formatSelectedDesign(spec: GarmentDesignSpec): string {
  const primary =
    spec.colourways.find((c) => c.role === "primary") ?? spec.colourways[0];
  return [
    `- ${spec.productName} [${spec.styleId}] — ${spec.category} · ${spec.role}`,
    `  silhouette ${spec.silhouette} · length ${spec.length} · neckline ${spec.neckline ?? "n/a"} · sleeves ${spec.sleeveLength ?? "n/a"}`,
    `  primary colour ${primary?.name ?? "n/a"} ${primary?.hex ?? ""} · target retail ${spec.targetRetailPrice} · margin ${spec.estimatedMarginPercent.toFixed(0)}%`,
    `  coordinates with: ${spec.coordinatesWithSlotIds.join(", ") || "n/a"}`,
  ].join("\n");
}

export function buildCollectionReviewRequest(input: {
  selectedDesigns: GarmentDesignSpec[];
  brief: CollectionBrief;
  brandProfile: BrandProfile;
}): CollectionReviewRequest {
  const { selectedDesigns, brief, brandProfile } = input;

  const designIds = selectedDesigns.map((d) => d.styleId).join(", ");

  const user = [
    "Review these owner-selected new designs as one collection and return the Collection Review structured output.",
    "",
    "Brand profile:",
    formatBrandProfile(brandProfile),
    "",
    `Brief: ${brief.season} · ${brief.market} · climate ${brief.climate}. Audience: ${brief.audience}.`,
    `Commercial objective: ${brief.commercialObjective}`,
    "",
    "Selected designs:",
    selectedDesigns.map(formatSelectedDesign).join("\n"),
    "",
    `Build recommendedOutfits primarily from these design IDs: ${designIds || "(none)"}.`,
    "",
    "Return: overallScore and the nine component scores (0–100), strengths, blockingIssues (designId, code, explanation, suggestedRevision), recommendedOutfits (title, designIds, occasion, reason), recommendation (approve | revise | reject).",
  ].join("\n");

  return {
    system: COLLECTION_CURATOR_NEW_SYSTEM,
    user,
    schemaName: COLLECTION_REVIEW_SCHEMA_NAME,
    promptVersion: COLLECTION_CURATOR_NEW_PROMPT_VERSION,
  };
}
