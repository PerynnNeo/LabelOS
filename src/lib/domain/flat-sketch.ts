import type { NewDesign } from "@/lib/domain/schemas";

/**
 * Deterministic flat-sketch generator.
 *
 * Claude never generates images. This module renders one of five original,
 * parametric SVG garment templates (top / trouser / skirt / dress / jacket)
 * from an approved design brief. The output is a clean 600x700 line drawing:
 * the garment body is filled with the approved colour and outlined in a dark
 * ink stroke, with neckline, sleeve-length, garment-length and simple
 * pocket/closure variations applied from the brief.
 *
 * Pure and unit-testable: no I/O, no randomness, no external state. The server
 * later rasterises the returned SVG to PNG with `sharp`.
 */

/** Visible disclaimer rendered on every sketch and shown in the UI. */
export const SKETCH_DISCLAIMER =
  "Communication aid — not a technical drawing";

/** Fields the renderer needs from a design brief. */
export type FlatSketchInput = Pick<
  NewDesign,
  | "sketchTemplate"
  | "colourHex"
  | "neckline"
  | "sleeveLength"
  | "garmentLength"
  | "name"
>;

const DEFAULT_SKETCH_FILL = "#d9d4cc";
const OUTLINE = "#33312e";
const BACKGROUND = "#fbfaf7";
const DISCLAIMER_COLOR = "#6b675f";

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

type GarmentLength = FlatSketchInput["garmentLength"];
type SleeveLength = FlatSketchInput["sleeveLength"];
type Neckline = "crew" | "v" | "collar";

const TOP_HEM: Record<GarmentLength, number> = {
  cropped: 360,
  regular: 470,
  longline: 560,
};
const DRESS_HEM: Record<GarmentLength, number> = {
  cropped: 470,
  regular: 600,
  longline: 660,
};
const SKIRT_HEM: Record<GarmentLength, number> = {
  cropped: 430,
  regular: 540,
  longline: 620,
};
const TROUSER_HEM: Record<GarmentLength, number> = {
  cropped: 520,
  regular: 610,
  longline: 655,
};
const JACKET_HEM: Record<GarmentLength, number> = {
  cropped: 380,
  regular: 480,
  longline: 560,
};

/** Mirror an x coordinate across the vertical centre line (x = 300). */
function mirror(x: number): number {
  return 600 - x;
}

