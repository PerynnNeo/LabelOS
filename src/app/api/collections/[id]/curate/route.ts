import type { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api";
import { requireSession } from "@/lib/auth/require-session";
import type { CurationSummary } from "@/lib/domain/schemas";
import {
  curateFinalOutfits,
  type CurationOutfit,
} from "@/lib/domain/curation";
import {
  buildStoryRequest,
  collectionStorySchema,
} from "@/lib/agents/collection-curator";
import { logActivity } from "@/lib/logging/activity";
import { runIdempotentJob } from "@/lib/jobs/runner";
import {
  classifyPipelineError,
  loadPipelineContext,
} from "@/lib/analysis/critique-outfit";
import {
  getCollection,
  listOutfitsByCollection,
  updateCollection,
  updateOutfit,
  type OutfitRow,
} from "@/lib/supabase/repositories";

/**
 * POST /api/collections/[id]/curate
 *
 * Deterministically select the final capsule from the approved/revised outfits
 * (curateFinalOutfits — greedy by weighted score, hero-aware, diversity- and
 * occasion-constrained), mark the selected outfits "final", store the curation
 * summary on the collection and move it to status "curated".
 *
 * The optional Claude "collection story" is best-effort: it never blocks
 * curation and any failure is swallowed. Idempotent under `curate:{id}`.
 * Touches Anthropic + Supabase → Node.js.
 */
export const runtime = "nodejs";

const CURATION_ELIGIBLE = new Set(["approved", "revised"]);

type CurationResult = CurationSummary & { story?: string; title?: string };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiErrorHandling<CurationResult>(async (requestId) => {
    const session = await requireSession(request);
    if (!session.ok) {
      return apiError("UNAUTHORIZED", "A valid session is required.", {
        requestId,
      });
    }

    const { id } = await params;

    try {
      const collection = await getCollection(id);
      if (!collection) {
        return apiError("NOT_FOUND", "Collection not found.", { requestId });
      }

      const allOutfits = await listOutfitsByCollection(id);
      const eligible = allOutfits.filter((outfit) =>
        CURATION_ELIGIBLE.has(outfit.status),
      );
      if (eligible.length === 0) {
        return apiError(
          "STATE_INVALID",
          "No approved or revised outfits to curate. Run critique (and revision) first.",
          { requestId },
        );
      }

      const context = await loadPipelineContext(collection);
      const { brief, provider } = context;

      const { result, reused } = await runIdempotentJob<CurationResult>(
        {
          jobType: "collection.curate",
          entityType: "collection",
          entityId: id,
          idempotencyKey: `curate:${id}`,
        },
        async () => {
          const curationInput: CurationOutfit[] = eligible.map((outfit) => ({
            id: outfit.id,
            productIds: outfit.product_ids,
            occasion: outfit.occasion,
            overallScore:
              typeof outfit.overall_score === "number"
                ? outfit.overall_score
                : 0,
            status: outfit.status,
          }));

          const summary = curateFinalOutfits({
            outfits: curationInput,
            heroProductIds: brief.heroProductIds,
          });

          // Mark the selected outfits final.
          const selectedById = new Map(
            allOutfits.map((outfit) => [outfit.id, outfit] as const),
          );
          const selectedOutfits: OutfitRow[] = [];
          for (const outfitId of summary.selectedOutfitIds) {
            const outfit = selectedById.get(outfitId);
            if (outfit) selectedOutfits.push(outfit);
            await updateOutfit(outfitId, { status: "final" });
          }

          // Best-effort editorial story — never blocks curation.
          const stored: CurationResult = { ...summary };
          try {
            const storyRequest = buildStoryRequest({
              brief,
              finalOutfits: selectedOutfits.map((outfit) => ({
                id: outfit.id,
                name: outfit.name,
                occasion: outfit.occasion,
              })),
              labels: summary.labels,
            });
            const { data: story } = await provider.structuredCall({
              schema: collectionStorySchema,
              schemaName: storyRequest.schemaName,
              system: storyRequest.system,
              user: storyRequest.user,
              maxTokens: 1024,
              route: "collections.curate.story",
              entityId: id,
            });
            stored.story = story.story;
            stored.title = story.title;
          } catch (storyError) {
            console.warn(
              `[collections.curate] story generation failed for ${id}; continuing without it`,
              storyError,
            );
          }

          await updateCollection(id, {
            curation_summary: stored as unknown as CurationSummary,
            status: "curated",
          });

          await logActivity({
            actor: "collection-curator",
            action: "collection.curate",
            entityType: "collection",
            entityId: id,
            provider: provider.isLive ? "anthropic" : "anthropic-mock",
            inputSummary: `Curate from ${eligible.length} eligible outfit(s)`,
            outputSummary: `${summary.selectedOutfitIds.length} final look(s); ${summary.unmetConstraints.length} unmet constraint(s)${stored.story ? "; story generated" : ""}`,
            rawMetadata: {
              selected: summary.selectedOutfitIds.length,
              occasions: summary.occasionsCovered,
            },
          });

          return stored;
        },
      );

      // Reused (already-complete) run — return the stored curation summary.
      if (reused || result === null) {
        const refreshed = await getCollection(id);
        const stored = refreshed?.curation_summary ?? null;
        if (!stored) {
          return apiError(
            "STATE_INVALID",
            "A previous curation job completed but no summary was stored. Re-run after checking the activity log.",
            { requestId },
          );
        }
        return apiOk(stored as CurationResult, requestId);
      }

      return apiOk(result, requestId);
    } catch (error) {
      const classified = classifyPipelineError(error);
      if (classified) {
        await logActivity({
          actor: "collection-curator",
          action: "collection.curate",
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
