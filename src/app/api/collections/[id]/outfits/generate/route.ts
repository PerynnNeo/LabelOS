import type { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api";
import { requireSession } from "@/lib/auth/require-session";
import {
  composerRankingSchema,
  type ComposerRanking,
} from "@/lib/domain/schemas";
import {
  buildComposerRequest,
  validateComposerOutput,
} from "@/lib/agents/outfit-composer";
import {
  DEFAULT_MAX_CANDIDATES,
  generateCandidates,
  type CandidateProduct,
} from "@/lib/domain/outfit-generator";
import { logActivity } from "@/lib/logging/activity";
import { runIdempotentJob } from "@/lib/jobs/runner";
import {
  classifyPipelineError,
  loadPipelineContext,
  maxClaudeCallsPerRun,
  productCategory,
  toProductRecord,
} from "@/lib/analysis/critique-outfit";
import {
  getCollection,
  insertOutfits,
  listOutfitsByCollection,
  type OutfitInsert,
  type ProductRow,
} from "@/lib/supabase/repositories";

/**
 * POST /api/collections/[id]/outfits/generate
 *
 * Deterministic-first outfit generation:
 *  1. build up to 60 candidate combinations from real, analysed catalog product
 *     IDs (generateCandidates — Claude never invents combinations);
 *  2. send them to the Claude composer in batches of at most ten to rank and
 *     describe (buildComposerRequest);
 *  3. validate every returned candidateId against the batch (dropping any the
 *     model invented), then persist one "candidate" outfit row per composed
 *     candidate, carrying the heuristic + composer context in `generation`.
 *
 * Respects MAX_CLAUDE_CALLS_PER_RUN (each batch is one Claude call). Idempotent
 * under `outfits-generate:{collectionId}`. Touches Anthropic + Supabase → Node.
 */
export const runtime = "nodejs";

// Smaller batches keep each structured composer response well under the token
// ceiling (10 rich rankings could overflow 4096 and truncate). We also cap how
// many candidates go to Claude — they are pre-sorted by the deterministic
// heuristic, so the strongest CANDIDATE_LIMIT are more than enough to curate
// six final looks, and it keeps the whole run inside a normal function timeout.
const BATCH_SIZE = 6;
const CANDIDATE_LIMIT = 24;
const COMPOSER_MAX_TOKENS = 8192;

interface GenerateResult {
  created: number;
  dropped: number;
  batches: number;
  failedBatches: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiErrorHandling<GenerateResult>(async (requestId) => {
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

      const context = await loadPipelineContext(collection);
      const { brief, currency, products, productsById, trendSummary, provider } =
        context;

      const candidateProducts: CandidateProduct[] = products.map((row) => ({
        id: row.id,
        title: row.title,
        category: productCategory(row),
        available: row.inventory_quantity > 0,
        analysis: row.analysis,
        inventoryQuantity: row.inventory_quantity,
        price: row.price,
      }));

      const candidates = generateCandidates({
        products: candidateProducts,
        brief,
        maxCandidates: DEFAULT_MAX_CANDIDATES,
      });

      if (candidates.length === 0) {
        return apiOk<GenerateResult>(
          { created: 0, dropped: 0, batches: 0, failedBatches: 0 },
          requestId,
        );
      }

      const { result, reused } = await runIdempotentJob<GenerateResult>(
        {
          jobType: "collection.outfits.generate",
          entityType: "collection",
          entityId: id,
          idempotencyKey: `outfits-generate:${id}`,
        },
        async () => {
          const maxCalls = maxClaudeCallsPerRun();
          const limit = Math.min(candidates.length, CANDIDATE_LIMIT);
          const maxBatches = Math.min(Math.ceil(limit / BATCH_SIZE), maxCalls);
          const processed = candidates.slice(0, maxBatches * BATCH_SIZE);

          const rankingById = new Map<string, ComposerRanking["rankings"][number]>();
          let batches = 0;
          let failedBatches = 0;
          let lastBatchError: unknown = null;

          for (let i = 0; i < processed.length; i += BATCH_SIZE) {
            const batch = processed.slice(i, i + BATCH_SIZE);

            // Only the products referenced by this batch, deduplicated.
            const referencedIds = new Set(
              batch.flatMap((candidate) => candidate.productIds),
            );
            const productRecords = [...referencedIds]
              .map((productId) => productsById.get(productId))
              .filter((row): row is ProductRow => Boolean(row))
              .map((row) => toProductRecord(row, currency));

            const composerRequest = buildComposerRequest({
              brief,
              trendSummary,
              candidates: batch,
              productRecords,
            });

            // One flaky batch (token cut-off, rate limit, invalid output) must
            // not sink the whole run — log it and keep the batches that worked.
            try {
              const { data } = await provider.structuredCall({
                schema: composerRankingSchema,
                schemaName: composerRequest.schemaName,
                system: composerRequest.system,
                user: composerRequest.user,
                maxTokens: COMPOSER_MAX_TOKENS,
                route: "collections.outfits.generate",
                entityId: id,
              });

              const validated = validateComposerOutput(
                data,
                batch.map((candidate) => candidate.candidateId),
              );
              for (const ranking of validated.rankings) {
                rankingById.set(ranking.candidateId, ranking);
              }
              batches += 1;
            } catch (batchError) {
              failedBatches += 1;
              lastBatchError = batchError;
              console.error(
                `[outfits.generate] composer batch ${i / BATCH_SIZE + 1} failed`,
                batchError instanceof Error ? batchError.message : batchError,
              );
            }
          }

          // Every composer batch failed — surface the underlying provider error
          // (classifyPipelineError maps AnthropicCallError to a friendly code)
          // instead of silently returning an empty collection.
          if (batches === 0 && failedBatches > 0 && lastBatchError) {
            throw lastBatchError;
          }

          const inserts: OutfitInsert[] = [];
          for (const candidate of processed) {
            const ranking = rankingById.get(candidate.candidateId);
            if (!ranking) continue; // composer did not (validly) rank it — drop
            inserts.push({
              collection_id: id,
              name: ranking.title.trim() || "Untitled look",
              product_ids: candidate.productIds,
              occasion: ranking.occasion.trim(),
              status: "candidate",
              overall_score: null,
              generation: {
                candidateId: candidate.candidateId,
                template: candidate.template,
                accessoryProductId: candidate.accessoryProductId,
                heuristicScore: candidate.heuristicScore,
                heuristicReasons: candidate.heuristicReasons,
                composer: {
                  title: ranking.title,
                  occasion: ranking.occasion,
                  description: ranking.description,
                  trendConnection: ranking.trendConnection,
                  commercialReason: ranking.commercialReason,
                  rank: ranking.rank,
                },
              },
            });
          }

          const created = await insertOutfits(inserts);
          const summary: GenerateResult = {
            created: created.length,
            dropped: processed.length - created.length,
            batches,
            failedBatches,
          };

          await logActivity({
            actor: "outfit-composer",
            action: "collection.outfits.generate",
            entityType: "collection",
            entityId: id,
            provider: provider.isLive ? "anthropic" : "anthropic-mock",
            inputSummary: `Generate outfits from ${candidateProducts.length} product(s), ${candidates.length} candidate(s)`,
            outputSummary: `created ${summary.created}, dropped ${summary.dropped}, ${summary.batches} composer batch(es)`,
            rawMetadata: {
              candidateCount: candidates.length,
              processed: processed.length,
            },
          });

          return summary;
        },
      );

      // Reused (already-complete) run — report the existing candidate count.
      if (reused || result === null) {
        const existing = await listOutfitsByCollection(id, {
          status: "candidate",
        });
        return apiOk<GenerateResult>(
          { created: existing.length, dropped: 0, batches: 0, failedBatches: 0 },
          requestId,
        );
      }

      return apiOk(result, requestId);
    } catch (error) {
      const classified = classifyPipelineError(error);
      if (classified) {
        await logActivity({
          actor: "outfit-composer",
          action: "collection.outfits.generate",
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
