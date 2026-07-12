import type { ImageBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { normalizeCategory } from "@/lib/domain/category-normalizer";
import { garmentAnalysisSchema } from "@/lib/domain/schemas";
import { buildVisionContent } from "@/lib/anthropic/vision";
import type { AnthropicUserContent } from "@/lib/anthropic/structured";
import {
  AGENT_SCHEMA_NAMES,
  PROMPT_VERSIONS,
  formatProductRecord,
  withGrounding,
  type ProductRecordInput,
} from "./common";

/**
 * LabelOS Garment Librarian (spec section 8, Part VI — "Garment Librarian").
 *
 * Builds the vision request that turns one garment image plus its catalog
 * metadata into a {@link garmentAnalysisSchema} structured analysis. The system
 * prompt is the Part VI text verbatim, with the shared grounding block
 * appended; the user message is `[image block, text]` with the product's id,
 * title and metadata (and a machine-readable HINTS marker for the mock).
 */

const GARMENT_LIBRARIAN_ROLE = `You are the LabelOS Garment Librarian. Analyse the garment image and supplied
catalog metadata piece by piece. Focus on visible product characteristics that
affect styling and merchandising. Exact fabric composition, construction,
measurements, stock, and pricing are verified only when included in metadata.
A visual material guess must be marked unverified with a confidence and caveat.
Do not analyse the wearer. Return the Garment Analysis schema only.

Scoring: express \`formality\`, \`materialObservation.confidence\` and the overall
\`confidence\` as numbers between 0 and 1. If the image is blurry, cropped, or
too dark to judge a field, lower the relevant confidence and add a note to
\`warnings\` rather than guessing.`;

export const GARMENT_ANALYST_SYSTEM = withGrounding(GARMENT_LIBRARIAN_ROLE);

/** Re-export of the domain schema so routes import the agent's contract here. */
export const analysisSchema = garmentAnalysisSchema;

export interface GarmentAnalysisProductInput {
  id: string;
  title: string;
  productType?: string | null;
  sku?: string | null;
  price?: number | null;
  currency?: string | null;
  inventoryQuantity?: number | null;
  description?: string | null;
  /** Known colour names from metadata, when any. */
  colors?: string[] | null;
}

export interface GarmentAnalysisRequest {
  system: string;
  user: AnthropicUserContent;
  schemaName: string;
  promptVersion: string;
}

/**
 * Build the Garment Librarian request for one product.
 *
 * The product's category for the grounded record is normalised from its
 * imported `productType` (analysis has not run yet); Claude then returns the
 * authoritative category in its structured output.
 */
export function buildGarmentAnalysisRequest(input: {
  product: GarmentAnalysisProductInput;
  imageBlock: ImageBlockParam;
}): GarmentAnalysisRequest {
  const { product, imageBlock } = input;

  const record: ProductRecordInput = {
    id: product.id,
    title: product.title,
    category: normalizeCategory({ productType: product.productType ?? null }),
    sku: product.sku ?? null,
    price: product.price ?? null,
    currency: product.currency ?? null,
    inventoryQuantity: product.inventoryQuantity ?? null,
    description: product.description ?? null,
    colors: product.colors ?? null,
    analysis: null,
  };

  const text = [
    "Analyse this single garment. Use the metadata only to confirm facts you cannot verify from the image; never invent SKUs, prices, inventory, or fabric composition.",
    "",
    "Catalog record:",
    formatProductRecord(record),
    "",
    "Return the Garment Analysis structured output for this product.",
  ].join("\n");

  return {
    system: GARMENT_ANALYST_SYSTEM,
    user: buildVisionContent(imageBlock, text),
    schemaName: AGENT_SCHEMA_NAMES.garmentAnalysis,
    promptVersion: PROMPT_VERSIONS.garmentLibrarian,
  };
}
