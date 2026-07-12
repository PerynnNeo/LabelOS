import "server-only";
import type { ApiErrorCode } from "@/lib/api";
import { getEnv } from "@/lib/env";
import {
  brandProfileSchema,
  collectionBriefSchema,
  outfitCandidateSchema,
  outfitReviewSchema,
  storedReviewSchema,
  type BrandProfile,
  type CollectionBrief,
  type GarmentCategory,
  type OutfitCandidate,
  type OutfitReview,
  type StoredReview,
  type TrendReport,
  type Usage,
} from "@/lib/domain/schemas";
import { computeWeightedScore } from "@/lib/domain/scoring";
import { normalizeCategory } from "@/lib/domain/category-normalizer";
import { buildCriticRequest } from "@/lib/agents/outfit-critic";
import type { ProductRecordInput } from "@/lib/agents/common";
import {
  getAnthropicProvider,
  type AnthropicProvider,
} from "@/lib/anthropic/provider";
import { AnthropicCallError } from "@/lib/anthropic/structured";
import { SupabaseNotConfiguredError } from "@/lib/supabase/admin";
import {
  getAppSettings,
  isMissingMigrationError,
  listProducts,
  updateOutfit,
  type CollectionRow,
  type OutfitRow,
  type ProductRow,
} from "@/lib/supabase/repositories";
import { JobAlreadyRunningError } from "@/lib/jobs/runner";

/**
 * Shared server-only critic invocation and collection-pipeline helpers.
 *
 * The independent critic (Runway Jury) is invoked from two routes — the
 * critique route and the reviser route (which re-critiques each revision) — so
 * the invocation lives here once. This module also centralises the small
 * building blocks every collection-pipeline route needs (product-record
 * mapping, trend summarisation, candidate reconstruction, brief/brand context
 * loading, and error classification) so the route handlers stay thin.
 *
 * Grounding rules preserved here:
 * - the composer's narrative is NEVER passed to the critic (buildCriticRequest
 *   deliberately omits it);
 * - Claude supplies component scores + a verdict; computeWeightedScore (code)
 *   computes the final number;
 * - verdict → status mapping: approve → "approved", reject → "rejected",
 *   revise → "rejected" (the stored review keeps verdict "revise" so the
 *   reviser route can still find it).
 */

// ---------------------------------------------------------------------------
// Product-record mapping
// ---------------------------------------------------------------------------

/** Canonical normalised category for a product row (analysis wins, then type). */
export function productCategory(row: ProductRow): GarmentCategory {
  return normalizeCategory({
    productType: row.product_type,
    analysisCategory: row.analysis?.category ?? null,
  });
}

/** Convert a stored product row into the grounded record shape agents consume. */
export function toProductRecord(
  row: ProductRow,
  currency: string,
): ProductRecordInput {
  return {
    id: row.id,
    title: row.title,
    category: productCategory(row),
    sku: row.sku,
    price: row.price,
    currency,
    inventoryQuantity: row.inventory_quantity,
    available: row.inventory_quantity > 0,
    description: row.description,
    colors: row.analysis?.primaryColors ?? null,
    analysis: row.analysis,
  };
}

// ---------------------------------------------------------------------------
// Trend summarisation
// ---------------------------------------------------------------------------

/** Compact, grounded one-paragraph summary of a stored trend report (or ""). */
export function summarizeTrends(report: TrendReport | null): string {
  if (!report) return "";
  const signals = report.signals
    .slice(0, 3)
    .map((signal) => `${signal.name} (${signal.adoptionStage}): ${signal.summary}`)
    .join(" ");
  const mode =
    report.sourceMode === "live_web_search"
      ? "live web evidence"
      : report.sourceMode === "demo"
        ? "demonstration hypotheses"
        : "model-only hypotheses";
  return `${report.title} [${mode}]. ${signals}`.trim();
}

// ---------------------------------------------------------------------------
// Candidate reconstruction from a stored outfit row
// ---------------------------------------------------------------------------

const TEMPLATES = new Set([
  "top_bottom",
  "top_bottom_outerwear",
  "dress",
  "dress_outerwear",
]);

/** Deterministically infer a valid template from an outfit's categories. */
export function inferTemplate(
  categories: readonly GarmentCategory[],
): OutfitCandidate["template"] {
  const hasDress = categories.includes("dress");
  const hasOuterwear = categories.includes("outerwear");
  if (hasDress) return hasOuterwear ? "dress_outerwear" : "dress";
  return hasOuterwear ? "top_bottom_outerwear" : "top_bottom";
}

