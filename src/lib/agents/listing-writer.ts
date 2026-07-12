import type {
  BrandProfile,
  ListingPayload,
  NewDesign,
  TechPack,
} from "@/lib/domain/schemas";
import { listingPayloadSchema } from "@/lib/domain/schemas";
import {
  AGENT_SCHEMA_NAMES,
  MARKER_TAGS,
  PROMPT_VERSIONS,
  formatBrandProfile,
  marker,
  withGrounding,
} from "./common";

/**
 * LabelOS E-commerce Listing Writer (spec section 20, Part VI — "Listing
 * Writer").
 *
 * Produces brand-consistent product copy from verified data only. It must not
 * make unsupported material, sustainability, durability, care, delivery,
 * scarcity, or certification claims, and the Shopify status defaults to DRAFT —
 * the prompt instructs it and {@link finalizeListing} re-asserts it in code.
 */

const LISTING_WRITER_ROLE = `You are the LabelOS E-commerce Listing Writer. Create clear, accurate,
brand-consistent product copy from verified product data. Do not make unsupported
material, sustainability, durability, care, delivery, scarcity, or certification
claims. Mark missing data for human review. Default the product to DRAFT.

The status field MUST be exactly "DRAFT". If fabric composition is not verified,
set materialInformationStatus to "unverified" or "pending_review" and keep
careInformation to safe, non-specific placeholders. Never invent certifications
or guaranteed delivery dates.`;

export const LISTING_WRITER_SYSTEM = withGrounding(LISTING_WRITER_ROLE);

export { listingPayloadSchema };
export const listingSchema = listingPayloadSchema;

/** Marker payload the mock listing writer reads to draft copy without a model. */
interface ListingMarker {
  name: string;
  price: number;
  currency: string;
  vendor: string;
  productType: string;
  sizeOptions: string[];
  imageUrl: string | null;
}

export interface ListingRequest {
  system: string;
  user: string;
  schemaName: string;
  promptVersion: string;
}

const CATEGORY_TO_PRODUCT_TYPE: Record<string, string> = {
  top: "Top",
  bottom: "Bottoms",
  dress: "Dress",
  outerwear: "Outerwear",
  footwear: "Footwear",
  accessory: "Accessory",
  other: "Apparel",
};

const DEFAULT_SIZE_OPTIONS = ["XS", "S", "M", "L", "XL"];

export function buildListingRequest(input: {
  design: NewDesign;
  techPack: TechPack;
  brandProfile: BrandProfile;
  collectionStory: string;
  imageUrl: string | null;
  vendor?: string;
  currency?: string;
  sizeOptions?: string[];
}): ListingRequest {
  const { design, techPack, brandProfile, collectionStory, imageUrl } = input;
  const vendor = input.vendor ?? "LabelOS";
  const currency = input.currency ?? brandProfile.typicalPriceRange.currency;
  const sizeOptions =
    input.sizeOptions ??
    (techPack.sizeRange.length > 0 ? techPack.sizeRange : DEFAULT_SIZE_OPTIONS);
  const productType = CATEGORY_TO_PRODUCT_TYPE[design.category] ?? "Apparel";

  const payload: ListingMarker = {
    name: design.name,
    price: design.targetRetailPrice,
    currency,
    vendor,
    productType,
    sizeOptions,
    imageUrl,
  };

  const materialLine =
    design.fabricRequirements.length > 0
      ? `Fabric direction (UNVERIFIED — do not state as fact): ${design.fabricRequirements.join("; ")}`
      : "Fabric composition is not yet verified.";

  const user = [
    `Write Shopify listing copy for the new product "${design.name}" (${design.category}).`,
    "",
    "Brand voice:",
    formatBrandProfile(brandProfile),
    "",
    "Verified product facts:",
    `- Name: ${design.name}`,
    `- Silhouette: ${design.silhouette}`,
    `- Colour: ${design.colour}`,
    `- Price: ${currency} ${design.targetRetailPrice.toFixed(2)}`,
    `- Size options: ${sizeOptions.join(", ")}`,
    `- Vendor: ${vendor}`,
    `- ${materialLine}`,
    "",
    "Collection story (for tone; may inform collectionStory field):",
    collectionStory.trim() || "(none supplied)",
    imageUrl ? `\nApproved image URL: ${imageUrl}` : "\nNo approved image yet.",
    "",
    `  ${marker(MARKER_TAGS.listing, payload)}`,
    "",
    'Return the Listing structured output. status MUST be "DRAFT". Omit or clearly flag any unverified fabric/care claim, and set materialInformationStatus honestly.',
  ].join("\n");

  return {
    system: LISTING_WRITER_SYSTEM,
    user,
    schemaName: AGENT_SCHEMA_NAMES.listingPayload,
    promptVersion: PROMPT_VERSIONS.listingWriter,
  };
}

/**
 * Re-assert the DRAFT status in code after validation. Idempotent — the schema
 * already enforces the literal; this guarantees it regardless of model output.
 */
export function finalizeListing(data: ListingPayload): ListingPayload {
  return { ...data, status: "DRAFT" };
}
