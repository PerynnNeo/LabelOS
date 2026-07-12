import type { Tone } from "@/lib/ui/tokens";
import { cn } from "@/lib/utils";

/**
 * Status pill — a low-alpha tinted background with a solid foreground label,
 * rounded-full. Pass a `Tone` from tokens (ANALYSIS_TONE, OUTFIT_TONE, …) or
 * explicit `fg`/`bg` colours. Optional leading dot (which can pulse when the
 * thing it represents is running).
 */
export interface PillProps {
  tone?: Tone;
  /** Explicit foreground (label) colour — overrides `tone.fg`. */
  fg?: string;
  /** Explicit background fill — overrides `tone.bg`. */
  bg?: string;
  /** Label text. Falls back to `tone.label` when children are omitted. */
  label?: string;
  children?: React.ReactNode;
  /** Show a leading dot in the foreground colour. */
  dot?: boolean;
  /** Animate the dot (running state). Implies `dot`. */
  pulse?: boolean;
  className?: string;
}

export function Pill({
  tone,
  fg,
  bg,
  label,
  children,
  dot,
  pulse,
  className,
}: PillProps) {
  const color = fg ?? tone?.fg ?? "#48484A";
  const background = bg ?? tone?.bg ?? "rgba(120,120,128,0.12)";
  const content = children ?? label ?? tone?.label ?? "";
  const showDot = dot || pulse;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] rounded-full px-[9px] py-[3px] text-[11px] font-semibold leading-none",
        className,
      )}
      style={{ color, background }}
    >
      {showDot ? (
        <span
          aria-hidden
          className={cn(
            "h-1.5 w-1.5 flex-none rounded-full",
            pulse && "animate-[lo-pulse_1.4s_ease-in-out_infinite]",
          )}
          style={{ background: color }}
        />
      ) : null}
      {content}
    </span>
  );
}

/**
 * Neutral grey tag chip for metadata and free-form labels
 * (personality traits, certifications, provider/model, …).
 */
export interface ChipProps {
  children: React.ReactNode;
  className?: string;
}

export function Chip({ children, className }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-[rgba(120,120,128,0.12)] px-[11px] py-[3px] text-[11.5px] font-medium text-ink2",
        className,
      )}
    >
      {children}
    </span>
  );
}
