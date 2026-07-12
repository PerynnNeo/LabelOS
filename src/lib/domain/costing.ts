import type {
  Costing,
  QuoteComparison,
  QuotePayload,
} from "@/lib/domain/schemas";

/**
 * Deterministic costing and quote-comparison arithmetic.
 *
 * Per the LabelOS grounding rule, Claude never performs margin arithmetic —
 * every number here is computed by code so it is reproducible and testable.
 */

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// Target costing
// ---------------------------------------------------------------------------

/**
 * Allowance rates applied to the maximum landed cost to build the detailed
 * estimate. Each is a fraction of `maximumLandedCost`.
 */
export const COSTING_ALLOWANCE_RATES = {
  packagingAllowance: 0.03,
  freightAllowance: 0.08,
  dutyAllowance: 0.05,
  sampleAllocation: 0.04,
  returnAllowance: 0.05,
} as const;

export interface ComputeCostingInput {
  targetRetailPrice: number;
  targetGrossMargin: number;
  currency: string;
}

/**
 * Compute the deterministic costing model:
 *
 *   maximumLandedCost = targetRetailPrice × (1 − targetGrossMargin)
 *
 * The detailed estimate deducts packaging (3%), freight (8%), duty (5%),
 * sample allocation (4%) and return allowance (5%) — each a share of the
 * landed cost — leaving `maximumFactoryCost` (floored at 0). All money values
 * are rounded to 2 decimal places.
 *
 * @throws RangeError when the price is not a positive finite number or the
 * margin is outside 0–0.95.
 */
