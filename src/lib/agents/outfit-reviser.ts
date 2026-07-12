import type {
  OutfitCandidate,
  OutfitReview,
  RevisionResult,
} from "@/lib/domain/schemas";
import { revisionResultSchema } from "@/lib/domain/schemas";
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
 * LabelOS Outfit Reviser (spec section 14, Part VI — "Outfit Reviser").
 *
 * Corrects the jury's named problems using ONLY permitted replacement products,
 * changing at least one product. {@link validateRevision} re-checks the result
 * deterministically: every id must come from the permitted ∪ original set, no
 * duplicates, and at least one product must actually change.
 */

const OUTFIT_REVISER_ROLE = `You are the LabelOS Outfit Reviser. Correct the jury's named problems using only
the permitted replacement products. Change at least one product. Preserve valid
hard constraints. Return the revised product IDs and a short mapping from every
reason code to the correction. Do not add any product outside the permitted list.`;

export const OUTFIT_REVISER_SYSTEM = withGrounding(OUTFIT_REVISER_ROLE);

export { revisionResultSchema };
export const reviserSchema = revisionResultSchema;

/** Marker payload the mock reviser reads to swap without a model. */
interface RevisionMarker {
  originalIds: string[];
  permittedIds: string[];
  reasonCodes: string[];
}

export interface ReviserRequest {
  system: string;
  user: string;
  schemaName: string;
  promptVersion: string;
}

/**
 * Build the reviser request. `permittedReplacements` is the exact, closed set
 * of products the reviser may introduce; the original outfit's own products may
 * be kept.
 */
export function buildReviserRequest(input: {
  candidate: OutfitCandidate;
  review: OutfitReview;
  permittedReplacements: ProductRecordInput[];
}): ReviserRequest {
  const { candidate, review, permittedReplacements } = input;

  const payload: RevisionMarker = {
    originalIds: candidate.productIds,
    permittedIds: permittedReplacements.map((record) => record.id),
    reasonCodes: review.reasonCodes,
  };

  const user = [
    "Revise this outfit to fix the jury's problems. Change at least one product. Use ONLY products from the permitted-replacement list, or keep an original product — never introduce anything else.",
    "",
    `Original product IDs: ${candidate.productIds.join(", ")}`,
    `Jury reason codes: ${review.reasonCodes.join(", ") || "none"}`,
    review.revisionInstructions.length
      ? `Jury revision instructions:\n${review.revisionInstructions.map((instruction) => `- ${instruction}`).join("\n")}`
      : "Jury revision instructions: none supplied.",
    review.issues.length ? `Jury issues: ${review.issues.join("; ")}` : "",
    "",
    "Permitted replacement products:",
    formatProductRecords(permittedReplacements),
    "",
    `  ${marker(MARKER_TAGS.revision, payload)}`,
    "",
    "Return productIds (the full revised outfit), a corrections array mapping every reason code to the concrete change you made, and a one-line summary.",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return {
    system: OUTFIT_REVISER_SYSTEM,
    user,
    schemaName: AGENT_SCHEMA_NAMES.revisionResult,
    promptVersion: PROMPT_VERSIONS.outfitReviser,
  };
}

// ---------------------------------------------------------------------------
// Deterministic validation of the reviser's output
// ---------------------------------------------------------------------------

export type RevisionValidationCode =
  | "NO_CHANGE"
  | "UNKNOWN_PRODUCT_IDS"
  | "DUPLICATE_PRODUCT_IDS"
  | "EMPTY";

export class RevisionValidationError extends Error {
  readonly code: RevisionValidationCode;
  readonly details: readonly string[];

  constructor(
    code: RevisionValidationCode,
    message: string,
    details: readonly string[] = [],
  ) {
    super(message);
    this.name = "RevisionValidationError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Validate a reviser result against the closed product set.
 *
 * Rules:
 * - at least one product must differ from the original outfit (as a set);
 * - every returned id must be in `permittedIds ∪ originalProductIds`;
 * - no duplicate ids;
 * - the outfit must not be empty.
 *
 * @returns the same {@link RevisionResult} when valid.
 * @throws RevisionValidationError otherwise.
 */
export function validateRevision(
  result: RevisionResult,
  originalProductIds: readonly string[],
  permittedIds: Iterable<string>,
): RevisionResult {
  const newIds = result.productIds;

  if (newIds.length === 0) {
    throw new RevisionValidationError(
      "EMPTY",
      "The revised outfit has no products.",
    );
  }

  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of newIds) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  if (duplicates.size > 0) {
    throw new RevisionValidationError(
      "DUPLICATE_PRODUCT_IDS",
      `The revised outfit repeats product ID(s): ${[...duplicates].join(", ")}.`,
      [...duplicates],
    );
  }

  const allowed = new Set<string>([
    ...originalProductIds,
    ...(permittedIds instanceof Set ? permittedIds : new Set(permittedIds)),
  ]);
  const unknown = newIds.filter((id) => !allowed.has(id));
  if (unknown.length > 0) {
    throw new RevisionValidationError(
      "UNKNOWN_PRODUCT_IDS",
      `The revised outfit uses product ID(s) outside the permitted set: ${unknown.join(", ")}.`,
      unknown,
    );
  }

  const originalSet = new Set(originalProductIds);
  const changed =
    newIds.length !== originalSet.size ||
    newIds.some((id) => !originalSet.has(id));
  if (!changed) {
    throw new RevisionValidationError(
      "NO_CHANGE",
      "The reviser returned the original outfit unchanged; at least one product must change.",
    );
  }

  return result;
}