function safeHex(hex: string): string {
  const trimmed = (hex ?? "").trim();
  return HEX_RE.test(trimmed) ? trimmed : DEFAULT_SKETCH_FILL;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Map the free-text neckline field to one of the three drawable variants. */
function normalizeNeckline(raw: string): Neckline {
  const value = (raw ?? "").toLowerCase();
  if (value.includes("collar") || value.includes("polo") || value.includes("shirt")) {
    return "collar";
  }
  if (value.includes("v-neck") || value.includes("v neck") || value.includes("vee") || /\bv\b/.test(value)) {
    return "v";
  }
  return "crew";
}

export function buildFlatSketchSvg(design: FlatSketchInput): string {
  const fill = safeHex(design.colourHex);
  const neckline = normalizeNeckline(design.neckline);
  const sleeve = design.sleeveLength;
  const length = design.garmentLength;

  const fillPath = (d: string): string =>
    `<path d="${d}" fill="${fill}" stroke="${OUTLINE}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
  const linePath = (d: string): string =>
    `<path d="${d}" fill="none" stroke="${OUTLINE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  const button = (cx: number, cy: number): string =>
    `<circle cx="${cx}" cy="${cy}" r="5" fill="none" stroke="${OUTLINE}" stroke-width="2"/>`;
  const pocket = (x: number, y: number, w: number, h: number): string =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${fill}" stroke="${OUTLINE}" stroke-width="2"/>`;

  // Neckline segment drawn from the right neck point (335,152) back to the
  // left neck point (265,152) as part of the torso outline.
  const necklineSegment = (): string => {
    switch (neckline) {
      case "v":
        return " L 300,214 L 265,152";
      case "collar":
        return " Q 300,176 265,152";
      default:
        return " Q 300,186 265,152";
    }
  };

  const collarFlaps = (): string[] =>
    neckline === "collar"
      ? [
          fillPath("M 300,148 L 262,150 L 281,190 Z"),
          fillPath("M 300,148 L 338,150 L 319,190 Z"),
          linePath("M 300,150 L 300,188"),
        ]
      : [];

  // Sleeves are drawn behind the torso so the shoulder seam overlaps cleanly.
  const sleeves = (): string[] => {
    if (sleeve === "sleeveless") {
      return [
        linePath("M 195,158 Q 206,205 215,250"),
        linePath("M 405,158 Q 394,205 385,250"),
      ];
    }
    const cuff =
      sleeve === "short"
        ? { ox1: 150, oy1: 236, ox2: 178, oy2: 258 }
        : sleeve === "elbow"
          ? { ox1: 150, oy1: 300, ox2: 182, oy2: 318 }
          : { ox1: 158, oy1: 430, ox2: 190, oy2: 446 };
    const left = `M 195,158 L ${cuff.ox1},${cuff.oy1} L ${cuff.ox2},${cuff.oy2} L 215,250 Z`;
    const right = `M 405,158 L ${mirror(cuff.ox1)},${cuff.oy1} L ${mirror(cuff.ox2)},${cuff.oy2} L 385,250 Z`;
    return [fillPath(left), fillPath(right)];
  };

  const elements: string[] = [];

  switch (design.sketchTemplate) {
    case "top": {
      const hemY = TOP_HEM[length];
      const torso =
        `M 265,152 L 195,158 L 215,250 L 215,${hemY} L 385,${hemY} ` +
        `L 385,250 L 405,158 L 335,152` +
        necklineSegment() +
        " Z";
      elements.push(
        ...sleeves(),
        fillPath(torso),
        ...collarFlaps(),
        linePath(`M 224,${hemY - 12} L 376,${hemY - 12}`),
      );
      break;
    }

    case "dress": {
      const hemY = DRESS_HEM[length];
      const body =
        `M 265,152 L 195,158 L 215,250 L 222,362 L 175,${hemY} ` +
        `L 425,${hemY} L 378,362 L 385,250 L 405,158 L 335,152` +
        necklineSegment() +
        " Z";
      elements.push(
        ...sleeves(),
        fillPath(body),
        ...collarFlaps(),
        linePath("M 222,362 L 378,362"),
        linePath(`M 300,362 L 300,${hemY - 6}`),
        linePath(`M 258,382 L 214,${hemY - 8}`),
        linePath(`M 342,382 L 386,${hemY - 8}`),
      );
      break;
    }

    case "skirt": {
      const hemY = SKIRT_HEM[length];
      const body =
        `M 232,152 L 368,152 L 430,${hemY - 14} ` +
        `Q 300,${hemY + 18} 170,${hemY - 14} Z`;
      elements.push(
        fillPath(body),
        linePath("M 232,184 L 368,184"),
        linePath(`M 300,184 L 300,${hemY - 2}`),
        linePath(`M 264,190 L 236,${hemY - 8}`),
        linePath(`M 336,190 L 364,${hemY - 8}`),
      );
      break;
    }

    case "trouser": {
      const hemY = TROUSER_HEM[length];
      const body =
        `M 218,152 L 382,152 L 378,${hemY} L 332,${hemY} ` +
        `L 300,360 L 268,${hemY} L 222,${hemY} Z`;
      elements.push(
        fillPath(body),
        linePath("M 218,186 L 382,186"),
        linePath("M 300,152 L 300,360"),
        linePath("M 306,190 L 306,246"),
        linePath("M 236,190 Q 258,206 252,236"),
        linePath("M 364,190 Q 342,206 348,236"),
        linePath(`M 250,206 L 247,${hemY - 6}`),
        linePath(`M 350,206 L 353,${hemY - 6}`),
      );
      break;
    }

    case "jacket": {
      const hemY = JACKET_HEM[length];
      const torso =
        `M 265,152 L 195,158 L 215,250 L 215,${hemY} L 385,${hemY} ` +
        `L 385,250 L 405,158 L 335,152 Q 300,176 265,152 Z`;
      elements.push(
        ...sleeves(),
        fillPath(torso),
        // back collar crescent
        fillPath("M 268,150 Q 300,138 332,150 Q 300,152 268,150 Z"),
        // open lapels (closure detail)
        fillPath("M 300,152 L 262,152 L 300,250 Z"),
        fillPath("M 300,152 L 338,152 L 300,250 Z"),
        linePath(`M 300,250 L 300,${hemY}`),
        button(300, 270),
        button(300, 315),
        button(300, 360),
        pocket(210, hemY - 104, 72, 78),
        pocket(318, hemY - 104, 72, 78),
      );
      break;
    }
  }

  const title = escapeXml(design.name?.trim() ? design.name.trim() : "Untitled design");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 700" width="600" height="700" ` +
    `role="img" aria-label="${title} flat sketch">` +
    `<title>${title} — flat sketch</title>` +
    `<rect x="0" y="0" width="600" height="700" fill="${BACKGROUND}"/>` +
    elements.join("") +
    `<text x="300" y="672" text-anchor="middle" ` +
    `font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" ` +
    `font-size="18" fill="${DISCLAIMER_COLOR}">${escapeXml(SKETCH_DISCLAIMER)}</text>` +
    `</svg>`
  );
}
