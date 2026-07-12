import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api";
import { requireSession } from "@/lib/auth/require-session";
import { revisionResultSchema } from "@/lib/domain/schemas";
import {
  buildReviserRequest,
  validateRevision,
  RevisionValidationError,
} from "@/lib/agents/outfit-reviser";
import {
  assertNoDuplicateIds,
  assertProductIdsExist,
  assertTemplateValid,
  OutfitValidationError,
} from "@/lib/domain/outfit-validation";
import { logActivity } from "@/lib/logging/activity";
import {
  classifyPipelineError,
  critiqueOutfit,
  inferTemplate,
  loadPipelineContext,
  maxClaudeCallsPerRun,
  productCategory,
  reconstructCandidate,
  toProductRecord,
} from "@/lib/analysis/critique-outfit";
import {
  getCollection,
  insertOutfit,
  listOutfitsByCollection,
  type OutfitRow,
  type ProductRow,
} from "@/lib/supabase/repositories";

/**
 * POST /api/collections/[id]/outfits/revise
 *
 * Revise rejected / revise-verdict outfits (or an explicit { outfitIds } set).
 * For each target the reviser may only introduce products from a closed
 * permitted set — analysed, in-stock products of the same categories already in
 * the outfit — and must change at least one product. The revision is validated
 * deterministically (no hallucinated / duplicated IDs, template still valid),
 * saved as a NEW "revised" outfit with `revision_of` pointing at the original,
 * then re-critiqued. The original keeps its rejected status.
 *
 * Exactly one automatic revision per outfit. Each revision costs two Claude
 * calls (reviser + re-critique); the run is budgeted against
 * MAX_CLAUDE_CALLS_PER_RUN. Touches Anthropic + Supabase → Node.js.
 */
export const runtime = "nodejs";

const bodySchema = z.object({
  outfitIds: z.array(z.uuid()).optional(),
});

const REVISABLE_VERDICTS = new Set(["revise", "reject"]);

interface RevisedItem {
  originalOutfitId: string;
  revisedOutfitId: string;
  verdict: string;
  overallScore: number;
}

interface SkippedItem {
  outfitId: string;
  reason: string;
}

