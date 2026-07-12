import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  apiError,
  apiOk,
  withApiErrorHandling,
  type ApiErrorCode,
} from "@/lib/api";
import { requireSession } from "@/lib/auth/require-session";
import { logActivity } from "@/lib/logging/activity";
import { getAnthropicProvider } from "@/lib/anthropic/provider";
import { AnthropicCallError } from "@/lib/anthropic/structured";
import { sanitizeHtml } from "@/lib/domain/html-sanitizer";
import {
  brandProfileSchema,
  newDesignSchema,
  type ListingPayload,
} from "@/lib/domain/schemas";
import {
  buildListingRequest,
  finalizeListing,
  listingSchema,
} from "@/lib/agents/listing-writer";
import {
  getAppSettings,
  getCollection,
  getDesign,
  updateDesign,
} from "@/lib/supabase/repositories";

/**
 * POST /api/designs/[id]/listing (spec section 20).
 *
 * Runs the Listing Writer agent from verified product data, forces the Shopify
 * status to DRAFT, marks material information "unverified" unless the tech pack
 * BOM has verified rows, sanitises the HTML description through the allowlist,
 * and stores the result. The listing image is the manual replacement when set,
 * else the rendered flat-sketch PNG.
 */
export const runtime = "nodejs";

const idSchema = z.uuid();

function anthropicErrorToApi(error: AnthropicCallError): {
  code: ApiErrorCode;
  message: string;
} {
  switch (error.category) {
    case "not_configured":
      return { code: "PROVIDER_NOT_CONFIGURED", message: error.message };
    case "rate_limit":
      return { code: "RATE_LIMITED", message: error.message };
    default:
      return { code: "PROVIDER_ERROR", message: error.message };
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiErrorHandling<{ listing: ListingPayload }>(async (requestId) => {
    const session = await requireSession(request);
    if (!session.ok) {
      return apiError(
        "UNAUTHORIZED",
        "A valid session is required to draft a listing.",
        { requestId },
      );
    }

    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return apiError("VALIDATION_ERROR", "Invalid design id.", { requestId });
    }

    const design = await getDesign(id);
    if (!design) {
      return apiError("NOT_FOUND", `No design found with id ${id}.`, {
        requestId,
      });
    }

    const briefResult = newDesignSchema.safeParse(design.design_brief);
    if (!briefResult.success) {
      return apiError(
        "STATE_INVALID",
        "This design does not yet have a complete design brief to write a listing from.",
        { requestId },
      );
    }
    const brief = briefResult.data;

    const techPack = design.tech_pack;
    if (!techPack) {
      return apiError(
        "STATE_INVALID",
        "Draft the tech pack before writing the listing — the listing sizing and material status derive from it.",
        { requestId },
      );
    }

    const settings = await getAppSettings();
    const brandProfileResult = brandProfileSchema.safeParse(
      settings?.brand_profile,
    );
    if (!brandProfileResult.success) {
      return apiError(
        "STATE_INVALID",
        "Brand settings are missing or incomplete. Seed or configure the brand profile before writing a listing.",
        { requestId },
      );
    }

    const collection = await getCollection(design.collection_id);
    const collectionStory =
      collection?.curation_summary?.notes ??
      collection?.brief.commercialObjective ??
      "";

    // Manual replacement wins over the rendered flat-sketch PNG.
    const briefRaw =
      design.design_brief && typeof design.design_brief === "object"
        ? (design.design_brief as Record<string, unknown>)
        : {};
    const manualImageUrl =
      typeof briefRaw.manualImageUrl === "string"
        ? briefRaw.manualImageUrl
        : null;
    const imageUrl = manualImageUrl ?? design.rendered_image_path ?? null;

    const { system, user, schemaName } = buildListingRequest({
      design: brief,
      techPack,
      brandProfile: brandProfileResult.data,
      collectionStory,
      imageUrl,
      currency: settings?.currency,
    });

    const provider = getAnthropicProvider();
    let listing: ListingPayload;
    try {
      const { data } = await provider.structuredCall({
        schema: listingSchema,
        schemaName,
        system,
        user,
        maxTokens: 8192,
        route: "designs.listing",
        entityId: id,
      });

      const hasVerifiedBom = techPack.billOfMaterials.some(
        (row) => row.verified,
      );

      listing = {
        ...finalizeListing(data),
        // Unverified unless the tech pack BOM actually has verified rows.
        materialInformationStatus: hasVerifiedBom
          ? data.materialInformationStatus
          : "unverified",
        htmlDescription: sanitizeHtml(data.htmlDescription),
        imageUrl,
        status: "DRAFT",
      };
    } catch (error) {
      if (error instanceof AnthropicCallError) {
        const mapped = anthropicErrorToApi(error);
        await logActivity({
          actor: "listing-writer",
          action: "designs.listing",
          entityType: "design",
          entityId: id,
          inputSummary: `listing for "${brief.name}"`,
          outputSummary: `error (${error.category}): ${error.message}`,
          rawMetadata: { status: "error", errorCategory: error.category },
        });
        return apiError(mapped.code, mapped.message, { requestId });
      }
      throw error;
    }

    const updated = await updateDesign(id, { listing_payload: listing });

    await logActivity({
      actor: "listing-writer",
      action: "designs.listing",
      entityType: "design",
      entityId: id,
      inputSummary: `listing for "${brief.name}"`,
      outputSummary: `ok — ${listing.title} (${listing.status}, material ${listing.materialInformationStatus})`,
      rawMetadata: { status: "success" },
    });

    return apiOk<{ listing: ListingPayload }>(
      { listing: updated.listing_payload ?? listing },
      requestId,
    );
  });
}
