import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { inputBaseClass } from "@/components/ui/input";

/**
 * Native <select> styled to match the other form controls, with a chevron
 * affordance. Pass <option> children. Forwards native props (including `ref`)
 * for react-hook-form. `invalid` toggles the error border.
 *
 * `wrapperClassName` styles the positioning wrapper; `className` styles the
 * underlying <select>.
 */
export interface SelectProps extends React.ComponentProps<"select"> {
  invalid?: boolean;
  wrapperClassName?: string;
}

export function Select({
  className,
  wrapperClassName,
  invalid,
  children,
  ...props
}: SelectProps) {
  return (
    <div className={cn("relative", wrapperClassName)}>
      <select
        aria-invalid={invalid || undefined}
        className={cn(
          inputBaseClass,
          "appearance-none pr-9",
          invalid ? "border-danger" : "border-line",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
      />
    </div>
  );
}