export function computeCosting(input: ComputeCostingInput): Costing {
  const { targetRetailPrice, targetGrossMargin, currency } = input;

  if (!Number.isFinite(targetRetailPrice) || targetRetailPrice <= 0) {
    throw new RangeError(
      `targetRetailPrice must be a positive number (received ${String(
        targetRetailPrice,
      )}).`,
    );
  }
  if (
    !Number.isFinite(targetGrossMargin) ||
    targetGrossMargin < 0 ||
    targetGrossMargin > 0.95
  ) {
    throw new RangeError(
      `targetGrossMargin must be between 0 and 0.95 (received ${String(
        targetGrossMargin,
      )}). A margin above 95% is not a realistic apparel target.`,
    );
  }

  const maximumLandedCost = round2(targetRetailPrice * (1 - targetGrossMargin));

  const packagingAllowance = round2(
    maximumLandedCost * COSTING_ALLOWANCE_RATES.packagingAllowance,
  );
  const freightAllowance = round2(
    maximumLandedCost * COSTING_ALLOWANCE_RATES.freightAllowance,
  );
  const dutyAllowance = round2(
    maximumLandedCost * COSTING_ALLOWANCE_RATES.dutyAllowance,
  );
  const sampleAllocation = round2(
    maximumLandedCost * COSTING_ALLOWANCE_RATES.sampleAllocation,
  );
  const returnAllowance = round2(
    maximumLandedCost * COSTING_ALLOWANCE_RATES.returnAllowance,
  );

  const allowanceTotal =
    packagingAllowance +
    freightAllowance +
    dutyAllowance +
    sampleAllocation +
    returnAllowance;

  const maximumFactoryCost = Math.max(
    0,
    round2(maximumLandedCost - allowanceTotal),
  );

  return {
    targetRetailPrice,
    targetGrossMargin,
    maximumLandedCost,
    currency,
    detailedEstimate: {
      packagingAllowance,
      freightAllowance,
      dutyAllowance,
      sampleAllocation,
      returnAllowance,
      maximumFactoryCost,
    },
    calculatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Quote normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise a supplier quote to a per-unit landed cost estimate:
 *
 *   landedCostPerUnit = unitPrice + freightEstimatePerUnit
 *                     + dutyEstimatePerUnit + sampleFee / quantity
 *
 * Rounded to 2 decimal places.
 *
 * @throws RangeError when quantity is not a positive integer.
 */
export function normalizeQuote(
  quote: QuotePayload,
  quantity: number,
): { landedCostPerUnit: number } {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new RangeError(
      `quantity must be a positive integer (received ${String(quantity)}).`,
    );
  }
  const landedCostPerUnit = round2(
    quote.unitPrice +
      quote.freightEstimatePerUnit +
      quote.dutyEstimatePerUnit +
      quote.sampleFee / quantity,
  );
  return { landedCostPerUnit };
}

// ---------------------------------------------------------------------------
// Quote comparison
// ---------------------------------------------------------------------------

/**
 * Transparent comparison weights (sum = 1.0). Price fit carries only 30% of
 * the total, so the cheapest quote can never automatically win — capability,
 * speed and quality carry the remaining 70%.
 */
export const QUOTE_COMPARISON_WEIGHTS = {
  priceFit: 0.3,
  moqFit: 0.15,
  sampleSpeed: 0.15,
  productionSpeed: 0.1,
  capabilityFit: 0.15,
  qualityConfidence: 0.15,
} as const;

export interface RfqQuoteInput {
  rfqId: string;
  supplierName: string;
  capabilities: string[];
  quote: QuotePayload;
}

export interface CompareQuotesInput {
  rfqs: RfqQuoteInput[];
  requiredCapabilities: string[];
  quantity: number;
  maximumLandedCost: number;
}

/**
 * Keyword groups used by the deterministic quality-confidence heuristic.
 * Matching any keyword in a group counts that group once.
 */
const QUALITY_KEYWORD_GROUPS: ReadonlyArray<readonly string[]> = [
  ["aql"],
  ["inspection", "inspect"],
  ["inline", "in-line"],
  ["final"],
  ["audit"],
  ["iso"],
  ["replace", "replacement"],
  ["refund"],
  ["credit"],
  ["report"],
  ["third-party", "third party"],
];

/**
 * Deterministic quality-confidence heuristic (0–1), derived ONLY from the
 * supplier's `qualityProcess` and `defectPolicy` text. It is a proxy for how
 * specific and accountable the supplier's stated process is — it is not a
 * verified audit and must not replace due diligence.
 *
 * Formula (documented so the UI can explain it):
 * - base 0.2 for any quote;
 * - +0.1 when `qualityProcess` (trimmed) is at least 40 characters;
 * - +0.1 when `qualityProcess` is at least 120 characters;
 * - +0.1 when `defectPolicy` (trimmed) is at least 40 characters;
 * - +0.08 per matched keyword group (max 5 groups) across the combined
 *   lowercase text. Groups: AQL, inspection, inline/in-line, final, audit,
 *   ISO, replace(ment), refund, credit, report, third-party.
 * Result is capped at 1 and rounded to 4 decimal places.
 */
export function qualityConfidenceScore(quote: QuotePayload): number {
  const qualityProcess = quote.qualityProcess.trim();
  const defectPolicy = quote.defectPolicy.trim();
  const combined = `${qualityProcess} ${defectPolicy}`.toLowerCase();

  let score = 0.2;
  if (qualityProcess.length >= 40) score += 0.1;
  if (qualityProcess.length >= 120) score += 0.1;
  if (defectPolicy.length >= 40) score += 0.1;

  let matchedGroups = 0;
  for (const group of QUALITY_KEYWORD_GROUPS) {
    if (group.some((keyword) => combined.includes(keyword))) {
      matchedGroups += 1;
    }
  }
  score += 0.08 * Math.min(5, matchedGroups);

  return round4(Math.min(1, score));
}

/**
 * Deterministically compare supplier quotes.
 *
 * Component scores (each 0–1):
 * - priceFit: cheapestLandedCost / landedCost (cheapest = 1). Because its
 *   weight is capped at 30%, the lowest price never automatically wins.
 * - moqFit: 1 when quantity ≥ MOQ, otherwise quantity / MOQ.
 * - sampleSpeed: fastestSampleLeadDays / sampleLeadDays.
 * - productionSpeed: fastestProductionLeadDays / productionLeadDays.
 * - capabilityFit: |required ∩ supplier capabilities| / |required|
 *   (1 when no capabilities are required). Case-insensitive.
 * - qualityConfidence: see {@link qualityConfidenceScore}.
 *
 * Results are sorted by totalScore descending (ties broken by rfqId
 * ascending) and each carries a `withinMaxLandedCost` flag.
 *
 * @throws RangeError for a non-positive-integer quantity or a negative
 * maximumLandedCost.
 */
export function compareQuotes(input: CompareQuotesInput): QuoteComparison[] {
  const { rfqs, requiredCapabilities, quantity, maximumLandedCost } = input;

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new RangeError(
      `quantity must be a positive integer (received ${String(quantity)}).`,
    );
  }
  if (!Number.isFinite(maximumLandedCost) || maximumLandedCost < 0) {
    throw new RangeError(
      `maximumLandedCost must be a non-negative number (received ${String(
        maximumLandedCost,
      )}).`,
    );
  }
  if (rfqs.length === 0) {
    return [];
  }

  const landedCosts = rfqs.map(
    (rfq) => normalizeQuote(rfq.quote, quantity).landedCostPerUnit,
  );
  const cheapestLanded = Math.min(...landedCosts);
  const fastestSample = Math.min(
    ...rfqs.map((rfq) => rfq.quote.sampleLeadDays),
  );
  const fastestProduction = Math.min(
    ...rfqs.map((rfq) => rfq.quote.productionLeadDays),
  );

  const required = new Set(
    requiredCapabilities
      .map((capability) => capability.trim().toLowerCase())
      .filter((capability) => capability.length > 0),
  );

  const comparisons = rfqs.map((rfq, index): QuoteComparison => {
    const landedCostEstimate = landedCosts[index];

    const priceFit = round4(
      landedCostEstimate === 0 ? 1 : cheapestLanded / landedCostEstimate,
    );

    const moq = rfq.quote.minimumOrderQuantity;
    const moqFit = quantity >= moq ? 1 : round4(quantity / moq);

    const sampleSpeed = round4(fastestSample / rfq.quote.sampleLeadDays);
    const productionSpeed = round4(
      fastestProduction / rfq.quote.productionLeadDays,
    );

    let capabilityFit = 1;
    if (required.size > 0) {
      const supplierCapabilities = new Set(
        rfq.capabilities.map((capability) => capability.trim().toLowerCase()),
      );
      let matched = 0;
      for (const capability of required) {
        if (supplierCapabilities.has(capability)) {
          matched += 1;
        }
      }
      capabilityFit = round4(matched / required.size);
    }

    const qualityConfidence = qualityConfidenceScore(rfq.quote);

    const totalScore = round4(
      priceFit * QUOTE_COMPARISON_WEIGHTS.priceFit +
        moqFit * QUOTE_COMPARISON_WEIGHTS.moqFit +
        sampleSpeed * QUOTE_COMPARISON_WEIGHTS.sampleSpeed +
        productionSpeed * QUOTE_COMPARISON_WEIGHTS.productionSpeed +
        capabilityFit * QUOTE_COMPARISON_WEIGHTS.capabilityFit +
        qualityConfidence * QUOTE_COMPARISON_WEIGHTS.qualityConfidence,
    );

    return {
      rfqId: rfq.rfqId,
      supplierName: rfq.supplierName,
      landedCostEstimate,
      moqFit,
      sampleSpeed,
      productionSpeed,
      capabilityFit,
      qualityConfidence,
      priceFit,
      totalScore,
      withinMaxLandedCost: landedCostEstimate <= maximumLandedCost + 1e-9,
    };
  });

  comparisons.sort(
    (a, b) =>
      b.totalScore - a.totalScore ||
      (a.rfqId < b.rfqId ? -1 : a.rfqId > b.rfqId ? 1 : 0),
  );

  return comparisons;
}
