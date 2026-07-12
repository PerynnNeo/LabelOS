"use client";

import { cn } from "@/lib/utils";

/**
 * Big-number tile. Two faithful modes from the mockup:
 *
 * - with a `bg`: a left-aligned rounded tile (dashboard catalog-analysis grid),
 *   optionally clickable.
 * - without a `bg`: a centered, borderless cell that flexes to fill a row
 *   (the outfit pipeline stat strip).
 */
export interface StatCellProps {
  n: React.ReactNode;
  label: React.ReactNode;
  /** Number colour (defaults to primary ink). */
  color?: string;
  /** Tile fill — presence switches to the padded, left-aligned tile style. */
  bg?: string;
  onClick?: () => void;
  className?: string;
}

export function StatCell({ n, label, color, bg, onClick, className }: StatCellProps) {
  const tile = bg != null;
  const content = (
    <>
      <div
        className={cn(
          "font-bold tracking-[-0.01em]",
          tile ? "text-[22px]" : "text-[20px]",
        )}
        style={color ? { color } : undefined}
      >
        {n}
      </div>
      <div
        className={cn("mt-px text-muted", tile ? "text-[11.5px]" : "text-[11px]")}
      >
        {label}
      </div>
    </>
  );

  const classes = cn(
    tile
      ? "rounded-[11px] px-3 py-2.5 text-left transition hover:brightness-[0.98]"
      : "flex-1 text-center",
    onClick && "cursor-pointer",
    className,
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={classes}
        style={tile ? { background: bg } : undefined}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={classes} style={tile ? { background: bg } : undefined}>
      {content}
    </div>
  );
}
