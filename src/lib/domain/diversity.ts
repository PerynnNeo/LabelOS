/**
 * Deterministic diversity helpers used by the collection curator and the
 * outfit critic context. Pure — no I/O, no randomness.
 */

/**
 * Jaccard similarity of two string sets (arrays are deduplicated first).
 * Returns |A ∩ B| / |A ∪ B|.
 *
 * Convention: when the union is empty (both arrays empty) this returns 0 —
 * two empty outfits should never be treated as "identical" for the purpose
 * of blocking a diversity constraint.
 */
export function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const value of setA) {
    if (setB.has(value)) {
      intersection += 1;
    }
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Maximum pairwise Jaccard similarity across a list of sets.
 * Returns 0 when fewer than two sets are supplied.
 */
export function maxPairwiseJaccard(sets: string[][]): number {
  let max = 0;
  for (let i = 0; i < sets.length; i += 1) {
    for (let j = i + 1; j < sets.length; j += 1) {
      const similarity = jaccard(sets[i], sets[j]);
      if (similarity > max) {
        max = similarity;
      }
    }
  }
  return max;
}

/**
 * Count how many outfits each product appears in. A product is counted at
 * most once per outfit (duplicate IDs inside one outfit do not double-count).
 */
export function productUsageCounts(
  outfits: Array<{ productIds: string[] }>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const outfit of outfits) {
    for (const productId of new Set(outfit.productIds)) {
      counts.set(productId, (counts.get(productId) ?? 0) + 1);
    }
  }
  return counts;
}
