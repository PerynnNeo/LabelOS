import type { GarmentDesignSpec } from "@/lib/domain/design-schemas";

/**
 * Deterministic image-prompt builder (image spec §11.2, §11.3).
 *
 * Claude produces the structured {@link GarmentDesignSpec}; the actual
 * text-to-image prompt is built here from those fields, never taken as loose
 * prose from the model. Garments only — no people, mannequins, text, or brand
 * imitation.
 */

function gsmRange(spec: GarmentDesignSpec): string {
  const { targetWeightGsmMin: lo, targetWeightGsmMax: hi } = spec.primaryMaterialRequirement;
  if (lo && hi) return `${lo}–${hi} gsm`;
  if (hi) return `~${hi} gsm`;
  if (lo) return `~${lo} gsm`;
  return "mid-weight";
}

function primaryColour(spec: GarmentDesignSpec): { name: string; hex: string } {
  const c = spec.colourways.find((x) => x.role === "primary") ?? spec.colourways[0];
  return { name: c?.name ?? "sand", hex: c?.hex ?? "#D9CDB8" };
}

function list(v: string[], fallback = "none"): string {
  return v.length > 0 ? v.join(", ") : fallback;
}

export function buildConceptSheetPrompt(spec: GarmentDesignSpec): string {
  const colour = primaryColour(spec);
  const m = spec.primaryMaterialRequirement;
  return `Professional apparel design concept sheet for a new ${spec.category}.
Show one isolated garment with FRONT VIEW and BACK VIEW side by side.
No human model, no body, no mannequin, no hanger, no accessories, no extra garments.
Neutral warm-white studio background.

Design:
- product: ${spec.productName}
- silhouette: ${spec.silhouette}
- fit: ${spec.fit}
- length: ${spec.length}
- neckline: ${spec.neckline ?? "n/a"}
- collar: ${spec.collar ?? "n/a"}
- sleeves: ${spec.sleeveLength ?? "n/a"}, ${spec.sleeveShape ?? "n/a"}
- closures: ${list(spec.closures)}
- pockets: ${list(spec.pockets)}
- hem: ${spec.hem}
- construction details: ${list(spec.constructionDetails)}
- fabric appearance: ${m.handFeel}, ${m.drape}, approximately ${gsmRange(spec)}
- main colour: ${colour.name} ${colour.hex}

Visual style:
clean premium fashion product development render, accurate garment construction,
sharp edges, realistic fabric behaviour, restrained styling, high-end e-commerce clarity.

Important:
front and back must clearly represent the same garment.
No lettering, no captions, no watermark, no logo, no branding, no printed words.`;
}

export function buildPackshotPrompt(
  spec: GarmentDesignSpec,
  side: "front" | "back",
): string {
  const colour = primaryColour(spec);
  return `Isolated e-commerce product shot of a new ${spec.category}, ${side} view${side === "front" ? " (slight three-quarter allowed)" : ""}.
One garment only — no model, no body, no mannequin, no hanger, no text, no logo.
Plain warm-white studio background.
Garment: ${spec.productName}. Silhouette ${spec.silhouette}, fit ${spec.fit}, length ${spec.length}.
Main colour ${colour.name} ${colour.hex}. Fabric: ${spec.primaryMaterialRequirement.handFeel}, ${spec.primaryMaterialRequirement.drape}.
Clean premium product-development render, accurate construction, realistic fabric. No lettering or watermark.`;
}

export const CONCEPT_NEGATIVE_PROMPT =
  "person, face, body, child, mannequin, hanger, accessories, shoes, bag, extra garment, " +
  "text, letters, label, watermark, logo, distorted clothing, duplicate sleeves, " +
  "missing sleeve, inconsistent front and back, cropped garment, busy background";
