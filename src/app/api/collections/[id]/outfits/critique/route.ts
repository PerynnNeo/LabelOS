import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api";
import { requireSession } from "@/lib/auth/require-session";
import { logActivity } from "@/lib/logging/activity";
import {
  classifyPipelineError,
  critiqueOutfit,
  loadPipelineContext,
  maxClaudeCallsPerRun,
} from "@/lib/analysis/critique-outfit";
import {
  getCollection,
  listOutfitsByCollection,
  type OutfitRow,
} from "@/lib/supabase/repositories";

/**
 * POST /api/collections/[id]/outfits/critique
 *
 * Run the independent critic (Runway Jury) over the collection's candidate
 * outfits (or an explicit { outfitIds } subset). Each critique is one Claude
 * call, capped at MAX_CLAUDE_CALLS_PER_RUN per run; leftovers are reported as
 * `capped` and can be critiqued on a follow-up call.
 *
 * The critic's verdict maps the outfit to approved/rejected in code; the stored
 * review keeps the raw verdict so the reviser route can still find revisable
 * outfits. Touches Anthropic + Supabase → Node.js.
 */
export const runtime = "nodejs";

const bodySchema = z.object({
  outfitIds: z.array(z.uuid()).optional(),
});

interface CritiqueResult {
  processed: number;
  capped: number;
  counts: { approve: number; revise: number; reject: number };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiErrorHandling<CritiqueResult>(async (requestId) => {
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

      let targets: OutfitRow[];
      if (parsed.data.outfitIds && parsed.data.outfitIds.length > 0) {
        const wanted = new Set(parsed.data.outfitIds);
        targets = allOutfits.filter((outfit) => wanted.has(outfit.id));
      } else {
        targets = allOutfits.filter((outfit) => outfit.status === "candidate");
      }

      if (targets.length === 0) {
        return apiError(
          "STATE_INVALID",
          "No candidate outfits to critique. Generate outfits first, or pass valid outfitIds for this collection.",
          { requestId },
        );
      }

      const context = await loadPipelineContext(collection);
      const maxCalls = maxClaudeCallsPerRun();
      const toProcess = targets.slice(0, maxCalls);

      const counts = { approve: 0, revise: 0, reject: 0 };
      for (const outfit of toProcess) {
        const { verdict } = await critiqueOutfit({
          outfit,
          brief: context.brief,
          trendSummary: context.trendSummary,
          productsById: context.productsById,
          currency: context.currency,
          provider: context.provider,
        });
        counts[verdict] += 1;
      }

      const result: CritiqueResult = {
        processed: toProcess.length,
        capped: targets.length - toProcess.length,
        counts,
      };

      await logActivity({
        actor: "outfit-critic",
        action: "collection.outfits.critique",
        entityType: "collection",
        entityId: id,
        provider: context.provider.isLive ? "anthropic" : "anthropic-mock",
        inputSummary: `Critique ${toProcess.length} outfit(s)`,
        outputSummary: `approve ${counts.approve}, revise ${counts.revise}, reject ${counts.reject}${result.capped ? ` (${result.capped} left for next run)` : ""}`,
      });

      return apiOk(result, requestId);
    } catch (error) {
      const classified = classifyPipelineError(error);
      if (classified) {
        await logActivity({
          actor: "outfit-critic",
          action: "collection.outfits.critique",
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
