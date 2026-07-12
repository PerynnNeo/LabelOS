import { cn } from "@/lib/utils";

/**
 * Minimal text input: line border, bronze accent focus ring. Forwards every
 * native prop including `ref`, so it plugs straight into react-hook-form's
 * `register()` spread. Set `invalid` to surface a validation error state.
 */
export interface InputProps extends React.ComponentProps<"input"> {
  invalid?: boolean;
}

export const inputBaseClass =
  "w-full border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted " +
  "transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-accent " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export function Input({ className, invalid, ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        inputBaseClass,
        invalid ? "border-danger" : "border-line",
        className,
      )}
      {...props}
    />
  );
}
