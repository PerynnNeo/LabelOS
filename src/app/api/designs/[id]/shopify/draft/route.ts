import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api";
import { requireSession } from "@/lib/auth/require-session";
import { logActivity } from "@/lib/logging/activity";
import {
  assertApprovalGranted,
  ApprovalRequiredError,
} from "@/lib/domain/approvals";
import { sanitizeHtml } from "@/lib/domain/html-sanitizer";
import { listingPayloadSchema, type ListingPayload } from "@/lib/domain/schemas";
import {
  JobAlreadyRunningError,
  runIdempotentJob,
} from "@/lib/jobs/runner";
import {
  ShopifyError,
  shopifyErrorToApiCode,
} from "@/lib/shopify/client";
import {
  getShopifyProvider,
  type DraftProductInput,
} from "@/lib/shopify/provider";
import {
  findApproval,
  getCollection,
  getDesign,
  listProducts,
  updateCollection,
  updateDesign,
  type DesignRow,
} from "@/lib/supabase/repositories";

/**
 * /api/designs/[id]/shopify/draft (spec section 21).
 *
 * GET  — preview the exact DraftProductInput that will be sent (never any
 *        credentials), the provider mode, and whether an approval exists.
 * POST — guarded, idempotent draft creation: listing present → no existing GID
 *        → approved CREATE_SHOPIFY_DRAFT approval → create the draft, upsert the
 *        seasonal collection (unpublished), add imported + new products, and
 *        persist both Shopify GIDs.
 *
 * Deterministic code owns identity, permissions, and execution; the provider
 * only performs the write.
 */
export const runtime = "nodejs";

const idSchema = z.uuid();

/** Approvals for a design use entityType "design". */
const APPROVAL_ENTITY_TYPE = "design";

