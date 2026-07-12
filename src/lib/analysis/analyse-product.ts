import "server-only";
import type { ApiErrorCode } from "@/lib/api";
import { getEnv } from "@/lib/env";
import type { GarmentAnalysis, Usage } from "@/lib/domain/schemas";
import {
  getProduct,
  updateProduct,
  type ProductRow,
} from "@/lib/supabase/repositories";
import {
  downloadPrivateImage,
  StorageOperationError,
} from "@/lib/supabase/storage";
import { ImageValidationError, toImageBlock } from "@/lib/anthropic/vision";
import {
  AnthropicCallError,
  type AnthropicCallErrorCategory,
} from "@/lib/anthropic/structured";
import { getAnthropicProvider } from "@/lib/anthropic/provider";
import {
  analysisSchema,
  buildGarmentAnalysisRequest,
} from "@/lib/agents/garment-analyst";
import { logActivity } from "@/lib/logging/activity";
import { JobAlreadyRunningError } from "@/lib/jobs/runner";

/**
 * Shared garment-analysis routine (spec sections 8, 9, 27).
 *
 * Both the single-product analyse route (POST /api/products/[id]/analyse) and
 * the batch route (POST /api/products/analyse-batch) call this one function so
 * the analysis behaviour — grounding, image validation, provider selection,
 * status transitions, and logging — is identical everywhere.
 *
 * Flow:
 *  1. load the product (NOT_FOUND when absent);
 *  2. guard against a concurrent run (product already `running` → JOB_RUNNING);
 *  3. require an uploaded image (missing image_path → VALIDATION_ERROR);
 *  4. mark the product `running`;
 *  5. download the private image, validate it, and turn it into an image block;
 *  6. build the Garment Librarian request and call the provider's structuredCall
 *     (real Claude when configured and not in DEMO_MODE, otherwise the mock);
 *  7. store the analysis and mark the product `complete`;
 *  8. on any failure mark the product `failed`, log, and rethrow.
 *
 * The provider re-validates its own output against the Zod schema; nothing here
 * ever logs the API key or the raw image bytes.
 */

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export type AnalyseProductErrorCode =
  | "not_found"
  | "already_running"
  | "missing_image";

/** Precondition failure raised by {@link analyseProduct} before any Claude call. */
export class AnalyseProductError extends Error {
  readonly code: AnalyseProductErrorCode;

