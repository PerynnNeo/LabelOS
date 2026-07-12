import { cn } from "@/lib/utils";

/**
 * Pretty-printed, scrollable JSON block. Used for payload previews (e.g. the
 * exact Shopify draft fields) and debug/detail views. Shared component.
 *
 * Renders text only — never HTML — so untrusted data cannot inject markup.
 */

export interface JsonPreviewProps {
  data: unknown;
  /** Optional caption above the code block. */
  label?: string;
  /** Caps the block height and scrolls when exceeded. Default: 20rem. */
  maxHeight?: string;
  className?: string;
}

function stringify(data: unknown): string {
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

export function JsonPreview({
  data,
  label,
  maxHeight = "20rem",
  className,
}: JsonPreviewProps) {
  return (
    <figure className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <figcaption className="text-xs font-medium uppercase tracking-[0.15em] text-muted">
          {label}
        </figcaption>
      ) : null}
      <pre
        style={{ maxHeight }}
        className="overflow-auto border border-line bg-paper p-4 font-mono text-xs leading-relaxed text-ink"
      >
        {stringify(data)}
      </pre>
    </figure>
  );
}
