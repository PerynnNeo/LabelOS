import type { ImageBlockParam } from "@anthropic-ai/sdk/resources/messages";
import type { GarmentDesignSpec } from "@/lib/domain/design-schemas";
import { visualQaSchema } from "@/lib/domain/design-schemas";
import { buildVisionContent } from "@/lib/anthropic/vision";
import type { AnthropicUserContent } from "@/lib/anthropic/structured";
import { withGrounding } from "./common";

/**
 * LabelOS Design Critic / Visual QA — Agent 6 (image-generation spec §10 Agent
 * 6, §11.7).
 *
 * A VISION call: it compares the structured {@link GarmentDesignSpec} against the
 * generated concept image and returns a {@link visualQaSchema} verdict — does the
 * image depict the specified category, are front and back consistent, which key
 * construction details are present or missing, are there forbidden elements
 * (people, mannequin, text, watermark, logo, extra garments), is the image
 * usable, and a recommendation of accept / regenerate / owner_review.
 *
 * The user content is the generated image block followed by the expected design
 * facts (image first, per the vision guidance).
 */

export { visualQaSchema };

export const VISUAL_QA_SCHEMA_NAME = "visual_qa";
export const DESIGN_CRITIC_PROMPT_VERSION = "design-critic@1";

const DESIGN_CRITIC_ROLE = `You are the LabelOS Design Critic performing visual QA. You are shown a generated
concept image for a new garment and the structured design facts it is meant to
depict. Judge only whether the image matches those facts — you are not grading
taste.

Check and report:
- categoryMatches: does the image show the specified garment category (e.g. a
  trouser vs a skirt, a dress vs separates)?
- frontBackConsistent: if front and back are both shown, do they represent the
  same garment (same colour, construction, proportions)?
- keyDetailsPresent / keyDetailsMissing: which specified construction features
  (neckline/collar, sleeve length, closure, pockets, hem, length, silhouette)
  are visibly present, and which required ones are missing or wrong.
- forbiddenElements: list any person, face, body, mannequin, hanger, extra
  garment, accessory, text, caption, watermark, or logo visible in the image.
- imageUsable + recommendation: accept a clean image that shows the right
  category with the key features and no forbidden elements; recommend
  "regenerate" for a clear category or key-feature mismatch or a forbidden
  element; use "owner_review" when it is borderline.
- confidence: 0–1 for how sure you are of this assessment.

Report exactly what you can see; do not assume a detail is present because the
spec asks for it.`;

export const DESIGN_CRITIC_SYSTEM = withGrounding(DESIGN_CRITIC_ROLE);

export interface VisualQaRequest {
  system: string;
  user: AnthropicUserContent;
  schemaName: string;
  promptVersion: string;
}

function list(values: string[], fallback = "none"): string {
  return values.length > 0 ? values.join(", ") : fallback;
}

/**
 * Build the visual-QA request. `imageBlock` is the generated concept image
 * (base64 content block from the storage/vision layer).
 */
export function buildVisualQaRequest(input: {
  spec: GarmentDesignSpec;
  imageBlock: ImageBlockParam;
}): VisualQaRequest {
  const { spec, imageBlock } = input;

  const text = [
    "Compare this generated concept image against the design facts below and return the Visual QA structured output.",
    "",
    "Expected design facts:",
    `- category: ${spec.category}`,
    `- product: ${spec.productName} (${spec.styleId})`,
    `- silhouette: ${spec.silhouette} | fit: ${spec.fit} | length: ${spec.length}`,
    `- neckline: ${spec.neckline ?? "n/a"} | collar: ${spec.collar ?? "n/a"}`,
    `- sleeves: ${spec.sleeveLength ?? "n/a"}${spec.sleeveShape ? `, ${spec.sleeveShape}` : ""}`,
    `- closures: ${list(spec.closures)}`,
    `- pockets: ${list(spec.pockets)}`,
    `- hem: ${spec.hem}`,
    `- construction details: ${list(spec.constructionDetails)}`,
    `- this is meant to be a garment-only sheet: no people, no mannequin, no text, no logo.`,
    "",
    "Return: categoryMatches, frontBackConsistent, keyDetailsPresent, keyDetailsMissing, forbiddenElements, imageUsable, confidence (0–1), recommendation (accept | regenerate | owner_review), explanation.",
  ].join("\n");

  return {
    system: DESIGN_CRITIC_SYSTEM,
    user: buildVisionContent(imageBlock, text),
    schemaName: VISUAL_QA_SCHEMA_NAME,
    promptVersion: DESIGN_CRITIC_PROMPT_VERSION,
  };
}
