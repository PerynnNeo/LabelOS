import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Centered empty / zero-data state: an outlined lucide icon, a title, a
 * description, and an optional action slot (e.g. a Button or Link).
 *
 *   <EmptyState
 *     icon={Inbox}
 *     title="No products yet"
 *     description="Upload a garment or import from Shopify to begin."
 *     action={<Button>Upload product</Button>}
 *   />
 */

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Optional call-to-action rendered under the description. */
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 border border-dashed border-line bg-surface px-6 py-16 text-center",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full border border-line bg-paper text-muted">
        <Icon aria-hidden className="size-5" />
      </span>
      <div className="flex max-w-sm flex-col gap-1.5">
        <h3 className="font-display text-lg leading-tight tracking-tight text-ink">
          {title}
        </h3>
        {description ? (
          <p className="text-sm leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
