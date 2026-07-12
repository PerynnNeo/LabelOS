import type { Costing, NewDesign, TechPack } from "@/lib/domain/schemas";
import { TECH_PACK_DRAFT_STATUS, techPackSchema } from "@/lib/domain/schemas";
import {
  AGENT_SCHEMA_NAMES,
  MARKER_TAGS,
  PROMPT_VERSIONS,
  marker,
  withGrounding,
} from "./common";

/**
 * LabelOS Tech Pack Writer (spec section 18, Part VI — "Tech Pack Writer").
 *
 * Produces a DRAFT technical-package outline for review by a qualified
 * technical designer and manufacturer. It never fabricates exact measurements,
 * fabric tests, tolerances, care, or certifications — measurement cells stay
 * "TBD". The status is always DRAFT_REQUIRES_HUMAN_VERIFICATION: the prompt
 * instructs it and {@link finalizeTechPack} re-asserts it in code after
 * validation.
 */

const TECH_PACK_WRITER_ROLE = `You are the LabelOS Product Development Assistant. Convert an approved concept
into a structured DRAFT technical-package outline for review by a qualified
technical designer and manufacturer. Do not fabricate exact measurements,
fabric tests, tolerances, care instructions, or certifications. Use TBD where
information is not supplied. Include unresolved questions and quality checks.
The output must state that it is not production-authorised.

The status field MUST be exactly "${TECH_PACK_DRAFT_STATUS}". Every measurement
cell you are unsure of MUST be the string "TBD". Bill-of-materials rows you have
not verified MUST have verified=false.`;

export const TECH_PACK_WRITER_SYSTEM = withGrounding(TECH_PACK_WRITER_ROLE);

export { techPackSchema };
export const techPackWriterSchema = techPackSchema;

/** Marker payload the mock tech-pack writer reads to draft without a model. */
interface DesignMarker {
  name: string;
  category: string;
  silhouette: string;
  colour: string;
  sketchTemplate: string;
  sizeRange: string[];
}

export interface TechPackRequest {
  system: string;
  user: string;
  schemaName: string;
  promptVersion: string;
}

const DEFAULT_SIZE_RANGE = ["XS", "S", "M", "L", "XL"];

export function buildTechPackRequest(input: {
  design: NewDesign;
  costing: Costing;
  sizeRange?: string[];
}): TechPackRequest {
  const { design, costing } = input;
  const sizeRange = input.sizeRange ?? DEFAULT_SIZE_RANGE;

  const payload: DesignMarker = {
    name: design.name,
    category: design.category,
    silhouette: design.silhouette,
    colour: design.colour,
    sketchTemplate: design.sketchTemplate,
    sizeRange,
  };

  const user = [
    `Draft a technical package for this approved concept: "${design.name}" (${design.category}).`,
    "",
    "Design brief:",
    `- Silhouette: ${design.silhouette}`,
    `- Colour: ${design.colour} (${design.colourHex})`,
    `- Construction direction: ${design.constructionDirection}`,
    `- Fabric requirements: ${design.fabricRequirements.join("; ") || "none stated"}`,
    `- Assumed (unverified) data: ${design.assumedData.join("; ") || "none"}`,
    `- Open questions from design: ${design.openQuestions.join("; ") || "none"}`,
    "",
    `Costing context (for reference only — do NOT restate supplier prices or invent costs): the maximum factory cost budget is ${costing.currency} ${costing.detailedEstimate.maximumFactoryCost.toFixed(2)} per unit.`,
    `Target size range: ${sizeRange.join(", ")}.`,
    "",
    `  ${marker(MARKER_TAGS.design, payload)}`,
    "",
    `Return the Tech Pack structured output. status MUST be "${TECH_PACK_DRAFT_STATUS}". Leave measurements as "TBD", mark unverified BOM rows verified=false, and include unresolvedQuestions, assumptions, qualityChecks, and a disclaimer that this is not production-authorised.`,
  ].join("\n");

  return {
    system: TECH_PACK_WRITER_SYSTEM,
    user,
    schemaName: AGENT_SCHEMA_NAMES.techPack,
    promptVersion: PROMPT_VERSIONS.techPackWriter,
  };
}

/**
 * Re-assert the draft status in code after validation, regardless of what the
 * model returned. Idempotent: the schema already enforces the literal, so this
 * is a defensive belt-and-braces guarantee.
 */
export function finalizeTechPack(data: TechPack): TechPack {
  return { ...data, status: TECH_PACK_DRAFT_STATUS };
}
