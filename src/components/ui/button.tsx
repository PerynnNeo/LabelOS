import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Editorial button. Presentational and framework-neutral: it forwards every
 * native <button> prop (including `ref` and `onClick`) so it works inside both
 * Server and Client Components. Attach handlers from a Client Component.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends React.ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Show a spinner and disable the button while an action is in flight. */
  loading?: boolean;
}

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary:
    "bg-ink text-paper border border-ink hover:bg-accent hover:border-accent",
  secondary:
    "bg-surface text-ink border border-line hover:border-ink",
  ghost:
    "bg-transparent text-ink border border-transparent hover:bg-ink/5",
  danger:
    "bg-danger text-paper border border-danger hover:bg-danger/90",
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-xs",
  md: "h-10 gap-2 px-5 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap font-medium tracking-wide",
        "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <LoaderCircle
          aria-hidden
          className="size-4 shrink-0 animate-spin"
        />
      ) : null}
      {children}
    </button>
  );
}
