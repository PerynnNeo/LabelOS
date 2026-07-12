import type { OutfitReviewScores } from "@/lib/domain/schemas";
import { pct } from "@/lib/ui/tokens";
import { cn } from "@/lib/utils";

/**
 * A single labelled score bar (0–1). Colour tracks quality: ≥0.9 green,
 * ≥0.75 accent blue, otherwise warning orange — matching the confidence bars
 * in the mockup's analysis drawer and outfit review.
 */
function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function colorFor(v: number): string {
  if (v >= 0.9) return "#248A3D";
  if (v >= 0.75) return "#0A84FF";
  return "#B25000";
}

export interface ScoreBarProps {
  value01: number;
  label?: React.ReactNode;
  /** Show the percentage on the right (default true when a label is present). */
  showValue?: boolean;
  className?: string;
}

export function ScoreBar({
  value01,
  label,
  showValue = true,
  className,
}: ScoreBarProps) {
  const v = clamp01(value01);
  const color = colorFor(v);
  return (
    <div className={className}>
      {label || showValue ? (
        <div className="mb-1 flex items-center justify-between gap-2 text-[12.5px]">
          {label ? <span className="text-muted">{label}</span> : <span />}
          {showValue ? (
            <span className="font-semibold text-ink">{pct(v)}</span>
          ) : null}
        </div>
      ) : null}
      <div className="h-[5px] overflow-hidden rounded-[3px] bg-black/[0.06]">
        <div
          className="h-full rounded-[3px]"
          style={{ width: pct(v), background: color }}
        />
      </div>
    </div>
  );
}

const SCORE_LABELS: Record<keyof OutfitReviewScores, string> = {
  brandFit: "Brand fit",
  visualHarmony: "Visual harmony",
  seasonClimateFit: "Season & climate",
  trendRelevance: "Trend relevance",
  commercialValue: "Commercial value",
  novelty: "Novelty",
};

const SCORE_ORDER: Array<keyof OutfitReviewScores> = [
  "brandFit",
  "visualHarmony",
  "seasonClimateFit",
  "trendRelevance",
  "commercialValue",
  "novelty",
];

/** The six labelled component bars for an outfit review's scores. */
export interface ScoreBreakdownProps {
  scores: OutfitReviewScores;
  className?: string;
}

export function ScoreBreakdown({ scores, className }: ScoreBreakdownProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {SCORE_ORDER.map((key) => (
        <ScoreBar key={key} label={SCORE_LABELS[key]} value01={scores[key]} />
      ))}
    </div>
  );
}
