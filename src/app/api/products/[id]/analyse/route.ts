import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api";
import { requireSession } from "@/lib/auth/require-session";
import type { GarmentAnalysis, Usage } from "@/lib/domain/schemas";
import { getProduct } from "@/lib/supabase/repositories";
import { runIdempotentJob } from "@/lib/jobs/runner";
import {
  analyseProduct,
  analyseProductErrorToApi,
} from "@/lib/analysis/analyse-product";

/**
 * POST /api/products/[id]/analyse (spec sections 8, 9, 24, 27).
 *
 * Runs one garment analysis through the shared {@link analyseProduct} routine,
 * wrapped in an idempotent job keyed `analyse:{id}`:
 *  - a completed job is reused (the stored analysis is returned, no Claude call);
 *  - an in-flight job is rejected with JOB_RUNNING;
 *  - a previously failed job can be retried under the same key.
 *
 * Runs on the Node.js runtime (Anthropic + Supabase storage + sharp-free image
 * handling).
 */
export const runtime = "nodejs";

interface AnalyseResponse {
  analysis: GarmentAnalysis;
  usage: Usage | null;
  reused: boolean;
  jobId: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiErrorHandling<AnalyseResponse>(async (requestId) => {
    const session = await requireSession(request);
    if (!session.ok) {
      return apiError(
        "UNAUTHORIZED",
        "A valid session is required to analyse a product.",
        { requestId },
      );
    }

    const { id } = await params;
    if (!z.uuid().safeParse(id).success) {
      return apiError("VALIDATION_ERROR", "Invalid product id.", { requestId });
    }

    try {
      const run = await runIdempotentJob(
        {
          jobType: "product.analyse",
          entityType: "product",
          entityId: id,
          idempotencyKey: `analyse:${id}`,
        },
        () => analyseProduct(id),
      );

      if (run.reused || run.result === null) {
        // A previously-completed job — return the stored analysis, no new call.
        const product = await getProduct(id);
        if (!product?.analysis) {
          return apiError(
            "STATE_INVALID",
            "This product's analysis job is marked complete but no analysis is stored. Re-upload the image and try again.",
            { requestId },
          );
        }
        return apiOk<AnalyseResponse>(
          { analysis: product.analysis, usage: null, reused: true, jobId: run.job.id },
          requestId,
        );
      }

      return apiOk<AnalyseResponse>(
        {
          analysis: run.result.analysis,
          usage: run.result.usage,
          reused: false,
          jobId: run.job.id,
        },
        requestId,
      );
    } catch (error) {
      const mapped = analyseProductErrorToApi(error);
      if (mapped) {
        return apiError(mapped.code, mapped.message, { requestId });
      }
      throw error;
    }
  });
}
