import {
  REVIEW_SCORE_WEIGHTS,
  type OutfitReviewScores,
} from "@/lib/domain/schemas";

/**
 * Deterministic weighted outfit score.
 *
 * The independent critic (Runway Jury) supplies component scores and reasons;
 * THIS code supplies the final number. Claude never performs the weighted
 * arithmetic.
 *
 * Deliberately absent: a `verdictFromScore` helper. The verdict
 * (approve / revise / reject) comes from the critic's structured output, not
 * from a score threshold — do not derive one here.
 */

/**
 * Compute the weighted overall score (0–1, rounded to 4 decimal places) from
 * the critic's component scores using {@link REVIEW_SCORE_WEIGHTS}.
 *
 * @throws RangeError when any component score is missing, not a finite
 * number, or outside the inclusive range 0–1.
 */
export function computeWeightedScore(scores: OutfitReviewScores): number {
  let total = 0;
  for (const [key, weight] of Object.entries(REVIEW_SCORE_WEIGHTS) as Array<
    [keyof OutfitReviewScores, number]
  >) {
    const value = scores[key];
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 1
    ) {
      throw new RangeError(
        `Review score "${key}" must be a finite number between 0 and 1 (received ${String(
          value,
        )}).`,
      );
    }
    total += value * weight;
  }
  return Math.round(total * 10000) / 10000;
}
