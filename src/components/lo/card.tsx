import { cn } from "@/lib/utils";

/**
 * Standard white card (`.lo-card`: rounded-16, hairline border, subtle shadow).
 * `padding` is a convenience — pass a number (px) or CSS string, or omit and
 * apply your own inner padding with utilities.
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: number | string;
}

export function Card({ padding, className, style, children, ...props }: CardProps) {
  return (
    <div
      className={cn("lo-card", className)}
      style={padding == null ? style : { padding, ...style }}
      {...props}
    >
      {children}
    </div>
  );
}

/** Header row inside a card: title (+ optional trailing content). */
export function CardHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center gap-2.5 px-4 pt-3 pb-2", className)}
      {...props}
    >
      {children}
    </div>
  );
}

/** Card title text — 15px / 650, matches the mockup's section headings. */
export function CardTitle({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "min-w-0 flex-1 text-[15px] font-[650] tracking-[-0.01em] text-ink",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Label / value split row used in brief, spec, brand-profile and supplier
 * tables. A hairline top border separates stacked rows.
 */
export interface CardRowProps {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Override the value colour (e.g. a supplier risk flag). */
  valueColor?: string;
  className?: string;
}

export function CardRow({ label, value, valueColor, className }: CardRowProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-t border-[rgba(0,0,0,0.05)] px-4 py-[11px] text-[13px]",
        className,
      )}
    >
      <span className="flex-none text-muted">{label}</span>
      <span
        className="text-right font-semibold text-ink"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </span>
    </div>
  );
}
