import { cn } from "@/lib/utils";

/**
 * Small status/label pill. Colour variants map to the design tokens. For
 * domain status values (analysis, outfit, job, approval, production, …) prefer
 * <StatusBadge>, which picks the right variant and label for you.
 */

export type BadgeVariant =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "accent";

export interface BadgeProps extends React.ComponentProps<"span"> {
  variant?: BadgeVariant;
  /** Render a small leading dot in the variant colour. */
  dot?: boolean;
}

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  neutral: "border-line bg-paper text-muted",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
  accent: "border-accent/30 bg-accent/10 text-accent",
};

const DOT_STYLES: Record<BadgeVariant, string> = {
  neutral: "bg-muted",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  accent: "bg-accent",
};

export function Badge({
  variant = "neutral",
  dot = false,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-2 py-0.5 text-xs font-medium",
        VARIANT_STYLES[variant],
        className,
      )}
      {...props}
    >
      {dot ? (
        <span
          aria-hidden
          className={cn("size-1.5 rounded-full", DOT_STYLES[variant])}
        />
      ) : null}
      {children}
    </span>
  );
}