  constructor(code: AnalyseProductErrorCode, message: string) {
    super(message);
    this.name = "AnalyseProductError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface AnalyseProductResult {
  product: ProductRow;
  analysis: GarmentAnalysis;
  usage: Usage;
  /** "anthropic" for the live API, "anthropic-mock" for the deterministic mock. */
  provider: "anthropic" | "anthropic-mock";
  /** Configured model id when live, "mock" otherwise. */
  model: string;
}

// ---------------------------------------------------------------------------
// Core routine
// ---------------------------------------------------------------------------

export async function analyseProduct(
  productId: string,
): Promise<AnalyseProductResult> {
  const product = await getProduct(productId);
  if (!product) {
    throw new AnalyseProductError(
      "not_found",
      `No product found with id ${productId}.`,
    );
  }
  if (product.analysis_status === "running") {
    throw new AnalyseProductError(
      "already_running",
      `Analysis for "${product.title}" is already running. Wait for it to finish before retrying.`,
    );
  }
  if (!product.image_path) {
    throw new AnalyseProductError(
      "missing_image",
      `Product "${product.title}" has no uploaded image to analyse. Upload a garment photo first.`,
    );
  }

  const provider = getAnthropicProvider();
  const providerName: "anthropic" | "anthropic-mock" = provider.isLive
    ? "anthropic"
    : "anthropic-mock";
  const model = provider.isLive ? getEnv().ANTHROPIC_MODEL : "mock";

  await updateProduct(productId, { analysis_status: "running" });

  try {
    const { bytes, contentType } = await downloadPrivateImage(product.image_path);
    const imageBlock = toImageBlock(bytes, contentType);

    const request = buildGarmentAnalysisRequest({
      product: {
        id: product.id,
        title: product.title,
        productType: product.product_type,
        sku: product.sku,
        price: product.price,
        inventoryQuantity: product.inventory_quantity,
        description: product.description,
      },
      imageBlock,
    });

    const { data, usage } = await provider.structuredCall({
      schema: analysisSchema,
      schemaName: request.schemaName,
      system: request.system,
      user: request.user,
      route: "products.analyse",
      entityId: productId,
    });

    // Truthfulness guard (spec §1.6, §11.2): a material read from the image is a
    // visual inference, never verified fibre composition. The MVP does not yet
    // capture merchant/supplier fibre documentation, so force the observation to
    // unverified regardless of what the model returned — the UI must never
    // present a visual guess as fact.
    const analysis: GarmentAnalysis = {
      ...data,
      materialObservation: {
        ...data.materialObservation,
        verified: false,
        caveat:
          data.materialObservation.caveat?.trim() ||
          "Visual inference from the product image — confirm fibre against supplier or merchant documentation before publishing.",
      },
    };

    const updated = await updateProduct(productId, {
      analysis,
      analysis_status: "complete",
    });

    await logActivity({
      actor: "garment-analyst",
      action: "products.analyse",
      entityType: "product",
      entityId: productId,
      provider: providerName,
      model,
      usage,
      inputSummary: `Analyse garment "${product.title}"`,
      outputSummary: `complete — category ${analysis.category}, confidence ${analysis.confidence.toFixed(2)}`,
      rawMetadata: {
        status: "success",
        promptVersion: request.promptVersion,
        live: provider.isLive,
      },
    });

    return { product: updated, analysis, usage, provider: providerName, model };
  } catch (error) {
    try {
      await updateProduct(productId, { analysis_status: "failed" });
    } catch (updateError) {
      console.error(
        `[analyse] failed to mark product ${productId} as failed`,
        updateError,
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    await logActivity({
      actor: "garment-analyst",
      action: "products.analyse",
      entityType: "product",
      entityId: productId,
      provider: providerName,
      model,
      inputSummary: `Analyse garment "${product.title}"`,
      outputSummary: `failed — ${message}`,
      rawMetadata: { status: "error", live: provider.isLive },
    });

    throw error;
  }
}

// ---------------------------------------------------------------------------
// Error mapping — shared by the analyse and batch routes
// ---------------------------------------------------------------------------

function anthropicCategoryToApiCode(
  category: AnthropicCallErrorCategory,
): ApiErrorCode {
  switch (category) {
    case "not_configured":
      return "PROVIDER_NOT_CONFIGURED";
    case "rate_limit":
    case "overloaded":
      return "RATE_LIMITED";
    default:
      // auth, refusal, max_tokens, invalid_output, network, unknown
      return "PROVIDER_ERROR";
  }
}

export interface MappedApiError {
  code: ApiErrorCode;
  message: string;
}

/**
 * Translate an error thrown by {@link analyseProduct} (or the surrounding job
 * runner) into an API envelope error. Returns null for unrecognised errors so
 * the caller can fall through to a generic INTERNAL_ERROR without leaking a
 * stack trace.
 */
export function analyseProductErrorToApi(error: unknown): MappedApiError | null {
  if (error instanceof AnalyseProductError) {
    switch (error.code) {
      case "not_found":
        return { code: "NOT_FOUND", message: error.message };
      case "already_running":
        return { code: "JOB_RUNNING", message: error.message };
      case "missing_image":
        return { code: "VALIDATION_ERROR", message: error.message };
    }
  }
  if (error instanceof JobAlreadyRunningError) {
    return { code: "JOB_RUNNING", message: error.message };
  }
  if (error instanceof ImageValidationError) {
    return { code: "VALIDATION_ERROR", message: `${error.message} ${error.guidance}` };
  }
  if (error instanceof AnthropicCallError) {
    return {
      code: anthropicCategoryToApiCode(error.category),
      message: error.message,
    };
  }
  if (error instanceof StorageOperationError) {
    return { code: "VALIDATION_ERROR", message: error.message };
  }
  return null;
}
