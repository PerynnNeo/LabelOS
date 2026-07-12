import { cn } from "@/lib/utils";
import { inputBaseClass } from "@/components/ui/input";

/**
 * Multi-line text control sharing the Input styling. Forwards native props
 * (including `ref`) for react-hook-form. Set `invalid` for an error state.
 */
export interface TextareaProps extends React.ComponentProps<"textarea"> {
  invalid?: boolean;
}

export function Textarea({ className, invalid, ...props }: TextareaProps) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(
        inputBaseClass,
        "min-h-24 resize-y leading-relaxed",
        invalid ? "border-danger" : "border-line",
        className,
      )}
      {...props}
    />
  );
}
