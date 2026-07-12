import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api";
import { requireSession } from "@/lib/auth/require-session";
import { newDesignSchema } from "@/lib/domain/schemas";
import { buildGapRequest } from "@/lib/agents/gap-designer";
import { computeCosting } from "@/lib/domain/costing";
import { logActivity } from "@/lib/logging/activity";
import { runIdempotentJob } from "@/lib/jobs/runner";
import {
  classifyPipelineError,
  loadPipelineContext,
  productCategory,
  toProductRecord,
} from "@/lib/analysis/critique-outfit";
import {
  getCollection,
  insertDesign,
  listDesignsByCollection,
  listOutfitsByCollection,
  type DesignRow,
} from "@/lib/supabase/repositories";

/**
 * POST /api/collections/[id]/gap
 *
 * Detect one assortment gap and draft a new product to fill it. Claude proposes
 * the design and a target retail price (within the brand's price architecture,
 * derived from real catalog prices); deterministic code — never Claude —
 * computes the costing model (maximum landed cost + detailed allowances). One
 * design per collection unless { force: true }.
 *
 * Touches Anthropic + Supabase → Node.js runtime.
 */
export const runtime = "nodejs";

const bodySchema = z.object({
  force: z.boolean().optional(),
});

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiErrorHandling<{ design: DesignRow }>(async (requestId) => {
    const session = await requireSession(request);
    if (!session.ok) {
      return apiError("UNAUTHORIZED", "A valid session is required.", {
        requestId,
      });
    }

    const { id } = await params;

    let raw: unknown = {};
    try {
      raw = await request.json();
    } catch {
      raw = {};
    }
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "force must be a boolean.", {
        requestId,
        details: parsed.error.flatten(),
      });
    }
    const force = parsed.data.force ?? false;

    try {
      const collection = await getCollection(id);
      if (!collection) {
        return apiError("NOT_FOUND", "Collection not found.", { requestId });
      }

      const existingDesigns = await listDesignsByCollection(id);
      if (existingDesigns.length > 0 && !force) {
        return apiError(
          "CONFLICT",
          "A design already exists for this collection. Pass { force: true } to propose another.",
          { requestId },
        );
      }

      const finalOutfits = await listOutfitsByCollection(id, {
        status: "final",
      });
      if (finalOutfits.length === 0) {
        return apiError(
          "STATE_INVALID",
          "Curate the collection first — the gap designer needs the final outfits to work against.",
          { requestId },
        );
      }

      const context = await loadPipelineContext(collection);
      const { brief, brandProfile, currency, products, productsById, provider } =
        context;

      // Products not used in any final outfit.
      const usedProductIds = new Set(
        finalOutfits.flatMap((outfit) => outfit.product_ids),
      );
      const unusedProducts = products
        .filter((row) => !usedProductIds.has(row.id))
        .map((row) => toProductRecord(row, currency));

      const categories = [
        ...new Set(products.map((row) => productCategory(row))),
      ];

      // Price architecture from real catalog prices (fallback to brand range).
      const prices = products.map((row) => row.price).filter((p) => p > 0);
      const priceMin =
        prices.length > 0
          ? Math.min(...prices)
          : brandProfile.typicalPriceRange.min;
      const priceMax =
        prices.length > 0
          ? Math.max(...prices)
          : brandProfile.typicalPriceRange.max;
      const priceMedian = median(prices);

      const { result, reused } = await runIdempotentJob<DesignRow>(
        {
          jobType: "collection.gap",
          entityType: "collection",
          entityId: id,
          idempotencyKey: `gap:${id}:${existingDesigns.length}`,
        },
        async () => {
          const gapRequest = buildGapRequest({
            brief,
            brandProfile,
            finalOutfits: finalOutfits.map((outfit) => ({
              id: outfit.id,
              name: outfit.name,
              occasion: outfit.occasion,
            })),
            unusedProducts,
            priceArchitecture: { min: priceMin, max: priceMax, currency },
            targetGrossMargin: brief.targetGrossMargin,
            categories,
          });

          const { data: design } = await provider.structuredCall({
            schema: newDesignSchema,
            schemaName: gapRequest.schemaName,
            system: gapRequest.system,
            user: gapRequest.user,
            maxTokens: 4096,
            route: "collections.gap",
            entityId: id,
          });

          // Costing is ALWAYS computed in code, never by Claude.
          const costing = computeCosting({
            targetRetailPrice: design.targetRetailPrice,
            targetGrossMargin: brief.targetGrossMargin,
            currency,
          });

          const created = await insertDesign({
            collection_id: id,
            name: design.name,
            status: "proposed",
            design_brief: design,
            costing,
          });

          await logActivity({
            actor: "gap-designer",
            action: "collection.gap",
            entityType: "design",
            entityId: created.id,
            provider: provider.isLive ? "anthropic" : "anthropic-mock",
            inputSummary: `Gap design for ${finalOutfits.length} final look(s); price ${currency} ${priceMin}-${priceMax} (median ${priceMedian})`,
            outputSummary: `Proposed "${design.name}" (${design.category}); max landed cost ${currency} ${costing.maximumLandedCost}`,
            rawMetadata: {
              category: design.category,
              targetRetailPrice: design.targetRetailPrice,
              maximumLandedCost: costing.maximumLandedCost,
            },
          });

          return created;
        },
      );

      // Reused (already-complete) run — return the most recent design.
      if (reused || result === null) {
        const designs = await listDesignsByCollection(id);
        const latest = designs[designs.length - 1] ?? null;
        if (!latest) {
          return apiError(
            "STATE_INVALID",
            "A previous gap job completed but no design was stored. Re-run after checking the activity log.",
            { requestId },
          );
        }
        return apiOk({ design: latest }, requestId);
      }

      return apiOk({ design: result }, requestId);
    } catch (error) {
      const classified = classifyPipelineError(error);
      if (classified) {
        await logActivity({
          actor: "gap-designer",
          action: "collection.gap",
          entityType: "collection",
          entityId: id,
          outputSummary: `error (${classified.code}): ${classified.message}`,
        });
        return apiError(classified.code, classified.message, { requestId });
      }
      throw error;
    }
  });
}
