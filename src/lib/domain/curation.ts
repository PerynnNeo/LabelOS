import type {
  CurationLabel,
  CurationSummary,
  OutfitStatus,
} from "@/lib/domain/schemas";
import { jaccard, productUsageCounts } from "@/lib/domain/diversity";

/**
 * Deterministic collection curator.
 *
 * Selects the final capsule outfits greedily by weighted score, enforcing
 * product-usage caps (hero products exempt) and pairwise Jaccard diversity,
 * relaxing constraints only when necessary and always recording what was
 * relaxed or unmet. No Claude involvement — the same input always produces
 * the same selection.
 */

export interface CurationOutfit {
  id: string;
  productIds: string[];
  occasion: string;
  overallScore: number;
  status: OutfitStatus;
}

export interface CurateFinalOutfitsInput {
  outfits: CurationOutfit[];
  heroProductIds: string[];
  /** Target number of final outfits. Default 6. */
  maxFinal?: number;
  /** Maximum allowed pairwise Jaccard similarity between selections. Default 0.5. */
  maxJaccard?: number;
  /** Maximum outfits a non-hero product may appear in. Default 2. */
  maxUsesPerProduct?: number;
}

const ELIGIBLE_STATUSES: ReadonlySet<OutfitStatus> = new Set([
  "approved",
  "revised",
]);

const TARGET_DISTINCT_OCCASIONS = 3;
const CORE_COUNT = 3;
const DIRECTIONAL_COUNT = 2;