/**
 * Rebuild the deterministic {@link OutfitCandidate} from a stored outfit row so
 * the critic (which speaks candidate, not row) can evaluate it. The generation
 * JSONB carries candidateId/template/heuristics; anything missing is inferred
 * from the row's real product IDs and their categories.
 */
export function reconstructCandidate(
  outfit: OutfitRow,
  productsById: Map<string, ProductRow>,
): OutfitCandidate {
  const gen = (outfit.generation ?? {}) as Record<string, unknown>;

  const categories = outfit.product_ids
    .map((id) => productsById.get(id))
    .filter((row): row is ProductRow => Boolean(row))
    .map(productCategory);

  const rawTemplate = gen.template;
  const template =
    typeof rawTemplate === "string" && TEMPLATES.has(rawTemplate)
      ? (rawTemplate as OutfitCandidate["template"])
      : inferTemplate(categories);

  const rawScore = gen.heuristicScore;
  const heuristicScore =
    typeof rawScore === "number" && Number.isFinite(rawScore)
      ? Math.min(1, Math.max(0, rawScore))
      : typeof outfit.overall_score === "number"
        ? Math.min(1, Math.max(0, outfit.overall_score))
        : 0.5;

  const rawReasons = gen.heuristicReasons;
  const heuristicReasons = Array.isArray(rawReasons)
    ? rawReasons.filter((reason): reason is string => typeof reason === "string")
    : [];

  const rawAccessory = gen.accessoryProductId;
  const accessoryProductId =
    typeof rawAccessory === "string" && outfit.product_ids.includes(rawAccessory)
      ? rawAccessory
      : null;

  const rawCandidateId = gen.candidateId;
  const candidateId =
    typeof rawCandidateId === "string" && rawCandidateId.length > 0
      ? rawCandidateId
      : `outfit-${outfit.id}`;

  return outfitCandidateSchema.parse({
    candidateId,
    productIds: outfit.product_ids,
    template,
    accessoryProductId,
    heuristicScore,
    heuristicReasons,
  });
}

// ---------------------------------------------------------------------------
// Verdict → status
// ---------------------------------------------------------------------------

/**
 * Map a critic verdict to the stored outfit status. Both "revise" and "reject"
 * map to "rejected" (an outfit is only "approved" when the jury approves it);
 * the stored review keeps the original verdict so the reviser route can find
 * revise-worthy outfits.
 */
export function verdictToStatus(
  verdict: OutfitReview["verdict"],
): "approved" | "rejected" {
  return verdict === "approve" ? "approved" : "rejected";
}

// ---------------------------------------------------------------------------
// Critic invocation
// ---------------------------------------------------------------------------

export interface CritiqueOutfitParams {
  outfit: OutfitRow;
  brief: CollectionBrief;
  trendSummary: string;
  productsById: Map<string, ProductRow>;
  currency: string;
  provider: AnthropicProvider;
  maxTokens?: number;
}

export interface CritiqueOutfitResult {
  outfit: OutfitRow;
  review: StoredReview;
  verdict: OutfitReview["verdict"];
  overallScore: number;
  usage: Usage;
}

/**
 * Independently critique ONE outfit and persist the result.
 *
 * Builds the critic request (composer narrative excluded), calls the provider's
 * structured endpoint, computes the weighted overall score in code, stores the
 * review (with promptVersion + overallScore + reviewedAt) and maps the verdict
 * to the outfit's status. Returns the updated row and the stored review.
 *
 * Throws {@link AnthropicCallError} (provider failures) or RepositoryError
 * (persistence failures); callers classify these with {@link classifyPipelineError}.
 */
