import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Compact metric tile: a big serif number over an uppercase label, with an
 * optional supporting hint. Presentational, Server/Client-safe.
 */
export function StatCard({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col gap-1 px-5 py-4", className)}>
      <span className="text-xs font-medium uppercase tracking-[0.15em] text-muted">
        {label}
      </span>
      <span className="font-display text-3xl leading-none tracking-tight text-ink tabular-nums">
        {value}
      </span>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </Card>
  );
}
