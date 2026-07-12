import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Shared presentational utilities. Framework-agnostic and client-safe
 * (no `server-only`, no secrets) so both Server and Client Components can
 * import them.
 */

// Re-exported here for convenience so UI code can pull `cn`, `money` and `pct`
// from a single "@/lib/utils" import. Source of truth stays in the tokens file.
export { money, pct } from "@/lib/ui/tokens";

/**
 * Merge conditional class names and de-duplicate conflicting Tailwind
 * utilities (the later utility wins). The single styling helper every UI
 * component uses.
 *
 * @example cn("px-2", condition && "px-4") // -> "px-4"
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format a numeric amount as a currency string.
 *
 * Formatting is pinned to a fixed locale so Server and Client renders always
 * agree (no hydration mismatch). Falls back to a plain string if the currency
 * code is not recognised by the Intl runtime.
 *
 * @param amount   The value to format (already in major units, e.g. dollars).
 * @param currency ISO 4217 code, e.g. "SGD" (default), "USD".
 */
export function formatCurrency(amount: number, currency = "SGD"): string {
  if (!Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat("en-SG", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/**
 * Format an ISO timestamp as a short, human-readable date, e.g. "12 Jul 2026".
 *
 * Rendered in UTC on purpose: database timestamps are UTC, and pinning the
 * time zone keeps Server and Client renders identical. Returns the raw input
 * when it cannot be parsed.
 */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Format an ISO timestamp as a short relative label, e.g. "just now", "5m ago",
 * "3h ago", "2d ago", falling back to the absolute date beyond a week.
 *
 * NOTE: relative output depends on "now", so calling this during SSR and again
 * after hydration can differ. Prefer computing it in a Client Component (or a
 * useEffect) — see `<AgentTrace>` for the hydration-safe pattern. `formatDate`
 * remains available for deterministic, absolute rendering.
 */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

/**
 * Truncate a string to `max` characters, appending an ellipsis when cut.
 * Trims trailing whitespace before the ellipsis for a cleaner result.
 */
export function truncate(value: string, max = 120): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max).trimEnd()}…`;
}