interface ReviseResult {
  revised: RevisedItem[];
  skipped: SkippedItem[];
  capped: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiErrorHandling<ReviseResult>(async (requestId) => {
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
      return apiError("VALIDATION_ERROR", "outfitIds must be an array of UUIDs.", {
        requestId,
        details: parsed.error.flatten(),
      });
    }

    try {
      const collection = await getCollection(id);
      if (!collection) {
        return apiError("NOT_FOUND", "Collection not found.", { requestId });
      }

      const allOutfits = await listOutfitsByCollection(id);
      const alreadyRevised = new Set(
        allOutfits
          .map((outfit) => outfit.revision_of)
          .filter((value): value is string => Boolean(value)),
      );

      const isRevisable = (outfit: OutfitRow): boolean =>
        outfit.review !== null &&
        REVISABLE_VERDICTS.has(outfit.review.verdict) &&
        outfit.revision_of === null &&
        !alreadyRevised.has(outfit.id);

      let targets: OutfitRow[];
      const skipped: SkippedItem[] = [];
      if (parsed.data.outfitIds && parsed.data.outfitIds.length > 0) {
        const wanted = new Set(parsed.data.outfitIds);
        targets = [];
        for (const outfit of allOutfits) {
          if (!wanted.has(outfit.id)) continue;
          if (isRevisable(outfit)) {
            targets.push(outfit);
          } else {
            skipped.push({
              outfitId: outfit.id,
              reason:
                "Not eligible for revision (needs a revise/reject review and no existing revision).",
            });
          }
        }
      } else {
        targets = allOutfits.filter(isRevisable);
      }

      if (targets.length === 0) {
        return apiOk<ReviseResult>({ revised: [], skipped, capped: 0 }, requestId);
      }

      const context = await loadPipelineContext(collection);
      const { products, productsById, currency, brief, trendSummary, provider } =
        context;
      const knownProductIds = new Set(products.map((row) => row.id));

      // Each revision = one reviser call + one re-critique call.
      const maxRevisions = Math.floor(maxClaudeCallsPerRun() / 2);
      const toProcess = targets.slice(0, Math.max(0, maxRevisions));
      const capped = targets.length - toProcess.length;

      const revised: RevisedItem[] = [];

      for (const original of toProcess) {
        const review = original.review;
        if (!review) {
          skipped.push({
            outfitId: original.id,
            reason: "No stored review to revise against.",
          });
          continue;
        }

        const originalRows = original.product_ids
          .map((productId) => productsById.get(productId))
          .filter((row): row is ProductRow => Boolean(row));
        const outfitCategories = new Set(originalRows.map(productCategory));
        const firstCategory =
          originalRows.length > 0 ? productCategory(originalRows[0]) : null;

        // Permitted replacements: analysed, in-stock products of the same
        // categories, not already in the outfit. Ordered so a same-category
        // replacement for the first slot comes first (keeps templates valid).
        const permitted = products
          .filter(
            (row) =>
              !original.product_ids.includes(row.id) &&
              row.analysis_status === "complete" &&
              row.analysis !== null &&
              row.inventory_quantity > 0 &&
              outfitCategories.has(productCategory(row)),
          )
          .sort((a, b) => {
            const aFirst = productCategory(a) === firstCategory ? 0 : 1;
            const bFirst = productCategory(b) === firstCategory ? 0 : 1;
            return aFirst - bFirst || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
          })
          .map((row) => toProductRecord(row, currency));

        if (permitted.length === 0) {
          skipped.push({
            outfitId: original.id,
            reason:
              "No analysed, in-stock same-category products are available to swap in.",
          });
          continue;
        }

        const candidate = reconstructCandidate(original, productsById);

        const reviserRequest = buildReviserRequest({
          candidate,
          review,
          permittedReplacements: permitted,
        });

        const { data: revision } = await provider.structuredCall({
          schema: revisionResultSchema,
          schemaName: reviserRequest.schemaName,
          system: reviserRequest.system,
          user: reviserRequest.user,
          maxTokens: 2048,
          route: "collections.outfits.revise",
          entityId: original.id,
        });

        const newCategories = revision.productIds
          .map((productId) => productsById.get(productId))
          .filter((row): row is ProductRow => Boolean(row))
          .map(productCategory);

        // Deterministic validation of the model's output.
        try {
          validateRevision(
            revision,
            original.product_ids,
            permitted.map((record) => record.id),
          );
          assertProductIdsExist(revision.productIds, knownProductIds);
          assertNoDuplicateIds(revision.productIds);
          assertTemplateValid(newCategories);
        } catch (validationError) {
          if (
            validationError instanceof RevisionValidationError ||
            validationError instanceof OutfitValidationError
          ) {
            skipped.push({
              outfitId: original.id,
              reason: `Revision rejected: ${validationError.message}`,
            });
            continue;
          }
          throw validationError;
        }

        const created = await insertOutfit({
          collection_id: id,
          name: original.name ? `${original.name} (revised)` : "Revised look",
          product_ids: revision.productIds,
          occasion: original.occasion,
          status: "revised",
          revision_of: original.id,
          overall_score: null,
          generation: {
            candidateId: `revised-${original.id}`,
            template: inferTemplate(newCategories),
            accessoryProductId: null,
            heuristicScore:
              typeof original.overall_score === "number"
                ? original.overall_score
                : 0.5,
            heuristicReasons: [
              `Revision of outfit ${original.id} addressing: ${review.reasonCodes.join(", ") || "review issues"}.`,
            ],
            revision: {
              of: original.id,
              corrections: revision.corrections,
              summary: revision.summary,
            },
          },
        });

        // Re-run the independent critic on the revised outfit.
        const critique = await critiqueOutfit({
          outfit: created,
          brief,
          trendSummary,
          productsById,
          currency,
          provider,
        });

        revised.push({
          originalOutfitId: original.id,
          revisedOutfitId: created.id,
          verdict: critique.verdict,
          overallScore: critique.overallScore,
        });
      }

      const result: ReviseResult = { revised, skipped, capped };

      await logActivity({
        actor: "outfit-reviser",
        action: "collection.outfits.revise",
        entityType: "collection",
        entityId: id,
        provider: provider.isLive ? "anthropic" : "anthropic-mock",
        inputSummary: `Revise ${toProcess.length} outfit(s)`,
        outputSummary: `revised ${revised.length}, skipped ${skipped.length}${capped ? `, ${capped} left for next run` : ""}`,
      });

      return apiOk(result, requestId);
    } catch (error) {
      const classified = classifyPipelineError(error);
      if (classified) {
        await logActivity({
          actor: "outfit-reviser",
          action: "collection.outfits.revise",
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
