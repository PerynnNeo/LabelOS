import type { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api";
import { requireSession } from "@/lib/auth/require-session";
import type { TrendReport } from "@/lib/domain/schemas";
import { logActivity } from "@/lib/logging/activity";
import { runIdempotentJob } from "@/lib/jobs/runner";
import {
  classifyPipelineError,
  loadPipelineContext,
} from "@/lib/analysis/critique-outfit";
import {
  getCollection,
  updateCollection,
} from "@/lib/supabase/repositories";

/**
 * POST /api/collections/[id]/trends
 *
 * Run trend research for the collection's brief against the brand profile and
 * store the resulting report on the collection. Uses the Anthropic provider,
 * which runs the live two-call web-search path when ENABLE_CLAUDE_WEB_SEARCH is
 * on and a clearly-labelled model-only / demo fallback otherwise.
 *
 * Idempotent under the job key `trends:{collectionId}` — a completed run is a
 * no-op that returns the stored report. Touches Anthropic + Supabase → Node.js.
 */
export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiErrorHandling<{ report: TrendReport }>(async (requestId) => {
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

      const { brief, brandProfile, provider } =
        await loadPipelineContext(collection);

      const { result, reused } = await runIdempotentJob<TrendReport>(
        {
          jobType: "collection.trends",
          entityType: "collection",
          entityId: id,
          idempotencyKey: `trends:${id}`,
        },
        async () => {
          const { report, usage } = await provider.trendResearch({
            brief,
            brandProfile,
          });
          await updateCollection(id, { trend_report: report });
          await logActivity({
            actor: "trend-scout",
            action: "collection.trends",
            entityType: "collection",
            entityId: id,
            provider: provider.isLive ? "anthropic" : "anthropic-mock",
            usage,
            inputSummary: `Trend research for ${brief.market} · ${brief.season}`,
            outputSummary: `${report.signals.length} signal(s), sourceMode "${report.sourceMode}", ${usage.webSearchRequests} web search(es)`,
            rawMetadata: {
              sourceMode: report.sourceMode,
              signalCount: report.signals.length,
            },
          });
          return report;
        },
      );

      // Reused (already-complete) run — return the stored report.
      if (reused || result === null) {
        const refreshed = await getCollection(id);
        const stored = refreshed?.trend_report ?? null;
        if (!stored) {
          return apiError(
            "STATE_INVALID",
            "A previous trend job completed but no report was stored. Re-run after checking the activity log.",
            { requestId },
          );
        }
        return apiOk({ report: stored }, requestId);
      }

      return apiOk({ report: result }, requestId);
    } catch (error) {
      const classified = classifyPipelineError(error);
      if (classified) {
        await logActivity({
          actor: "trend-scout",
          action: "collection.trends",
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
