import type { CollectionBrief, OutfitCandidate } from "@/lib/domain/schemas";
import { composerRankingSchema, type ComposerRanking } from "@/lib/domain/schemas";
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
 * LabelOS Outfit Composer (spec section 12, Part VI — "Outfit Composer").
 *
 * The composer only ranks and explains ALREADY-VALID deterministic candidates.
 * It may not add, remove, rename, or invent products — it references candidate
 * IDs the application supplies. {@link validateComposerOutput} enforces that
 * after the fact by dropping any ranking whose candidateId was not in the batch.
 */

const OUTFIT_COMPOSER_ROLE = `You are the LabelOS Outfit Composer. You receive already-valid candidate
combinations created by deterministic code. Rank and explain them. You may not
add, remove, rename, or invent products. Evaluate colour, silhouette, texture,
formality, climate, occasion, brand fit, trend relevance, stock priority, and
commercial accessibility. Use only candidate IDs supplied by the application.`;

export const OUTFIT_COMPOSER_SYSTEM = withGrounding(OUTFIT_COMPOSER_ROLE);

export { composerRankingSchema };
export const composerSchema = composerRankingSchema;

/** Marker payload the mock composer reads to rank without a model. */
interface ComposerCandidateMarker {
  candidateId: string;
  heuristicScore: number;
  productIds: string[];
  template: string;
}

export interface ComposerRequest {
  system: string;
  user: string;
  schemaName: string;
  promptVersion: string;
}

function candidateLines(
  candidate: OutfitCandidate,
  titleById: Map<string, string>,
): string {
  const items = candidate.productIds
    .map((id) => `${titleById.get(id) ?? "Unknown item"} [${id}]`)
    .join(" + ");
  const payload: ComposerCandidateMarker = {
    candidateId: candidate.candidateId,
    heuristicScore: candidate.heuristicScore,
    productIds: candidate.productIds,
    template: candidate.template,
  };
  return [
    `- candidateId: ${candidate.candidateId} (template ${candidate.template}, heuristic ${candidate.heuristicScore.toFixed(3)})`,
    `  items: ${items}`,
    candidate.heuristicReasons.length
      ? `  why: ${candidate.heuristicReasons.slice(0, 3).join(" ")}`
      : null,
    `  ${marker(MARKER_TAGS.candidate, payload)}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

/**
 * Build the composer request for a batch of at most ten candidates. The batch
 * is capped defensively here even though the caller should already slice it.
 */
export function buildComposerRequest(input: {
  brief: CollectionBrief;
  trendSummary: string;
  candidates: OutfitCandidate[];
  productRecords: ProductRecordInput[];
}): ComposerRequest {
  const { brief, trendSummary } = input;
  const candidates = input.candidates.slice(0, 10);
  const titleById = new Map(
    input.productRecords.map((record) => [record.id, record.title]),
  );

  const user = [
    "Rank and explain these pre-validated outfit candidates. Reference each by its exact candidateId. Do NOT invent, add, or remove products — every candidate is already a valid combination of real catalog items.",
    "",
    `Brief: ${brief.season} · ${brief.market} · ${brief.climate}. Audience: ${brief.audience}. Objective: ${brief.commercialObjective}.`,
    "",
    "Trend summary:",
    trendSummary.trim() || "(no trend summary supplied)",
    "",
    "Catalog records for the products referenced below:",
    formatProductRecords(input.productRecords),
    "",
    "Candidates:",
    candidates.map((candidate) => candidateLines(candidate, titleById)).join("\n"),
    "",
    "For every candidate return: title, occasion, description, trendConnection, commercialReason, and an integer rank (1 = strongest). Rank all supplied candidates.",
  ].join("\n");

  return {
    system: OUTFIT_COMPOSER_SYSTEM,
    user,
    schemaName: AGENT_SCHEMA_NAMES.composerRanking,
    promptVersion: PROMPT_VERSIONS.outfitComposer,
  };
}

/**
 * Strip any ranking that references a candidateId not in the batch (a
 * hallucinated or renamed candidate). Dropped rankings are logged to the server
 * console; the surviving rankings are returned unchanged.
 */
export function validateComposerOutput(
  output: ComposerRanking,
  candidateIds: Iterable<string>,
): ComposerRanking {
  const known = candidateIds instanceof Set ? candidateIds : new Set(candidateIds);
  const kept: ComposerRanking["rankings"] = [];
  const dropped: string[] = [];

  for (const ranking of output.rankings) {
    if (known.has(ranking.candidateId)) {
      kept.push(ranking);
    } else {
      dropped.push(ranking.candidateId);
    }
  }

  if (dropped.length > 0) {
    console.warn(
      `[outfit-composer] dropped ${dropped.length} ranking(s) with unknown candidateId(s): ${dropped.join(", ")}`,
    );
  }

  return { rankings: kept };
}
