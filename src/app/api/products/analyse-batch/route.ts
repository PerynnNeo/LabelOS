import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api";
import type { ApiErrorCode } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { requireSession } from "@/lib/auth/require-session";
import type { GarmentCategory } from "@/lib/domain/schemas";
import {
  analyseProduct,
  analyseProductErrorToApi,
} from "@/lib/analysis/analyse-product";

/**
 * POST /api/products/analyse-batch (spec sections 9, 27).
 *
 * Analyses several products by looping over {@link analyseProduct} ONE AT A
 * TIME (never in parallel — AI routes stay short and cheap). The number of
 * analyses is capped at MAX_CLAUDE_CALLS_PER_RUN; any products beyond the cap
 * are left unprocessed and the summary carries a LIMIT_EXCEEDED marker.
 *
 * The whole request succeeds (HTTP ok) even when individual products fail;
 * per-product outcomes are returned so the UI can show which ones need
 * attention.
 */
export const runtime = "nodejs";

const bodySchema = z.object({
  productIds: z.array(z.uuid()).min(1).max(200),
});

interface ProductOutcome {
  productId: string;
  ok: boolean;
  category?: GarmentCategory;
  error?: { code: ApiErrorCode; message: string };
}

interface BatchSummary {
  requested: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  limit: number;
  limitReached: boolean;
  limitCode?: "LIMIT_EXCEEDED";
  note?: string;
}

export async function POST(request: NextRequest) {
  return withApiErrorHandling<{ results: ProductOutcome[]; summary: BatchSummary }>(
    async (requestId) => {
      const session = await requireSession(request);
      if (!session.ok) {
        return apiError(
          "UNAUTHORIZED",
          "A valid session is required to analyse products.",
          { requestId },
        );
      }

      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        return apiError("VALIDATION_ERROR", "Request body must be JSON.", {
          requestId,
        });
      }

      const parsed = bodySchema.safeParse(raw);
      if (!parsed.success) {
        return apiError(
          "VALIDATION_ERROR",
          "productIds must be a non-empty array of product ids.",
          { requestId },
        );
      }

      // De-duplicate while preserving order so a repeated id can't burn the cap.
      const productIds = [...new Set(parsed.data.productIds)];
      const cap = getEnv().MAX_CLAUDE_CALLS_PER_RUN;

      const results: ProductOutcome[] = [];
      let processed = 0;
      let limitReached = false;

      for (const productId of productIds) {
        if (processed >= cap) {
          limitReached = true;
          break;
        }
        processed += 1;
        try {
          const { analysis } = await analyseProduct(productId);
          results.push({ productId, ok: true, category: analysis.category });
        } catch (error) {
          const mapped = analyseProductErrorToApi(error);
          results.push({
            productId,
            ok: false,
            error: {
              code: mapped?.code ?? "INTERNAL_ERROR",
              message:
                mapped?.message ??
                (error instanceof Error ? error.message : "Analysis failed."),
            },
          });
        }
      }

      const summary: BatchSummary = {
        requested: productIds.length,
        processed,
        succeeded: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        skipped: productIds.length - processed,
        limit: cap,
        limitReached,
      };
      if (limitReached) {
        summary.limitCode = "LIMIT_EXCEEDED";
        summary.note = `Stopped after the per-run limit of ${cap} analyses (MAX_CLAUDE_CALLS_PER_RUN). ${summary.skipped} product(s) were not processed — run the batch again to continue.`;
      }

      return apiOk<{ results: ProductOutcome[]; summary: BatchSummary }>(
        { results, summary },
        requestId,
      );
    },
  );
}
