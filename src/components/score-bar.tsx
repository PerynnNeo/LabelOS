import type { OutfitReviewScores } from "@/lib/domain/schemas";
import { cn } from "@/lib/utils";

/**
 * Score visualisations for 0–1 values.
 *
 * <ScoreBar>       one labelled progress bar (e.g. an outfit's overall score).
 * <ScoreBreakdown> the six Runway Jury component scores, each with its weight.
 *
 * Shared component (no hooks) — safe in Server or Client Components. The prop
 * type is imported type-only, so the Zod schema module is not bundled.
 */

type ScoreTone = "auto" | "accent" | "neutral";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function autoFill(value: number): string {
  if (value < 0.5) return "bg-danger";
  if (value < 0.75) return "bg-warning";
  return "bg-success";
}

function fillClass(value: number, tone: ScoreTone): string {
  if (tone === "accent") return "bg-accent";
  if (tone === "neutral") return "bg-ink";
  return autoFill(value);
}

export interface ScoreBarProps {
  /** Score in the 0–1 range (values outside are clamped). */
  value: number;
  label?: string;
  /** Show the percentage on the right of the label row. Default: true. */
  showValue?: boolean;
  /** Fill colour strategy. "auto" tints by score (default). */
  tone?: ScoreTone;
  className?: string;
}

export function ScoreBar({
  value,
  label,
  showValue = true,
  tone = "auto",
  className,
}: ScoreBarProps) {
  const v = clamp01(value);
  const pct = Math.round(v * 100);
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {(label || showValue) && (
        <div className="flex items-baseline justify-between gap-2 text-xs">
          {label ? <span className="text-muted">{label}</span> : <span />}
          {showValue ? (
            <span className="font-medium tabular-nums text-ink">{pct}%</span>
          ) : null}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-1.5 w-full overflow-hidden rounded-full bg-line"
      >
        <div
          className={cn("h-full rounded-full", fillClass(v, tone))}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * The six Runway Jury component scores. Order and weights mirror
 * REVIEW_SCORE_WEIGHTS in src/lib/domain/schemas.ts (kept inline here so this
 * presentational component doesn't pull the Zod schema module into the bundle).
 */
const SCORE_ROWS: {
  key: keyof OutfitReviewScores;
  label: string;
  weight: number;
}[] = [
  { key: "brandFit", label: "Brand fit", weight: 0.25 },
  { key: "visualHarmony", label: "Visual harmony", weight: 0.2 },
  { key: "seasonClimateFit", label: "Season & climate", weight: 0.15 },
  { key: "trendRelevance", label: "Trend relevance", weight: 0.15 },
  { key: "commercialValue", label: "Commercial value", weight: 0.15 },
  { key: "novelty", label: "Novelty", weight: 0.1 },
];

export interface ScoreBreakdownProps {
  scores: OutfitReviewScores;
  /** Show the "· 25%" weight next to each metric label. Default: true. */
  showWeights?: boolean;
  className?: string;
}

export function ScoreBreakdown({
  scores,
  showWeights = true,
  className,
}: ScoreBreakdownProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {SCORE_ROWS.map((row) => (
        <ScoreBar
          key={row.key}
          value={scores[row.key]}
          label={
            showWeights
              ? `${row.label} · ${Math.round(row.weight * 100)}%`
              : row.label
          }
        />
      ))}
    </div>
  );
}
