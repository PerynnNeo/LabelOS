import { isSetupError } from "@/app/app/_lib/server";
import {
  listRecentActivity,
  type ActivityLogRow,
} from "@/lib/supabase/repositories";
import { PageHeader, SetupCard } from "@/components/lo";
import {
  ActivityTimeline,
  type ActivityRowLite,
} from "./_components/activity-timeline";

/**
 * Activity Log (spec 23): a read-only, developer-facing timeline of every agent
 * and human action — actor, summary, token/usage line and running/error state.
 * A Supabase/setup error degrades to a friendly card rather than a crash.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function numberOr(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toLite(row: ActivityLogRow): ActivityRowLite {
  const usage = row.usage;
  const rawStatus = row.raw_metadata?.status;
  const status = typeof rawStatus === "string" ? rawStatus : null;
  return {
    id: row.id,
    actor: row.actor,
    action: row.action,
    inputSummary: row.input_summary,
    outputSummary: row.output_summary,
    provider: row.provider,
    model: row.model,
    usage: {
      inputTokens: numberOr(usage?.inputTokens),
      outputTokens: numberOr(usage?.outputTokens),
      webSearchRequests: numberOr(usage?.webSearchRequests),
      durationMs: numberOr(usage?.durationMs),
    },
    status,
    createdAt: row.created_at,
  };
}

async function loadActivity(): Promise<{
  configured: boolean;
  entries: ActivityRowLite[];
}> {
  try {
    const rows = await listRecentActivity(40);
    return { configured: true, entries: rows.map(toLite) };
  } catch (error) {
    if (isSetupError(error)) {
      return { configured: false, entries: [] };
    }
    throw error;
  }
}

export default async function ActivityPage() {
  const data = await loadActivity();

  return (
    <div>
      <PageHeader
        title="Activity Log"
        subtitle="Every agent run, with developer details"
        actions={
          <span className="rounded-full bg-[rgba(120,120,128,0.12)] px-3 py-[5px] text-[11.5px] font-semibold text-ink2">
            Developer view · tokens shown
          </span>
        }
      />

      <div className="max-w-[900px] px-[30px] pb-11 pt-[22px]">
        {!data.configured ? (
          <SetupCard
            service="Supabase"
            message="Connect Supabase and run the migration to record and show agent activity. Until then there is no history to display — the rest of LabelOS still runs in demo mode."
          />
        ) : (
          <div className="lo-card px-5 py-1.5">
            <ActivityTimeline entries={data.entries} />
          </div>
        )}
      </div>
    </div>
  );
}
