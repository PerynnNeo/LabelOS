import { cn } from "@/lib/utils";

/** A single shimmering placeholder block. */
function Bar({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-sm bg-line/70", className)} />
  );
}

/**
 * Neutral editorial loading skeleton for the private app's route-level
 * loading.tsx boundaries. Mirrors the rough shape of a page: a header, a stat
 * row, and a couple of content cards.
 */
export function PageLoading({ title }: { title?: string }) {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-3">
        <Bar className="h-3 w-24" />
        <Bar className="h-9 w-64" />
        {title ? (
          <span className="sr-only">{title}</span>
        ) : (
          <Bar className="h-4 w-96 max-w-full" />
        )}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Bar className="h-24" />
        <Bar className="h-24" />
        <Bar className="h-24" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Bar className="h-56 lg:col-span-2" />
        <Bar className="h-56" />
      </div>
    </div>
  );
}
