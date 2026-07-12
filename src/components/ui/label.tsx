import { cn } from "@/lib/utils";

/**
 * Form label. Pair with a control via `htmlFor`. Set `required` to append a
 * subtle asterisk for screen and sighted readers.
 */
export interface LabelProps extends React.ComponentProps<"label"> {
  required?: boolean;
}

export function Label({ className, children, required, ...props }: LabelProps) {
  return (
    <label
      className={cn(
        "block text-sm font-medium text-ink",
        className,
      )}
      {...props}
    >
      {children}
      {required ? (
        <span aria-hidden className="ml-0.5 text-danger">
          *
        </span>
      ) : null}
    </label>
  );
}
