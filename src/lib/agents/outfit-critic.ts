import type { CollectionBrief, OutfitCandidate } from "@/lib/domain/schemas";
import { outfitReviewSchema } from "@/lib/domain/schemas";
import { computeWeightedScore } from "@/lib/domain/scoring";
import {
  AGENT_SCHEMA_NAMES,
  MARKER_TAGS,
  PROMPT_VERSIONS,
  formatProductRecords,
  marker,
  withGrounding,
  type ProductRecordInput,
} from "./common";

/**
 * LabelOS Runway Jury (spec section 13, Part VI — "Runway Jury").
 *
 * The critic evaluates ONE candidate independently. The composer's explanation
 * is explicitly not evidence — the jury judges from the original product
 * records, brand brief, trend evidence, climate, inventory, and occasion. It
 * supplies component scores and a verdict; deterministic code
 * ({@link computeWeightedScore}) computes the final weighted number.
 */

const RUNWAY_JURY_ROLE = `You are the independent LabelOS Runway Jury. The composer's explanation is not
evidence. Evaluate the candidate from the original product records, brand brief,
trend evidence, climate, inventory, and occasion. Be willing to reject a look.
Return component scores, strengths, issues, reason codes, verdict, and exact
revision instructions. Never repair the outfit inside the review.

Score each component (brandFit, visualHarmony, seasonClimateFit, trendRelevance,
commercialValue, novelty) from 0 to 1. Do NOT compute an overall score — the
application computes the weighted total. Choose a verdict of approve, revise, or
reject and, when not approving, give concrete revisionInstructions and the
matching reasonCodes.`;

export const OUTFIT_CRITIC_SYSTEM = withGrounding(RUNWAY_JURY_ROLE);

export { outfitReviewSchema };
export const criticSchema = outfitReviewSchema;

/** Re-exported so the critic route computes the final score from one place. */
export { computeWeightedScore };

/** Marker payload the mock critic reads to decide a verdict without a model. */
interface CriticCandidateMarker {
  candidateId: string;
  heuristicScore: number;
  productIds: string[];
  template: string;
  climate: string;
}

export interface CriticRequest {
  system: string;
  user: string;
  schemaName: string;
  promptVersion: string;
}

/**
 * Build the independent-critic request for a single candidate. Deliberately
 * omits the composer's narrative so the jury cannot be swayed by it.
 */
export function buildCriticRequest(input: {
  brief: CollectionBrief;
  trendSummary: string;
  candidate: OutfitCandidate;
  productRecords: ProductRecordInput[];
  inventoryNotes?: string;
}): CriticRequest {
  const { brief, trendSummary, candidate, productRecords } = input;
  const inventoryNotes = input.inventoryNotes ?? "";

  const payload: CriticCandidateMarker = {
    candidateId: candidate.candidateId,
    heuristicScore: candidate.heuristicScore,
    productIds: candidate.productIds,
    template: candidate.template,
    climate: brief.climate,
  };

  const user = [
    "Independently evaluate this ONE outfit candidate. Judge it from the product records, brief, trend evidence, climate, and inventory below — not from any styling narrative.",
    "",
    `Brief: ${brief.season} · ${brief.market} · climate ${brief.climate}. Audience: ${brief.audience}. Objective: ${brief.commercialObjective}.`,
    brief.prohibitedStyles.length
      ? `Prohibited styles: ${brief.prohibitedStyles.join(", ")}.`
      : "",
    "",
    "Trend evidence summary:",
    trendSummary.trim() || "(no trend summary supplied)",
    "",
    "Candidate:",
    `- candidateId: ${candidate.candidateId} (template ${candidate.template})`,
    `- products: ${candidate.productIds.join(", ")}`,
    `  ${marker(MARKER_TAGS.candidate, payload)}`,
    "",
    "Product records:",
    formatProductRecords(productRecords),
    inventoryNotes ? `\nInventory notes: ${inventoryNotes}` : "",
    "",
    "Return the Outfit Review structured output (component scores 0-1, verdict, reasonCodes, strengths, issues, revisionInstructions).",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return {
    system: OUTFIT_CRITIC_SYSTEM,
    user,
    schemaName: AGENT_SCHEMA_NAMES.outfitReview,
    promptVersion: PROMPT_VERSIONS.runwayJury,
  };
}