function byScoreDescThenId(a: CurationOutfit, b: CurationOutfit): number {
  return (
    b.overallScore - a.overallScore || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

function normalizeOccasion(occasion: string): string {
  return occasion.trim().toLowerCase();
}

export function curateFinalOutfits(
  input: CurateFinalOutfitsInput,
): CurationSummary {
  const {
    outfits,
    heroProductIds,
    maxFinal = 6,
    maxJaccard = 0.5,
    maxUsesPerProduct = 2,
  } = input;

  const heroes = new Set(heroProductIds);
  const unmetConstraints: string[] = [];
  const decisions: string[] = [];

  const eligible = outfits
    .filter((outfit) => ELIGIBLE_STATUSES.has(outfit.status))
    .slice()
    .sort(byScoreDescThenId);

  const selected: CurationOutfit[] = [];
  const selectedIds = new Set<string>();

  const usageOkAgainst = (
    against: CurationOutfit[],
    outfit: CurationOutfit,
  ): boolean => {
    const counts = productUsageCounts(against);
    for (const productId of new Set(outfit.productIds)) {
      if (heroes.has(productId)) continue;
      if ((counts.get(productId) ?? 0) >= maxUsesPerProduct) return false;
    }
    return true;
  };

  const jaccardOkAgainst = (
    against: CurationOutfit[],
    outfit: CurationOutfit,
  ): boolean =>
    against.every(
      (other) =>
        jaccard(other.productIds, outfit.productIds) <= maxJaccard + 1e-9,
    );

  const fillPass = (checkJaccard: boolean, checkUsage: boolean): number => {
    let added = 0;
    for (const outfit of eligible) {
      if (selected.length >= maxFinal) break;
      if (selectedIds.has(outfit.id)) continue;
      if (checkUsage && !usageOkAgainst(selected, outfit)) continue;
      if (checkJaccard && !jaccardOkAgainst(selected, outfit)) continue;
      selected.push(outfit);
      selectedIds.add(outfit.id);
      added += 1;
    }
    return added;
  };

  // Pass 1 — strict: both constraints enforced.
  fillPass(true, true);

  // Pass 2 — relax the Jaccard diversity constraint if we are short.
  let relaxedJaccard = false;
  if (selected.length < maxFinal) {
    const added = fillPass(false, true);
    if (added > 0) {
      relaxedJaccard = true;
      unmetConstraints.push(
        `Relaxed the pairwise similarity constraint (max Jaccard ${maxJaccard}) to admit ${added} additional outfit(s).`,
      );
    }
  }

  // Pass 3 — relax the per-product usage cap too if still short.
  let relaxedUsage = false;
  if (selected.length < maxFinal) {
    const added = fillPass(false, false);
    if (added > 0) {
      relaxedUsage = true;
      unmetConstraints.push(
        `Relaxed the per-product usage cap (max ${maxUsesPerProduct} uses, hero products exempt) to admit ${added} additional outfit(s).`,
      );
    }
  }

  if (selected.length < maxFinal) {
    unmetConstraints.push(
      `Only ${selected.length} of ${maxFinal} requested final outfits could be selected from ${eligible.length} approved/revised outfit(s).`,
    );
  }

  // Occasion coverage — swap-in pass to reach 3 distinct occasions when possible.
  const distinctOccasions = (): Set<string> =>
    new Set(
      selected
        .map((outfit) => normalizeOccasion(outfit.occasion))
        .filter((occasion) => occasion.length > 0),
    );
  const poolOccasions = new Set(
    eligible
      .map((outfit) => normalizeOccasion(outfit.occasion))
      .filter((occasion) => occasion.length > 0),
  );

  if (distinctOccasions().size < TARGET_DISTINCT_OCCASIONS) {
    const coveragePossible =
      poolOccasions.size >= TARGET_DISTINCT_OCCASIONS &&
      selected.length >= TARGET_DISTINCT_OCCASIONS;

    if (coveragePossible) {
      for (const candidate of eligible) {
        if (distinctOccasions().size >= TARGET_DISTINCT_OCCASIONS) break;
        if (selectedIds.has(candidate.id)) continue;
        const candidateOccasion = normalizeOccasion(candidate.occasion);
        if (!candidateOccasion || distinctOccasions().has(candidateOccasion)) {
          continue;
        }

        // Swap out the lowest-scoring selection whose occasion is duplicated.
        const occasionCounts = new Map<string, number>();
        for (const outfit of selected) {
          const key = normalizeOccasion(outfit.occasion);
          occasionCounts.set(key, (occasionCounts.get(key) ?? 0) + 1);
        }
        const swapOut = [...selected]
          .sort(
            (a, b) =>
              a.overallScore - b.overallScore ||
              (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
          )
          .find(
            (outfit) =>
              (occasionCounts.get(normalizeOccasion(outfit.occasion)) ?? 0) >=
              2,
          );
        if (!swapOut) break;

        const remaining = selected.filter(
          (outfit) => outfit.id !== swapOut.id,
        );
        const usageOk =
          relaxedUsage || usageOkAgainst(remaining, candidate);
        const similarityOk =
          relaxedJaccard || jaccardOkAgainst(remaining, candidate);
        if (usageOk && similarityOk) {
          selected.splice(selected.indexOf(swapOut), 1, candidate);
          selectedIds.delete(swapOut.id);
          selectedIds.add(candidate.id);
          decisions.push(
            `Swapped in a "${candidate.occasion.trim()}" outfit (score ${candidate.overallScore}) in place of a duplicate-occasion outfit to broaden occasion coverage.`,
          );
        }
      }
    }

    if (distinctOccasions().size < TARGET_DISTINCT_OCCASIONS) {
      unmetConstraints.push(
        `Could not cover ${TARGET_DISTINCT_OCCASIONS} distinct occasions: the final selection covers ${
          distinctOccasions().size
        } and the eligible pool offers ${poolOccasions.size}.`,
      );
    }
  }

  // Labels — top 3 by score = Core, next 2 = Directional, rest = Statement.
  const ranked = [...selected].sort(byScoreDescThenId);
  const labels: Record<string, CurationLabel> = {};
  ranked.forEach((outfit, index) => {
    labels[outfit.id] =
      index < CORE_COUNT
        ? "Core"
        : index < CORE_COUNT + DIRECTIONAL_COUNT
          ? "Directional"
          : "Statement";
  });
  if (ranked.length < CORE_COUNT + DIRECTIONAL_COUNT + 1) {
    unmetConstraints.push(
      `Fewer than ${CORE_COUNT + DIRECTIONAL_COUNT + 1} final outfits (${ranked.length}) — the Core/Directional/Statement label mix is incomplete.`,
    );
  }

  // Occasions covered — original wording, deduplicated case-insensitively.
  const occasionsCovered: string[] = [];
  const seenOccasions = new Set<string>();
  for (const outfit of ranked) {
    const key = normalizeOccasion(outfit.occasion);
    if (key.length === 0 || seenOccasions.has(key)) continue;
    seenOccasions.add(key);
    occasionsCovered.push(outfit.occasion.trim());
  }

  const notes = [
    `Curated ${ranked.length} final outfit(s) from ${eligible.length} approved/revised candidate(s), greedily by weighted score.`,
    `Constraints: max ${maxUsesPerProduct} uses per product (hero products exempt), max pairwise Jaccard ${maxJaccard}.`,
    occasionsCovered.length > 0
      ? `Occasions covered: ${occasionsCovered.join(", ")}.`
      : "No occasion information was available on the selected outfits.",
    ...decisions,
    unmetConstraints.length === 0
      ? "All curation constraints were satisfied."
      : `${unmetConstraints.length} constraint(s) could not be fully satisfied — see unmetConstraints.`,
  ].join(" ");

  return {
    selectedOutfitIds: ranked.map((outfit) => outfit.id),
    labels,
    occasionsCovered,
    unmetConstraints,
    notes,
    curatedAt: new Date().toISOString(),
  };
}
