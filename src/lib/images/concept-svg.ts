import type { GarmentDesignSpec } from "@/lib/domain/design-schemas";

/**
 * Deterministic garment concept-sheet renderer (image spec §11, §17).
 *
 * Produces a garment-only FRONT + BACK concept sheet as an SVG string, driven by
 * the structured {@link GarmentDesignSpec}. This is what mock image mode returns
 * so the new-collection flow shows recognisable, genuinely different garments
 * (per category, silhouette, neckline, sleeve, length, closure, pockets, colour)
 * — never a blank striped rectangle. It is also the deterministic technical flat
 * used alongside any live generated image for visual consistency.
 *
 * No people, mannequins, text on the garment, or logos — the sheet shows the
 * isolated garment on a warm-white studio ground, matching the live prompt.
 */

const OUTLINE = "#2A2A2E";
const GROUND = "#F6F4EF";
const HATCH = "rgba(0,0,0,0.04)";

interface Palette {
  fill: string;
  accent: string;
}

function hexOk(h: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h.trim());
}

function palette(spec: GarmentDesignSpec): Palette {
  const primary = spec.colourways.find((c) => c.role === "primary") ?? spec.colourways[0];
  const accent = spec.colourways.find((c) => c.role === "accent");
  return {
    fill: primary && hexOk(primary.hex) ? primary.hex : "#D9CDB8",
    accent: accent && hexOk(accent.hex) ? accent.hex : OUTLINE,
  };
}

