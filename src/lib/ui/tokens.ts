/**
 * Shared UI vocabulary ported from the design mockup
 * (design-reference/LabelOS.dc.html). Pure, client-safe, no imports of
 * server modules — components and pages import from here so status colours,
 * money formatting and the placeholder swatches stay consistent everywhere.
 *
 * Colours are literal hex to match the mockup exactly (the tinted
 * background / solid foreground pairs cannot be expressed as single Tailwind
 * utilities), so use these `Tone` objects for status pills and chips.
 */

export const ACCENT = "#0A84FF";

/** A tinted status token: `bg` is a low-alpha fill, `fg` a solid label colour. */
export interface Tone {
  label: string;
  fg: string;
  bg: string;
}

/** Singapore dollar formatting used throughout the product (brand currency). */
export function money(n: number, currency = "SGD"): string {
  const symbol = currency === "SGD" ? "S$" : currency + " ";
  return symbol + Math.round(n).toLocaleString("en-SG");
}

export function pct(n01: number): string {
  return Math.round(n01 * 100) + "%";
}

// ---------------------------------------------------------------------------
// Garment analysis status (products.analysis_status)
// ---------------------------------------------------------------------------
export const ANALYSIS_TONE: Record<string, Tone> = {
  complete: { label: "Completed", fg: "#248A3D", bg: "rgba(52,199,89,0.14)" },
  needs_review: {
    label: "Awaiting review",
    fg: "#B25000",
    bg: "rgba(255,149,0,0.15)",
  },
  running: { label: "Analysing", fg: "#0A6E8F", bg: "rgba(90,200,250,0.18)" },
  pending: { label: "Needs analysis", fg: "#6E6E73", bg: "rgba(120,120,128,0.14)" },
  queued: { label: "Needs analysis", fg: "#6E6E73", bg: "rgba(120,120,128,0.14)" },
  failed: { label: "Failed", fg: "#C4271B", bg: "rgba(255,59,48,0.15)" },
};

// ---------------------------------------------------------------------------
// Outfit lifecycle (outfits.status) and curation labels
// ---------------------------------------------------------------------------
export const OUTFIT_TONE: Record<string, Tone> = {
  candidate: {
    label: "Awaiting review",
    fg: "#B25000",
    bg: "rgba(255,149,0,0.15)",
  },
  approved: { label: "Owner approved", fg: "#248A3D", bg: "rgba(52,199,89,0.15)" },
  rejected: {
    label: "Rejected in AI review",
    fg: "#C4271B",
    bg: "rgba(255,59,48,0.15)",
  },
  revised: { label: "Revised", fg: "#B25000", bg: "rgba(255,149,0,0.15)" },
  final: { label: "Final collection", fg: "#248A3D", bg: "rgba(52,199,89,0.15)" },
};

export const CURATION_TONE: Record<string, Tone> = {
  Core: { label: "Core", fg: "#248A3D", bg: "rgba(52,199,89,0.14)" },
  Directional: { label: "Directional", fg: "#5E5CE6", bg: "rgba(94,92,230,0.13)" },
  Statement: { label: "Statement", fg: "#B25000", bg: "rgba(255,149,0,0.15)" },
};

export const VERDICT_TONE: Record<string, Tone> = {
  approve: { label: "Approve", fg: "#248A3D", bg: "rgba(52,199,89,0.14)" },
  revise: { label: "Revise", fg: "#B25000", bg: "rgba(255,149,0,0.15)" },
  reject: { label: "Reject", fg: "#C4271B", bg: "rgba(255,59,48,0.14)" },
};

// ---------------------------------------------------------------------------
// Trend adoption stage
// ---------------------------------------------------------------------------
export const TREND_TONE: Record<string, Tone> = {
  emerging: { label: "Emerging", fg: "#0863C4", bg: "rgba(10,132,255,0.13)" },
  growing: { label: "Growing", fg: "#0A6E8F", bg: "rgba(90,200,250,0.18)" },
  established: { label: "Established", fg: "#5E5CE6", bg: "rgba(94,92,230,0.13)" },
  declining: { label: "Declining", fg: "#C4271B", bg: "rgba(255,59,48,0.13)" },
  uncertain: { label: "Uncertain", fg: "#B25000", bg: "rgba(255,149,0,0.14)" },
};

// ---------------------------------------------------------------------------
// Supplier verification / production stage
// ---------------------------------------------------------------------------
export const SUPPLIER_TONE: Record<string, Tone> = {
  demo: { label: "Demo data", fg: "#B25000", bg: "rgba(255,149,0,0.14)" },
  lead: { label: "Lead", fg: "#6E6E73", bg: "rgba(120,120,128,0.14)" },
  contacted: { label: "Contacted", fg: "#0A6E8F", bg: "rgba(90,200,250,0.18)" },
  verified: { label: "Verified", fg: "#248A3D", bg: "rgba(52,199,89,0.13)" },
};

/** Neutral chip tone for tags and generic metadata. */
export const NEUTRAL_TONE: Tone = {
  label: "",
  fg: "#48484A",
  bg: "rgba(120,120,128,0.12)",
};

export function toneFor(map: Record<string, Tone>, key: string | null | undefined): Tone {
  return (key && map[key]) || NEUTRAL_TONE;
}

// ---------------------------------------------------------------------------
// Placeholder swatches — deterministic tonal gradient from an id/string, so a
// product with no image still renders the mockup's fabric-swatch look.
// ---------------------------------------------------------------------------
const SWATCHES: Array<[string, string]> = [
  ["#EFE7DB", "#E2D6C2"],
  ["#E7EAF0", "#D6DCE6"],
  ["#ECE6D8", "#D9CDB8"],
  ["#E4E9E5", "#CFD9D2"],
  ["#F0EFE9", "#E2E0D6"],
  ["#ECE7F0", "#DBD3E6"],
  ["#E9EDF1", "#D6DEE6"],
  ["#EFEAE2", "#E0D8CA"],
  ["#EAECE8", "#D8DCD4"],
  ["#EAE4DB", "#D8CDBB"],
  ["#EEEBE4", "#DED8CB"],
  ["#E9E2D6", "#D6C9B4"],
];

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic [light, dark] swatch pair for a product id/title. */
export function swatch(seed: string): [string, string] {
  return SWATCHES[hashString(seed) % SWATCHES.length];
}

/** Inline style for a hatched fabric-swatch placeholder background. */
export function swatchStyle(seed: string): React.CSSProperties {
  const [a, b] = swatch(seed);
  return { background: `linear-gradient(150deg, ${a}, ${b})` };
}

/** Accent-tinted avatar background for an agent initials chip. */
export const AGENT_COLORS: Record<string, string> = {
  "Garment Librarian": "#34AADC",
  "Trend Scout": "#AF52DE",
  "Outfit Composer": "#0A84FF",
  "Runway Jury": "#FF375F",
  "Outfit Reviser": "#FF9500",
  "Collection Curator": "#5E5CE6",
  "Gap Designer": "#30B0C7",
  "Tech Pack Writer": "#5E5CE6",
  "Listing Writer": "#0A6E8F",
  system: "#8E8E93",
  owner: "#C9C3B8",
};

export function agentColor(actor: string): string {
  return AGENT_COLORS[actor] ?? "#8E8E93";
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
