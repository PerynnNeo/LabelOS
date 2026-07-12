"use client";

import { useEffect, useState } from "react";
import { Clock, Coins, Search } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { cn, formatDate } from "@/lib/utils";

/**
 * Compact vertical activity timeline: what each agent (or the user) did, with
 * provider/model, input/output summaries, token usage, and a relative time.
 *
 * The page maps ActivityLogRow -> AgentTraceEntry (this component imports no
 * server modules). Client Component so relative times stay hydration-safe:
 * the first render shows an absolute date, then it switches to "5m ago" after
 * mount, so Server and Client markup always match initially.
 */

export interface AgentTraceUsage {
  inputTokens?: number;
  outputTokens?: number;
  webSearchRequests?: number;
  durationMs?: number;
}

export interface AgentTraceEntry {
  id: string;
  actor: string;
  action: string;
  entityType?: string | null;
  provider?: string | null;
  model?: string | null;
  inputSummary?: string;
  outputSummary?: string;
  usage?: AgentTraceUsage;
  /** ISO timestamp. */
  createdAt: string;
}

const numberFormat = new Intl.NumberFormat("en-US");

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

function relativeTime(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 border border-line bg-paper px-1.5 py-0.5 text-[0.7rem] text-muted">
      {children}
    </span>
  );
}

function UsageChips({ usage }: { usage: AgentTraceUsage }) {
  const tokens = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
  const chips: React.ReactNode[] = [];
  if (tokens > 0) {
    chips.push(
      <Chip key="tokens">
        <Coins aria-hidden className="size-3" />
        {numberFormat.format(usage.inputTokens ?? 0)} in ·{" "}
        {numberFormat.format(usage.outputTokens ?? 0)} out
      </Chip>,
    );
  }
  if (usage.webSearchRequests && usage.webSearchRequests > 0) {
    chips.push(
      <Chip key="search">
        <Search aria-hidden className="size-3" />
        {usage.webSearchRequests} search
        {usage.webSearchRequests === 1 ? "" : "es"}
      </Chip>,
    );
  }
  if (usage.durationMs && usage.durationMs > 0) {
    chips.push(
      <Chip key="duration">
        <Clock aria-hidden className="size-3" />
        {formatDuration(usage.durationMs)}
      </Chip>,
    );
  }
  if (chips.length === 0) return null;
  return <div className="flex flex-wrap items-center gap-1.5">{chips}</div>;
}

function TimeLabel({ iso }: { iso: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
  }, []);
  const label = now === null ? formatDate(iso) : relativeTime(iso, now);
  return (
    <time
      dateTime={iso}
      title={formatDate(iso)}
      suppressHydrationWarning
      className="shrink-0 whitespace-nowrap text-xs text-muted"
    >
      {label}
    </time>
  );
}

export interface AgentTraceProps {
  entries: AgentTraceEntry[];
  className?: string;
}

export function AgentTrace({ entries, className }: AgentTraceProps) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="No activity yet"
        description="Agent and human actions will appear here as the collection progresses."
        className={className}
      />
    );
  }

  return (
    <ol className={cn("flex flex-col", className)}>
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1;
        const provider = entry.provider?.trim();
        const model = entry.model?.trim();
        return (
          <li key={entry.id} className="flex gap-3">
            {/* Left rail: dot + connector */}
            <div className="flex flex-col items-center">
              <span
                aria-hidden
                className="mt-1.5 size-2 shrink-0 rounded-full border border-accent bg-accent/30"
              />
              {!isLast ? (
                <span aria-hidden className="w-px flex-1 bg-line" />
              ) : null}
            </div>

            <div className={cn("flex min-w-0 flex-1 flex-col gap-1.5", isLast ? "pb-0" : "pb-5")}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-medium text-ink">{entry.actor}</span>
                  <span className="font-mono text-xs text-muted">
                    {entry.action}
                  </span>
                </div>
                <TimeLabel iso={entry.createdAt} />
              </div>

              {(provider || model) && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {provider ? <Chip>{provider}</Chip> : null}
                  {model ? <Chip>{model}</Chip> : null}
                </div>
              )}

              {entry.inputSummary ? (
                <p className="text-sm leading-relaxed text-muted">
                  <span className="text-ink">Input:</span> {entry.inputSummary}
                </p>
              ) : null}
              {entry.outputSummary ? (
                <p className="text-sm leading-relaxed text-muted">
                  <span className="text-ink">Output:</span> {entry.outputSummary}
                </p>
              ) : null}

              {entry.usage ? <UsageChips usage={entry.usage} /> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