function has(list: string[], ...needles: string[]): boolean {
  const joined = list.join(" ").toLowerCase();
  return needles.some((n) => joined.includes(n.toLowerCase()));
}
function is(value: string | null, ...needles: string[]): boolean {
  if (!value) return false;
  const v = value.toLowerCase();
  return needles.some((n) => v.includes(n.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Garment part builders — each returns SVG drawn in a 200-wide × 300-tall panel
// centred at x0 (the panel's left edge). `back` simplifies front-only details.
// ---------------------------------------------------------------------------

function neckline(spec: GarmentDesignSpec, cx: number, top: number, back: boolean): string {
  if (back) {
    return `<path d="M ${cx - 34} ${top} Q ${cx} ${top + 14} ${cx + 34} ${top}" fill="none" stroke="${OUTLINE}" stroke-width="2"/>`;
  }
  const n = spec.neckline ?? spec.collar ?? "crew";
  if (is(n, "v-neck", "v neck", "v-")) {
    return `<path d="M ${cx - 30} ${top} L ${cx} ${top + 40} L ${cx + 30} ${top}" fill="none" stroke="${OUTLINE}" stroke-width="2"/>`;
  }
  if (is(n, "scoop", "round")) {
    return `<path d="M ${cx - 34} ${top} Q ${cx} ${top + 44} ${cx + 34} ${top}" fill="none" stroke="${OUTLINE}" stroke-width="2"/>`;
  }
  if (is(n, "square")) {
    return `<path d="M ${cx - 30} ${top} L ${cx - 30} ${top + 26} L ${cx + 30} ${top + 26} L ${cx + 30} ${top}" fill="none" stroke="${OUTLINE}" stroke-width="2"/>`;
  }
  if (is(n, "collar", "camp", "shirt", "polo") || is(spec.collar, "collar", "camp")) {
    return `<path d="M ${cx - 30} ${top} L ${cx - 12} ${top + 8} L ${cx} ${top + 2} L ${cx + 12} ${top + 8} L ${cx + 30} ${top}" fill="none" stroke="${OUTLINE}" stroke-width="2"/>
      <path d="M ${cx - 12} ${top + 8} L ${cx - 22} ${top + 22} M ${cx + 12} ${top + 8} L ${cx + 22} ${top + 22}" fill="none" stroke="${OUTLINE}" stroke-width="1.6"/>`;
  }
  // crew default
  return `<path d="M ${cx - 26} ${top} Q ${cx} ${top + 24} ${cx + 26} ${top}" fill="none" stroke="${OUTLINE}" stroke-width="2"/>`;
}

function sleeves(spec: GarmentDesignSpec, cx: number, shoulderY: number, bodyW: number, fill: string): string {
  const s = spec.sleeveLength ?? "";
  const half = bodyW / 2;
  if (is(s, "sleeveless") || spec.sleeveLength === null) {
    return `<path d="M ${cx - half} ${shoulderY} L ${cx - half + 6} ${shoulderY + 26}" stroke="${OUTLINE}" stroke-width="2" fill="none"/>
      <path d="M ${cx + half} ${shoulderY} L ${cx + half - 6} ${shoulderY + 26}" stroke="${OUTLINE}" stroke-width="2" fill="none"/>`;
  }
  const long = is(s, "long", "full");
  const elbow = is(s, "elbow", "three", "3/4");
  const len = long ? 118 : elbow ? 70 : 40;
  const cuffW = long ? 16 : 22;
  const drop = is(spec.silhouette, "drop", "oversize", "boxy") ? 12 : 0;
  const sy = shoulderY + drop;
  return `
    <path d="M ${cx - half} ${sy} L ${cx - half - 26} ${sy + len} L ${cx - half - 26 + cuffW} ${sy + len} L ${cx - half + 12} ${sy + 14} Z" fill="${fill}" stroke="${OUTLINE}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M ${cx + half} ${sy} L ${cx + half + 26} ${sy + len} L ${cx + half + 26 - cuffW} ${sy + len} L ${cx + half - 12} ${sy + 14} Z" fill="${fill}" stroke="${OUTLINE}" stroke-width="2" stroke-linejoin="round"/>`;
}

function topBody(spec: GarmentDesignSpec, cx: number, pal: Palette, back: boolean, opts: { jacket?: boolean; knit?: boolean } = {}): string {
  const shoulderY = 78;
  const boxy = is(spec.silhouette, "boxy", "oversize", "relaxed", "drop");
  const fitted = is(spec.fit, "fitted", "slim", "tailored");
  const bodyW = boxy ? 150 : fitted ? 112 : 130;
  const cropped = is(spec.length, "crop");
  const tunic = is(spec.length, "tunic", "long", "longline");
  const bottomY = cropped ? 208 : tunic ? 262 : 236;
  const half = bodyW / 2;
  const waist = fitted ? half - 12 : half;
  const parts: string[] = [];

  // Body panel
  parts.push(
    `<path d="M ${cx - half} ${shoulderY} L ${cx - half} ${bottomY - 30} Q ${cx - waist} ${bottomY} ${cx - waist + 8} ${bottomY} L ${cx + waist - 8} ${bottomY} Q ${cx + half} ${bottomY} ${cx + half} ${bottomY - 30} L ${cx + half} ${shoulderY} Q ${cx} ${shoulderY - 12} ${cx - half} ${shoulderY} Z" fill="${pal.fill}" stroke="${OUTLINE}" stroke-width="2.2" stroke-linejoin="round"/>`,
  );
  parts.push(sleeves(spec, cx, shoulderY, bodyW, pal.fill));
  parts.push(neckline(spec, cx, shoulderY - 2, back));

  if (opts.knit && !back) {
    // ribbed hem + cuffs texture
    for (let i = 0; i < 10; i++) {
      const x = cx - half + 8 + i * ((bodyW - 16) / 10);
      parts.push(`<line x1="${x}" y1="${bottomY - 14}" x2="${x}" y2="${bottomY - 2}" stroke="${OUTLINE}" stroke-width="1" opacity="0.5"/>`);
    }
  }

  if (opts.jacket && !back) {
    parts.push(`<line x1="${cx}" y1="${shoulderY + 4}" x2="${cx}" y2="${bottomY - 2}" stroke="${OUTLINE}" stroke-width="1.6"/>`);
    // lapels
    parts.push(`<path d="M ${cx} ${shoulderY + 4} L ${cx - 20} ${shoulderY + 40} M ${cx} ${shoulderY + 4} L ${cx + 20} ${shoulderY + 40}" stroke="${OUTLINE}" stroke-width="1.6" fill="none"/>`);
  } else if (!back && (is(spec.closures.join(" "), "button", "placket") || has(spec.closures, "button"))) {
    parts.push(`<line x1="${cx}" y1="${shoulderY + 8}" x2="${cx}" y2="${bottomY - 8}" stroke="${OUTLINE}" stroke-width="1.2" opacity="0.7"/>`);
    for (let i = 0; i < 5; i++) {
      parts.push(`<circle cx="${cx}" cy="${shoulderY + 24 + i * ((bottomY - shoulderY - 40) / 4)}" r="2.4" fill="none" stroke="${OUTLINE}" stroke-width="1.4"/>`);
    }
  }

  if (!back && has(spec.pockets, "patch")) {
    parts.push(`<rect x="${cx - half + 16}" y="${bottomY - 62}" width="34" height="38" rx="3" fill="none" stroke="${OUTLINE}" stroke-width="1.6"/>`);
    parts.push(`<rect x="${cx + half - 50}" y="${bottomY - 62}" width="34" height="38" rx="3" fill="none" stroke="${OUTLINE}" stroke-width="1.6"/>`);
  }

  if (back) {
    parts.push(`<line x1="${cx}" y1="${shoulderY + 2}" x2="${cx}" y2="${bottomY - 6}" stroke="${OUTLINE}" stroke-width="1" opacity="0.4"/>`);
  }
  return parts.join("\n");
}

function bottomBody(spec: GarmentDesignSpec, cx: number, pal: Palette, back: boolean): string {
  const waistY = 70;
  const wide = is(spec.silhouette, "wide", "flare", "palazzo");
  const tapered = is(spec.silhouette, "taper", "slim", "cigarette");
  const short = is(spec.length, "short", "crop");
  const hipW = 116;
  const hemW = wide ? 150 : tapered ? 64 : 96;
  const hemY = short ? 168 : 268;
  const half = hipW / 2;
  const hemHalf = hemW / 2;
  const parts: string[] = [];
  // waistband
  parts.push(`<rect x="${cx - half}" y="${waistY}" width="${hipW}" height="18" rx="3" fill="${pal.fill}" stroke="${OUTLINE}" stroke-width="2.2"/>`);
  // legs
  const crotchY = waistY + 76;
  parts.push(
    `<path d="M ${cx - half} ${waistY + 18} L ${cx - hemHalf} ${hemY} L ${cx - 6} ${hemY} L ${cx - 6} ${crotchY} L ${cx + 6} ${crotchY} L ${cx + 6} ${hemY} L ${cx + hemHalf} ${hemY} L ${cx + half} ${waistY + 18} Z" fill="${pal.fill}" stroke="${OUTLINE}" stroke-width="2.2" stroke-linejoin="round"/>`,
  );
  if (has(spec.seamDetails, "pleat") || is(spec.waistConstruction, "pleat")) {
    parts.push(`<line x1="${cx - 22}" y1="${waistY + 18}" x2="${cx - 26}" y2="${waistY + 70}" stroke="${OUTLINE}" stroke-width="1.2"/>`);
    parts.push(`<line x1="${cx + 22}" y1="${waistY + 18}" x2="${cx + 26}" y2="${waistY + 70}" stroke="${OUTLINE}" stroke-width="1.2"/>`);
  }
  if (!back && has(spec.pockets, "side", "slant")) {
    parts.push(`<path d="M ${cx - half + 6} ${waistY + 22} L ${cx - half + 26} ${waistY + 42}" stroke="${OUTLINE}" stroke-width="1.6" fill="none"/>`);
    parts.push(`<path d="M ${cx + half - 6} ${waistY + 22} L ${cx + half - 26} ${waistY + 42}" stroke="${OUTLINE}" stroke-width="1.6" fill="none"/>`);
  }
  if (back && has(spec.pockets, "patch", "welt")) {
    parts.push(`<rect x="${cx - 44}" y="${waistY + 30}" width="30" height="26" rx="2" fill="none" stroke="${OUTLINE}" stroke-width="1.4"/>`);
    parts.push(`<rect x="${cx + 14}" y="${waistY + 30}" width="30" height="26" rx="2" fill="none" stroke="${OUTLINE}" stroke-width="1.4"/>`);
  }
  return parts.join("\n");
}

function dressBody(spec: GarmentDesignSpec, cx: number, pal: Palette, back: boolean): string {
  const shoulderY = 74;
  const aline = is(spec.silhouette, "a-line", "aline", "flare", "drape");
  const wrap = is(spec.silhouette, "wrap");
  const column = is(spec.silhouette, "column", "slip", "sheath", "straight");
  const knee = is(spec.length, "knee", "mini");
  const bottomY = knee ? 210 : 286;
  const topW = 116;
  const hemW = aline ? 176 : column ? 104 : 140;
  const half = topW / 2;
  const hemHalf = hemW / 2;
  const parts: string[] = [];
  parts.push(
    `<path d="M ${cx - half} ${shoulderY} L ${cx - half + 8} ${shoulderY + 60} L ${cx - hemHalf} ${bottomY} L ${cx + hemHalf} ${bottomY} L ${cx + half - 8} ${shoulderY + 60} L ${cx + half} ${shoulderY} Q ${cx} ${shoulderY - 12} ${cx - half} ${shoulderY} Z" fill="${pal.fill}" stroke="${OUTLINE}" stroke-width="2.2" stroke-linejoin="round"/>`,
  );
  parts.push(sleeves(spec, cx, shoulderY, topW, pal.fill));
  parts.push(neckline(spec, cx, shoulderY - 2, back));
  parts.push(`<path d="M ${cx - half + 10} ${shoulderY + 64} Q ${cx} ${shoulderY + 74} ${cx + half - 10} ${shoulderY + 64}" fill="none" stroke="${OUTLINE}" stroke-width="1.4" opacity="0.7"/>`);
  if (wrap && !back) {
    parts.push(`<path d="M ${cx - 30} ${shoulderY + 20} L ${cx + 24} ${shoulderY + 66} L ${cx + 26} ${bottomY - 20}" stroke="${OUTLINE}" stroke-width="1.6" fill="none"/>`);
  }
  return parts.join("\n");
}

function accessoryBody(spec: GarmentDesignSpec, cx: number, pal: Palette): string {
  return `<rect x="${cx - 64}" y="120" width="128" height="90" rx="8" fill="${pal.fill}" stroke="${OUTLINE}" stroke-width="2.2"/>
    <line x1="${cx - 64}" y1="200" x2="${cx + 64}" y2="200" stroke="${OUTLINE}" stroke-width="1.2" opacity="0.5"/>`;
}

function garment(spec: GarmentDesignSpec, cx: number, pal: Palette, back: boolean): string {
  switch (spec.category) {
    case "bottom":
      return bottomBody(spec, cx, pal, back);
    case "dress":
      return dressBody(spec, cx, pal, back);
    case "outerwear":
      return topBody(spec, cx, pal, back, { jacket: true });
    case "knitwear":
      return topBody(spec, cx, pal, back, { knit: true });
    case "accessory":
      return accessoryBody(spec, cx, pal);
    default:
      return topBody(spec, cx, pal, back);
  }
}

/**
 * Full FRONT + BACK garment-only concept sheet for one design spec.
 * 720×460 viewBox. Deterministic — identical spec ⇒ identical SVG.
 */
export function renderConceptSheet(spec: GarmentDesignSpec): string {
  const pal = palette(spec);
  const frontCx = 210;
  const backCx = 510;
  return `<svg viewBox="0 0 720 460" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(spec.productName)} concept sheet, front and back">
  <defs>
    <pattern id="lo-hatch" width="18" height="18" patternTransform="rotate(135)" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="0" y2="18" stroke="${HATCH}" stroke-width="8"/>
    </pattern>
  </defs>
  <rect width="720" height="460" fill="${GROUND}"/>
  <rect width="720" height="460" fill="url(#lo-hatch)"/>
  <g transform="translate(0,26)">
    ${garment(spec, frontCx, pal, false)}
    ${garment(spec, backCx, pal, true)}
  </g>
  <text x="${frontCx}" y="440" text-anchor="middle" font-family="ui-sans-serif,system-ui" font-size="13" font-weight="600" fill="#8E8E93" letter-spacing="1.5">FRONT</text>
  <text x="${backCx}" y="440" text-anchor="middle" font-family="ui-sans-serif,system-ui" font-size="13" font-weight="600" fill="#8E8E93" letter-spacing="1.5">BACK</text>
  <text x="20" y="30" font-family="ui-sans-serif,system-ui" font-size="12" font-weight="700" fill="#B25000">Mock concept — deterministic SVG · not a manufacturing drawing</text>
</svg>`;
}

/** A single technical flat (front OR back) for the spec view / draft spec. */
export function renderTechnicalFlat(spec: GarmentDesignSpec, side: "front" | "back"): string {
  const pal = palette(spec);
  return `<svg viewBox="0 0 320 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(spec.productName)} technical flat ${side}">
  <rect width="320" height="400" fill="#FFFFFF"/>
  <g transform="translate(-50,30)">${garment(spec, 210, pal, side === "back")}</g>
  <text x="160" y="388" text-anchor="middle" font-family="ui-sans-serif,system-ui" font-size="11" font-weight="600" fill="#8E8E93" letter-spacing="1.5">${side.toUpperCase()} · ${escapeXml(spec.styleId)}</text>
</svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === '"' ? "&quot;" : "&#39;",
  );
}

/** SVG string → data URI so an <img>/CSS background can render it directly. */
export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