export async function critiqueOutfit(
  params: CritiqueOutfitParams,
): Promise<CritiqueOutfitResult> {
  const { outfit, brief, trendSummary, productsById, currency, provider } =
    params;

  const candidate = reconstructCandidate(outfit, productsById);
  const productRecords = outfit.product_ids
    .map((id) => productsById.get(id))
    .filter((row): row is ProductRow => Boolean(row))
    .map((row) => toProductRecord(row, currency));

  const request = buildCriticRequest({
    brief,
    trendSummary,
    candidate,
    productRecords,
  });

  const { data: review, usage } = await provider.structuredCall({
    schema: outfitReviewSchema,
    schemaName: request.schemaName,
    system: request.system,
    user: request.user,
    maxTokens: params.maxTokens ?? 2048,
    route: "collections.outfits.critique",
    entityId: outfit.id,
  });

  const overallScore = computeWeightedScore(review.scores);
  const stored: StoredReview = storedReviewSchema.parse({
    ...review,
    overallScore,
    reviewedAt: new Date().toISOString(),
    promptVersion: request.promptVersion,
  });

  const updated = await updateOutfit(outfit.id, {
    review: stored,
    overall_score: overallScore,
    status: verdictToStatus(review.verdict),
  });

  return {
    outfit: updated,
    review: stored,
    verdict: review.verdict,
    overallScore,
    usage,
  };
}

// ---------------------------------------------------------------------------
// Pipeline context
// ---------------------------------------------------------------------------

export interface PipelineContext {
  brief: CollectionBrief;
  brandProfile: BrandProfile;
  currency: string;
  products: ProductRow[];
  productsById: Map<string, ProductRow>;
  trendSummary: string;
  provider: AnthropicProvider;
}

/**
 * Load the shared context every collection-pipeline route needs from an
 * already-fetched collection row: the validated brief, a grounded brand
 * profile (from app_settings, or synthesised from the brief when settings are
 * absent so the app stays demonstrable), the catalog products, a trend summary
 * and the active Anthropic provider (mock or live).
 */
export async function loadPipelineContext(
  collection: CollectionRow,
): Promise<PipelineContext> {
  const appSettings = await getAppSettings();
  const currency = appSettings?.currency ?? "SGD";

  const brief = collectionBriefSchema.parse(collection.brief);

  const brandProfile: BrandProfile = appSettings
    ? brandProfileSchema.parse(appSettings.brand_profile)
    : brandProfileSchema.parse({
        audience: brief.audience,
        personality: [],
        colours: [],
        prohibitedStyles: brief.prohibitedStyles,
        climate: brief.climate,
        typicalPriceRange: { min: 0, max: 1000, currency },
        targetGrossMargin: brief.targetGrossMargin,
        defaultSeason: brief.season,
      });

  const products = await listProducts();
  const productsById = new Map(products.map((row) => [row.id, row] as const));

  return {
    brief,
    brandProfile,
    currency,
    products,
    productsById,
    trendSummary: summarizeTrends(collection.trend_report),
    provider: getAnthropicProvider(),
  };
}

// ---------------------------------------------------------------------------
// Per-run Claude call budgeting
// ---------------------------------------------------------------------------

/** The configured hard ceiling on Claude calls for a single route invocation. */
export function maxClaudeCallsPerRun(): number {
  return getEnv().MAX_CLAUDE_CALLS_PER_RUN;
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

export interface ClassifiedError {
  code: ApiErrorCode;
  message: string;
}

/**
 * Map a known pipeline error to an API error code + safe message, or null when
 * it is not a recognised category (the route re-throws it so
 * withApiErrorHandling turns it into a stack-trace-free INTERNAL_ERROR).
 *
 * - JobAlreadyRunningError            → JOB_RUNNING
 * - AnthropicCallError "not_configured" → PROVIDER_NOT_CONFIGURED
 * - AnthropicCallError "rate_limit"     → RATE_LIMITED
 * - AnthropicCallError (other)          → PROVIDER_ERROR
 * - SupabaseNotConfiguredError / missing migration → PROVIDER_NOT_CONFIGURED
 */
export function classifyPipelineError(error: unknown): ClassifiedError | null {
  if (error instanceof JobAlreadyRunningError) {
    return { code: "JOB_RUNNING", message: error.message };
  }
  if (error instanceof AnthropicCallError) {
    if (error.category === "not_configured") {
      return { code: "PROVIDER_NOT_CONFIGURED", message: error.message };
    }
    if (error.category === "rate_limit") {
      return { code: "RATE_LIMITED", message: error.message };
    }
    return { code: "PROVIDER_ERROR", message: error.message };
  }
  if (error instanceof SupabaseNotConfiguredError) {
    return { code: "PROVIDER_NOT_CONFIGURED", message: error.message };
  }
  if (isMissingMigrationError(error)) {
    return {
      code: "PROVIDER_NOT_CONFIGURED",
      message:
        "The database migration has not been run yet. Apply supabase/migrations/001_initial.sql, then retry.",
    };
  }
  return null;
}
