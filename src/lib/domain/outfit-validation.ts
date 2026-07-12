import type { GarmentCategory } from "@/lib/domain/schemas";

/**
 * Shared deterministic guards for outfit product IDs and templates.
 *
 * Routes call these after every Claude interaction (composer, critic,
 * reviser) so hallucinated products, duplicated products, or broken
 * templates can never reach the database.
 */

export type OutfitValidationCode =
  | "UNKNOWN_PRODUCT_IDS"
  | "DUPLICATE_PRODUCT_IDS"
  | "INVALID_TEMPLATE";

export class OutfitValidationError extends Error {
  readonly code: OutfitValidationCode;
  /** Offending IDs or category names, for logging and friendly UI messages. */
  readonly details: readonly string[];

  constructor(
    code: OutfitValidationCode,
    message: string,
    details: readonly string[] = [],
  ) {
    super(message);
    this.name = "OutfitValidationError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Assert that every product ID exists in the known catalog set.
 *
 * @throws OutfitValidationError (UNKNOWN_PRODUCT_IDS) listing the
 * hallucinated IDs when any ID is not in `knownIds`.
 */
export function assertProductIdsExist(
  productIds: readonly string[],
  knownIds: Iterable<string>,
): void {
  const known: ReadonlySet<string> =
    knownIds instanceof Set ? knownIds : new Set(knownIds);
  const unknown = productIds.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new OutfitValidationError(
      "UNKNOWN_PRODUCT_IDS",
      `Outfit references ${unknown.length} product ID(s) that do not exist in the catalog: ${unknown.join(
        ", ",
      )}. Agent output was rejected — only real catalog product IDs are allowed.`,
      unknown,
    );
  }
}

/**
 * Assert that no product ID appears more than once in the outfit.
 *
 * @throws OutfitValidationError (DUPLICATE_PRODUCT_IDS) listing the
 * duplicated IDs.
 */
export function assertNoDuplicateIds(productIds: readonly string[]): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of productIds) {
    if (seen.has(id)) {
      duplicates.add(id);
    }
    seen.add(id);
  }
  if (duplicates.size > 0) {
    throw new OutfitValidationError(
      "DUPLICATE_PRODUCT_IDS",
      `Outfit contains duplicate product ID(s): ${[...duplicates].join(
        ", ",
      )}. Each product may appear at most once per outfit.`,
      [...duplicates],
    );
  }
}

/**
 * Re-check the deterministic template rules on a (possibly revised) outfit.
 *
 * Valid templates, expressed as category multisets:
 * - top + bottom
 * - top + bottom + outerwear
 * - dress
 * - dress + outerwear
 * - any of the above plus at most ONE accessory
 *
 * Footwear and "other" items are never part of an MVP outfit template.
 *
 * @throws OutfitValidationError (INVALID_TEMPLATE) with a clear explanation.
 */
export function assertTemplateValid(
  categories: readonly GarmentCategory[],
): void {
  const counts: Record<GarmentCategory, number> = {
    top: 0,
    bottom: 0,
    dress: 0,
    outerwear: 0,
    footwear: 0,
    accessory: 0,
    other: 0,
  };
  for (const category of categories) {
    counts[category] += 1;
  }

  const fail = (reason: string): never => {
    throw new OutfitValidationError(
      "INVALID_TEMPLATE",
      `Invalid outfit template (${categories.join(" + ") || "empty"}): ${reason} Valid templates are top+bottom, top+bottom+outerwear, dress, or dress+outerwear, each with at most one accessory.`,
      [...categories],
    );
  };

  if (counts.footwear > 0) {
    fail("footwear is not part of any MVP outfit template.");
  }
  if (counts.other > 0) {
    fail('products categorised as "other" cannot be used in outfit templates.');
  }
  if (counts.accessory > 1) {
    fail("at most one accessory may be appended to an outfit.");
  }
  if (counts.outerwear > 1) {
    fail("at most one outerwear item is allowed per outfit.");
  }

  const isDressBase =
    counts.dress === 1 && counts.top === 0 && counts.bottom === 0;
  const isSeparatesBase =
    counts.dress === 0 && counts.top === 1 && counts.bottom === 1;

  if (!isDressBase && !isSeparatesBase) {
    fail(
      "the base must be exactly one dress, or exactly one top with one bottom.",
    );
  }
}
