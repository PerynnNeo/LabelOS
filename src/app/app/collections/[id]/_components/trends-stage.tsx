"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, Card, EmptyState, Icon, NextAction, Pill } from "@/components/lo";
import { TREND_TONE, pct, toneFor } from "@/lib/ui/tokens";
import { cn, truncate } from "@/lib/utils";
import { apiRequest, errorMessage } from "@/app/app/_lib/api-client";
import type { StudioStageProps } from "./types";

/**
 * Stage 2 — Trend Direction.
 *
 * Runs / shows the Trend Scout report. When no report exists it offers the run
 * action (POST /api/collections/[id]/trends). When a report exists it renders
 * the three directions with adoption-stage pill, confidence, market/date/fit
 * rows, a local Use/Ignore choice, and sources. A mandatory demo warning banner
 * appears whenever the report was not produced by live web search.
 */
export function TrendsStage({ collection }: StudioStageProps) {
  const router = useRouter();
  const report = collection.trend_report;

  const [running, setRunning] = useState(false);

  async function runResearch() {
    if (running) return;
    setRunning(true);
    try {
      await apiRequest(`/api/collections/${collection.id}/trends`, {
        method: "POST",
      });
      toast.success("Trend research complete.");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRunning(false);
    }
  }

  if (!report) {
    return (
      <div className="flex flex-col gap-[18px]">
        <NextAction
          title="Compile trend directions for this brief"
          help="Trend Scout researches directions from your brief and brand profile, then you choose which to build on."
          action={{
            label: "Run trend research",
            onClick: runResearch,
            loading: running,
          }}
        />
        <Card>
          <EmptyState
            icon="activity"
            title="No trend directions yet"
            description="Run Trend Scout to generate candidate directions. In demo mode these are clearly-labelled hypotheses, not live market evidence."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <NextAction
        title="Pick the directions to build on, then generate outfits"
        help="Use or ignore each direction — the Outfit Composer only builds from the ones you keep."
        action={{
          label: "Generate outfit candidates",
          href: `/app/collections/${collection.id}?stage=outfits`,
        }}
      />

      {report.sourceMode !== "live_web_search" ? <DemoBanner /> : null}

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[15px] font-[650] tracking-[-0.01em] text-ink">
          {report.title}
        </h2>
        <span className="text-[12px] text-muted">
          {report.market} · {report.season}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {report.signals.map((signal, i) => (
          <TrendCard key={`${signal.name}-${i}`} signal={signal} market={report.market} />
        ))}
      </div>

      {report.limitations.length > 0 ? (
        <Card className="p-4">
          <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.03em] text-muted">
            Limitations
          </div>
          <ul className="flex flex-col gap-1">
            {report.limitations.map((l, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] text-ink3">
                <span className="mt-1.5 size-1 flex-none rounded-full bg-[#C7C7CC]" />
                <span className="leading-snug">{l}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function DemoBanner() {
  return (
    <div className="flex items-center gap-3 rounded-[13px] border border-[rgba(255,149,0,0.22)] bg-[rgba(255,149,0,0.09)] px-4 py-3">
      <Icon
        name="alert-triangle"
        size={16}
        strokeWidth={1.9}
        className="flex-none text-[#B25000]"
      />
      <div className="flex-1 text-[12.5px] leading-snug text-[#7A4A00]">
        <b className="font-[650]">
          Live trend research is disabled; these directions are demonstration
          hypotheses, not current market evidence.
        </b>{" "}
        Turn on Claude web search in Integrations for cited, dated sources.
      </div>
      <Link
        href="/app/integrations"
        className="inline-flex h-[30px] flex-none items-center rounded-[8px] border border-[rgba(178,80,0,0.3)] px-3 text-[12px] font-semibold text-[#B25000] transition hover:bg-[rgba(255,149,0,0.12)]"
      >
        Integrations
      </Link>
    </div>
  );
}

type Signal = NonNullable<StudioStageProps["collection"]["trend_report"]>["signals"][number];

function TrendCard({ signal, market }: { signal: Signal; market: string }) {
  // Local-only choice; the Outfit Composer wiring lives in the Outfits stage.
  const [choice, setChoice] = useState<"use" | "ignore">("use");
  const used = choice === "use";

  const evidenceDate = signal.sources.find((s) => s.date)?.date ?? "—";
  const namedSources = signal.sources.filter((s) => s.title.trim().length > 0);

  return (
    <Card
      className={cn(
        "flex flex-col p-[18px] transition-opacity",
        !used && "opacity-60",
      )}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <Pill tone={toneFor(TREND_TONE, signal.adoptionStage)} />
        <span
          className="ml-auto text-[11px] text-muted"
          title="Model confidence in this direction"
        >
          Confidence
        </span>
        <span className="text-[12.5px] font-bold text-ink">
          {pct(signal.confidence)}
        </span>
      </div>

      <div className="text-[16px] font-bold tracking-[-0.01em] text-ink">
        {signal.name}
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-ink2">{signal.summary}</p>

      <div className="mt-3 flex flex-col gap-1.5 text-[11.5px]">
        <Row label="Target market" value={market} />
        <Row label="Evidence date" value={evidenceDate} />
        <Row label="Brand fit" value={truncate(signal.relevanceToBrand, 70)} />
        <Row label="Climate fit" value={truncate(signal.climateFit, 70)} />
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-[rgba(0,0,0,0.06)] pt-3">
        <Button
          size="sm"
          variant={used ? "primary" : "secondary"}
          className="flex-1"
          aria-pressed={used}
          onClick={() => setChoice("use")}
        >
          {used ? "In collection" : "Use in collection"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          aria-pressed={!used}
          className={cn(!used && "text-[#C4271B]")}
          onClick={() => setChoice("ignore")}
        >
          Ignore
        </Button>
      </div>

      <div className="mt-2.5 text-[10.5px] text-faint">
        {namedSources.length > 0 ? (
          <>
            Sources:{" "}
            {namedSources.map((s, i) => (
              <span key={`${s.title}-${i}`}>
                {i > 0 ? ", " : ""}
                {s.url ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-dotted underline-offset-2 hover:text-ink3"
                  >
                    {s.title}
                  </a>
                ) : (
                  s.title
                )}
              </span>
            ))}
          </>
        ) : (
          `Sources: ${signal.sources.length} reference${signal.sources.length === 1 ? "" : "s"}`
        )}
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-[84px] flex-none text-muted">{label}</span>
      <span className="font-medium text-ink2">{value}</span>
    </div>
  );
}
