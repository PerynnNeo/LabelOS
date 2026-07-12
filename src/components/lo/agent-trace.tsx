import { AgentAvatar } from "./icon";
import { EmptyState } from "./empty-state";
import { cn } from "@/lib/utils";

/**
 * Activity timeline row list matching the mockup's Activity Log: a coloured
 * agent avatar, "<agent> <action>", a detail line, a mono token line, and a
 * right-aligned running/error/time cluster. Rows are separated by a hairline.
 *
 * The screen maps its rows to `AgentTraceEntry` (this component imports no
 * server modules). `time` is a pre-formatted display string (e.g. "5m ago") —
 * compute it in the caller to stay hydration-safe.
 */
export interface AgentTraceEntry {
  id?: string;
  actor: string;
  action: React.ReactNode;
  detail?: React.ReactNode;
  /** Developer token/usage line (rendered mono). */
  tokens?: React.ReactNode;
  running?: boolean;
  error?: boolean;
  /** Pre-formatted relative time label. */
  time?: string;
}

export interface AgentTraceProps {
  entries: AgentTraceEntry[];
  className?: string;
}

export function AgentTrace({ entries, className }: AgentTraceProps) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon="activity"
        title="No activity yet"
        description="Agent and human actions will appear here as the collection progresses."
        className={className}
      />
    );
  }

  return (
    <ol className={cn("flex flex-col", className)}>
      {entries.map((entry, i) => (
        <li
          key={entry.id ?? i}
          className={cn(
            "flex items-start gap-3.5 py-3.5",
            i > 0 && "border-t border-[rgba(0,0,0,0.05)]",
          )}
        >
          <AgentAvatar actor={entry.actor} />
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] text-ink">
              <b className="font-[650]">{entry.actor}</b>{" "}
              <span className="text-ink2">{entry.action}</span>
            </div>
            {entry.detail ? (
              <div className="mt-0.5 text-[12px] text-muted">{entry.detail}</div>
            ) : null}
            {entry.tokens ? (
              <div className="mt-[5px] font-mono text-[10.5px] text-faint">
                {entry.tokens}
              </div>
            ) : null}
          </div>
          <div className="flex flex-none items-center gap-2">
            {entry.running ? (
              <span className="inline-flex items-center gap-[5px] text-[11px] font-semibold text-[#B25000]">
                <span className="size-1.5 rounded-full bg-[#FF9500] animate-[lo-pulse_1.4s_ease-in-out_infinite]" />
                running
              </span>
            ) : null}
            {entry.error ? (
              <span className="rounded-full bg-[rgba(255,59,48,0.12)] px-2 py-0.5 text-[11px] font-semibold text-[#C4271B]">
                error
              </span>
            ) : null}
            {entry.time ? (
              <span className="whitespace-nowrap text-[11px] text-faint">
                {entry.time}
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
