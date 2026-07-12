import type { GarmentCategory } from "@/lib/domain/schemas";

/**
 * Seed catalog placeholder art.
 *
 * `generateGarmentSvg` returns a small, original flat-garment SVG used as the
 * placeholder product image for the demo catalog. No copyrighted brand assets:
 * every shape is drawn here from simple vectors. The garment body is filled
 * with the product colour on a soft card background.
 *
 * Pure: deterministic in (category, colour, index) with no I/O. The seeder
 * rasterises the result to PNG with `sharp`.
 */

const DEFAULT_FILL = "#c9c2b4";
const OUTLINE = "#3a382f";
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const CARD_TINTS = ["#f4f1ea", "#f1efe9", "#f5f2ec"];

function safeHex(hex: string): string {
  const trimmed = (hex ?? "").trim();
  return HEX_RE.test(trimmed) ? trimmed : DEFAULT_FILL;
}

/**
 * Render a placeholder garment for a catalog category.
 *
 * @param category product category driving the silhouette
 * @param colorHex garment fill colour (#rgb / #rrggbb; neutral fallback)
 * @param index    catalog position; used only for subtle card-tint variation
 */
export function generateGarmentSvg(
  category: GarmentCategory,
  colorHex: string,
  index: number,
): string {
  const fill = safeHex(colorHex);
  const card = CARD_TINTS[((index % CARD_TINTS.length) + CARD_TINTS.length) % CARD_TINTS.length];

  const fillPath = (d: string): string =>
    `<path d="${d}" fill="${fill}" stroke="${OUTLINE}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>`;
  const linePath = (d: string): string =>
    `<path d="${d}" fill="none" stroke="${OUTLINE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  const button = (cx: number, cy: number): string =>
    `<circle cx="${cx}" cy="${cy}" r="4" fill="none" stroke="${OUTLINE}" stroke-width="3"/>`;

  const parts: string[] = [];

  switch (category) {
    case "top": {
      parts.push(
        fillPath(
          "M 172,118 L 150,122 L 108,150 L 120,178 L 150,175 L 150,300 " +
            "L 250,300 L 250,175 L 280,178 L 292,150 L 250,122 L 228,118 " +
            "Q 200,142 172,118 Z",
        ),
        linePath("M 158,292 L 242,292"),
      );
      break;
    }

    case "bottom": {
      parts.push(
        fillPath("M 150,110 L 250,110 L 258,330 L 214,330 L 200,205 L 186,330 L 142,330 Z"),
        linePath("M 150,140 L 250,140"),
        linePath("M 205,142 L 205,190"),
        linePath("M 162,145 Q 178,158 174,182"),
        linePath("M 238,145 Q 222,158 226,182"),
      );
      break;
    }

    case "dress": {
      parts.push(
        fillPath(
          "M 172,118 L 150,122 L 120,175 L 150,178 L 156,210 L 112,332 " +
            "L 288,332 L 244,210 L 250,178 L 280,175 L 250,122 L 228,118 " +
            "Q 200,142 172,118 Z",
        ),
        linePath("M 156,210 L 244,210"),
        linePath("M 200,214 L 200,326"),
      );
      break;
    }

    case "outerwear": {
      parts.push(
        fillPath(
          "M 172,120 L 150,124 L 110,150 L 122,180 L 150,176 L 150,320 " +
            "L 250,320 L 250,176 L 278,180 L 290,150 L 250,124 L 228,120 " +
            "Q 200,140 172,120 Z",
        ),
        fillPath("M 200,122 L 168,124 L 200,196 Z"),
        fillPath("M 200,122 L 232,124 L 200,196 Z"),
        linePath("M 200,196 L 200,320"),
        button(200, 216),
        button(200, 250),
        button(200, 284),
        `<rect x="150" y="252" width="46" height="48" rx="5" fill="${fill}" stroke="${OUTLINE}" stroke-width="3"/>`,
        `<rect x="204" y="252" width="46" height="48" rx="5" fill="${fill}" stroke="${OUTLINE}" stroke-width="3"/>`,
      );
      break;
    }

    case "accessory": {
      // A softly draped stole with a knot and fringe.
      parts.push(
        fillPath("M 156,96 Q 200,84 244,96 L 244,300 Q 200,312 156,300 Z"),
        linePath("M 156,150 Q 200,138 244,150"),
        linePath("M 156,214 Q 200,226 244,214"),
      );
      const fringe: string[] = [];
      for (let x = 162; x <= 238; x += 12) {
        fringe.push(linePath(`M ${x},302 L ${x},324`));
      }
      parts.push(...fringe);
      break;
    }

    case "footwear":
    case "other":
    default: {
      // Neutral folded-garment placeholder for uncategorised items.
      parts.push(
        `<rect x="120" y="120" width="160" height="160" rx="14" fill="${fill}" stroke="${OUTLINE}" stroke-width="4"/>`,
        linePath("M 120,180 L 280,180"),
        linePath("M 200,120 L 200,280"),
      );
      break;
    }
  }

  const label = `${category} placeholder`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400" ` +
    `role="img" aria-label="${label}">` +
    `<title>${label}</title>` +
    `<rect x="0" y="0" width="400" height="400" rx="24" fill="${card}"/>` +
    parts.join("") +
    `</svg>`
  );
}
