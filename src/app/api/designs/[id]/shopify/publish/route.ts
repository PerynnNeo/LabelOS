import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api";
import { requireSession } from "@/lib/auth/require-session";
import { logActivity } from "@/lib/logging/activity";
import {
  assertApprovalGranted,
  ApprovalRequiredError,
} from "@/lib/domain/approvals";
import { ShopifyError, shopifyErrorToApiCode } from "@/lib/shopify/client";
import { getShopifyProvider } from "@/lib/shopify/provider";
import { findApproval, getDesign } from "@/lib/supabase/repositories";

/**
 * /api/designs/[id]/shopify/publish (spec section 21 — public publish).
 *
 * GET  — list the store's publications so the owner can choose a channel.
 * POST — publish the design's draft product, only after: a saved product GID,
 *        an approved PUBLISH_SHOPIFY approval, the literal confirmation
 *        "PUBLISH", and a publicationId that exists in the store.
 */
export const runtime = "nodejs";

const idSchema = z.uuid();

const APPROVAL_ENTITY_TYPE = "design";

const postSchema = z.object({
  publicationId: z.string().min(1),
  confirmation: z.string(),
});

// ---------------------------------------------------------------------------
// GET — list publications
// ---------------------------------------------------------------------------

interface PublicationsResponse {
  publications: Array<{ id: string; name: string }>;
  mode: "mock" | "client_credentials";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiErrorHandling<PublicationsResponse>(async (requestId) => {
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
    try {
      const publications = await provider.listPublications();
      return apiOk<PublicationsResponse>(
        { publications, mode: provider.mode },
        requestId,
      );
    } catch (error) {
      if (error instanceof ShopifyError) {
        return apiError(shopifyErrorToApiCode(error), error.message, {
          requestId,
          details: error.details,
        });
      }
      throw error;
    }
  });
}

// ---------------------------------------------------------------------------
// POST — publish
// ---------------------------------------------------------------------------

interface PublishResponse {
  published: true;
  mode: "mock" | "client_credentials";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiErrorHandling<PublishResponse>(async (requestId) => {
    const session = await requireSession(request);
    if (!session.ok) {
      return apiError(
        "UNAUTHORIZED",
        "A valid session is required to publish.",
        { requestId },
      );
    }

    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return apiError("VALIDATION_ERROR", "Invalid design id.", { requestId });
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return apiError("VALIDATION_ERROR", "Request body must be JSON.", {
        requestId,
      });
    }

    const parsed = postSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(
        "VALIDATION_ERROR",
        "Provide a publicationId and the confirmation string.",
        {
          requestId,
          details: parsed.error.issues.map(
            (i) => `${i.path.join(".")}: ${i.message}`,
          ),
        },
      );
    }

    const design = await getDesign(id);
    if (!design) {
      return apiError("NOT_FOUND", `No design found with id ${id}.`, {
        requestId,
      });
    }

    // Guard — a draft product must exist before it can be published.
    if (!design.shopify_product_gid) {
      return apiError(
        "STATE_INVALID",
        "This design has no Shopify draft product yet. Create the draft before publishing.",
        { requestId },
      );
    }
    const productGid = design.shopify_product_gid;

    // Guard — an approved PUBLISH_SHOPIFY approval is required.
    const approval = await findApproval(
      APPROVAL_ENTITY_TYPE,
      id,
      "PUBLISH_SHOPIFY",
    );
    try {
      assertApprovalGranted(approval, "PUBLISH_SHOPIFY");
    } catch (error) {
      if (error instanceof ApprovalRequiredError) {
        await logActivity({
          actor: "user",
          action: "shopify.publish",
          entityType: "design",
          entityId: id,
          inputSummary: "publish to Shopify",
          outputSummary: `blocked: ${error.message}`,
          rawMetadata: { status: "error", reason: "APPROVAL_REQUIRED" },
        });
        return apiError("APPROVAL_REQUIRED", error.message, { requestId });
      }
      throw error;
    }

    // Guard — the exact typed confirmation.
    if (parsed.data.confirmation !== "PUBLISH") {
      return apiError(
        "VALIDATION_ERROR",
        'Type "PUBLISH" exactly to confirm publishing to your public sales channel.',
        { requestId },
      );
    }

    const provider = getShopifyProvider();
    try {
      // Guard — the publicationId must exist in the store.
      const publications = await provider.listPublications();
      if (publications.length === 0) {
        return apiError(
          "VALIDATION_ERROR",
          "No publication found on this store. Add an Online Store sales channel in Shopify before publishing.",
          { requestId },
        );
      }
      if (!publications.some((p) => p.id === parsed.data.publicationId)) {
        return apiError(
          "VALIDATION_ERROR",
          "The selected publicationId does not match any publication on this store.",
          {
            requestId,
            details: { available: publications.map((p) => p.id) },
          },
        );
      }

      await provider.publishProduct(productGid, parsed.data.publicationId);

      await logActivity({
        actor: "user",
        action: "shopify.publish",
        entityType: "design",
        entityId: id,
        provider: "shopify",
        inputSummary: `publish ${productGid} to ${parsed.data.publicationId} (${provider.mode})`,
        outputSummary: "ok — published",
        rawMetadata: { status: "success", mode: provider.mode },
      });

      return apiOk<PublishResponse>(
        { published: true, mode: provider.mode },
        requestId,
      );
    } catch (error) {
      if (error instanceof ShopifyError) {
        await logActivity({
          actor: "user",
          action: "shopify.publish",
          entityType: "design",
          entityId: id,
          provider: "shopify",
          inputSummary: `publish ${productGid}`,
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