/** Build the exact, credential-free Shopify draft payload from the listing. */
function buildDraftInput(
  design: DesignRow,
  listing: ListingPayload,
): DraftProductInput {
  const briefRaw =
    design.design_brief && typeof design.design_brief === "object"
      ? (design.design_brief as Record<string, unknown>)
      : {};
  const manualImageUrl =
    typeof briefRaw.manualImageUrl === "string" ? briefRaw.manualImageUrl : null;
  const imageUrl =
    manualImageUrl ?? design.rendered_image_path ?? listing.imageUrl ?? null;

  return {
    title: listing.title,
    descriptionHtml: sanitizeHtml(listing.htmlDescription),
    vendor: listing.vendor,
    productType: listing.productType,
    tags: listing.tags,
    price: listing.price,
    sizeOptions: listing.sizeOptions,
    imageUrl,
    metafields: [
      {
        namespace: "labelos",
        key: "design_id",
        type: "single_line_text_field",
        value: design.id,
      },
      {
        namespace: "labelos",
        key: "material_information_status",
        type: "single_line_text_field",
        value: listing.materialInformationStatus,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// GET — payload preview
// ---------------------------------------------------------------------------

interface DraftPreviewResponse {
  payload: DraftProductInput | null;
  mode: "mock" | "client_credentials";
  approval: { exists: boolean; status: string | null };
  ready: boolean;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiErrorHandling<DraftPreviewResponse>(async (requestId) => {
    const session = await requireSession(request);
    if (!session.ok) {
      return apiError("UNAUTHORIZED", "A valid session is required.", {
        requestId,
      });
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

    const provider = getShopifyProvider();
    const approval = await findApproval(
      APPROVAL_ENTITY_TYPE,
      id,
      "CREATE_SHOPIFY_DRAFT",
    );

    const listingResult = listingPayloadSchema.safeParse(design.listing_payload);
    const payload = listingResult.success
      ? buildDraftInput(design, listingResult.data)
      : null;

    return apiOk<DraftPreviewResponse>(
      {
        payload,
        mode: provider.mode,
        approval: {
          exists: approval !== null,
          status: approval?.status ?? null,
        },
        ready: listingResult.success && design.shopify_product_gid === null,
      },
      requestId,
    );
  });
}

// ---------------------------------------------------------------------------
// POST — create the draft (guarded + idempotent)
// ---------------------------------------------------------------------------

interface DraftCreateResponse {
  productGid: string;
  collectionGid: string | null;
  adminUrl: string | null;
  mode: "mock" | "client_credentials";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiErrorHandling<DraftCreateResponse>(async (requestId) => {
    const session = await requireSession(request);
    if (!session.ok) {
      return apiError(
        "UNAUTHORIZED",
        "A valid session is required to create a Shopify draft.",
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

    // Guard 1 — a listing must exist.
    const listingResult = listingPayloadSchema.safeParse(design.listing_payload);
    if (!listingResult.success) {
      return apiError(
        "STATE_INVALID",
        "Generate the product listing before creating a Shopify draft.",
        { requestId },
      );
    }

    // Guard 2 — never create a second draft for the same design.
    if (design.shopify_product_gid) {
      return apiError(
        "CONFLICT",
        `This design already has a Shopify draft (${design.shopify_product_gid}). Nothing was created.`,
        { requestId },
      );
    }

    // Guard 3 — an approved CREATE_SHOPIFY_DRAFT approval is required.
    const approval = await findApproval(
      APPROVAL_ENTITY_TYPE,
      id,
      "CREATE_SHOPIFY_DRAFT",
    );
    try {
      assertApprovalGranted(approval, "CREATE_SHOPIFY_DRAFT");
    } catch (error) {
      if (error instanceof ApprovalRequiredError) {
        await logActivity({
          actor: "user",
          action: "shopify.draft.create",
          entityType: "design",
          entityId: id,
          inputSummary: "create Shopify draft",
          outputSummary: `blocked: ${error.message}`,
          rawMetadata: { status: "error", reason: "APPROVAL_REQUIRED" },
        });
        return apiError("APPROVAL_REQUIRED", error.message, { requestId });
      }
      throw error;
    }

    const provider = getShopifyProvider();
    const draftInput = buildDraftInput(design, listingResult.data);
    const collection = await getCollection(design.collection_id);

    try {
      const { result, reused } = await runIdempotentJob<DraftCreateResponse>(
        {
          jobType: "shopify-draft",
          entityType: "design",
          entityId: id,
          idempotencyKey: `shopify-draft:${id}`,
        },
        async () => {
          // Create the draft product.
          const { productGid, adminUrl } =
            await provider.createDraftProduct(draftInput);
          await updateDesign(id, { shopify_product_gid: productGid });

          // Upsert the seasonal collection (kept unpublished) and add the
          // imported existing products plus the new product.
          let collectionGid: string | null = null;
          if (collection) {
            const storyHtml = sanitizeHtml(
              `<p>${collection.curation_summary?.notes ?? collection.brief.commercialObjective ?? collection.name}</p>`,
            );
            const upserted = await provider.upsertCollection({
              title: collection.name,
              descriptionHtml: storyHtml,
            });
            collectionGid = upserted.collectionGid;

            const importedProducts = await listProducts({ source: "shopify" });
            const importedGids = importedProducts
              .map((p) => p.shopify_gid)
              .filter((gid): gid is string => Boolean(gid));
            const productGids = [...new Set([...importedGids, productGid])];
            await provider.addProductsToCollection(collectionGid, productGids);

            await updateCollection(collection.id, {
              shopify_collection_gid: collectionGid,
            });
          }

          await logActivity({
            actor: "user",
            action: "shopify.draft.create",
            entityType: "design",
            entityId: id,
            provider: "shopify",
            inputSummary: `create draft "${draftInput.title}" (${provider.mode})`,
            outputSummary: `ok — product ${productGid}${collectionGid ? `, collection ${collectionGid}` : ""}`,
            rawMetadata: { status: "success", productGid, collectionGid, mode: provider.mode },
          });

          return { productGid, collectionGid, adminUrl, mode: provider.mode };
        },
      );

      // Reuse path (a prior completed job): return the persisted GIDs.
      if (reused || !result) {
        const fresh = await getDesign(id);
        const freshCollection = collection
          ? await getCollection(collection.id)
          : null;
        return apiOk<DraftCreateResponse>(
          {
            productGid: fresh?.shopify_product_gid ?? "",
            collectionGid: freshCollection?.shopify_collection_gid ?? null,
            adminUrl: null,
            mode: provider.mode,
          },
          requestId,
        );
      }

      return apiOk<DraftCreateResponse>(result, requestId);
    } catch (error) {
      if (error instanceof JobAlreadyRunningError) {
        return apiError(
          "JOB_RUNNING",
          "A Shopify draft is already being created for this design. Wait for it to finish.",
          { requestId },
        );
      }
      if (error instanceof ShopifyError) {
        await logActivity({
          actor: "user",
          action: "shopify.draft.create",
          entityType: "design",
          entityId: id,
          provider: "shopify",
          inputSummary: `create draft "${draftInput.title}"`,
          outputSummary: `error (${error.category}): ${error.message}`,
          rawMetadata: { status: "error", category: error.category },
        });
        return apiError(shopifyErrorToApiCode(error), error.message, {
          requestId,
          details: error.details,
        });
      }
      throw error;
    }
  });
}
