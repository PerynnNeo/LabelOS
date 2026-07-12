import type { NextRequest } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api";
import { requireSession } from "@/lib/auth/require-session";
import { logActivity } from "@/lib/logging/activity";
import { buildFlatSketchSvg, SKETCH_DISCLAIMER } from "@/lib/domain/flat-sketch";
import { newDesignSchema } from "@/lib/domain/schemas";
import { uploadPublicAsset } from "@/lib/supabase/storage";
import { getDesign, updateDesign } from "@/lib/supabase/repositories";

/**
 * /api/designs/[id]/render (spec section 17).
 *
 * POST — build a deterministic vector flat sketch from the design brief, store
 *        the SVG, rasterise it to PNG with sharp, upload to the public bucket,
 *        and save the fetchable URL as the design's rendered image.
 * PUT  — manually replace the rendered image with an owner-supplied http(s)
 *        URL, stored on the design brief as `manualImageUrl` (this takes
 *        precedence downstream in the listing and Shopify draft).
 *
 * Claude never generates images — the sketch is a communication aid, not a
 * technical drawing (see the disclaimer rendered on every sketch).
 */
export const runtime = "nodejs";

const idSchema = z.uuid();

const putSchema = z.object({
  imageUrl: z
    .url()
    .refine((value) => /^https?:\/\//i.test(value), {
      message: "Image URL must start with http:// or https://.",
    }),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiErrorHandling<{ imageUrl: string; disclaimer: string }>(
    async (requestId) => {
      const session = await requireSession(request);
      if (!session.ok) {
        return apiError(
          "UNAUTHORIZED",
          "A valid session is required to render a flat sketch.",
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
          "This design does not yet have a complete design brief to render a sketch from.",
          { requestId },
        );
      }

      const svg = buildFlatSketchSvg(briefResult.data);
      const png = await sharp(Buffer.from(svg)).png().toBuffer();
      const imageUrl = await uploadPublicAsset(
        `designs/${id}.png`,
        png,
        "image/png",
      );

      await updateDesign(id, {
        flat_sketch_svg: svg,
        rendered_image_path: imageUrl,
      });

      await logActivity({
        actor: "flat-sketch",
        action: "designs.render",
        entityType: "design",
        entityId: id,
        inputSummary: `render ${briefResult.data.sketchTemplate} sketch`,
        outputSummary: `ok — PNG uploaded (${png.byteLength} bytes)`,
        rawMetadata: { status: "success", template: briefResult.data.sketchTemplate },
      });

      return apiOk<{ imageUrl: string; disclaimer: string }>(
        { imageUrl, disclaimer: SKETCH_DISCLAIMER },
        requestId,
      );
    },
  );
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiErrorHandling<{ imageUrl: string }>(async (requestId) => {
    const session = await requireSession(request);
    if (!session.ok) {
      return apiError(
        "UNAUTHORIZED",
        "A valid session is required to replace the design image.",
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

    const parsed = putSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(
        "VALIDATION_ERROR",
        "Provide a valid http(s) imageUrl.",
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

    const existingBrief =
      design.design_brief && typeof design.design_brief === "object"
        ? (design.design_brief as Record<string, unknown>)
        : {};

    await updateDesign(id, {
      design_brief: { ...existingBrief, manualImageUrl: parsed.data.imageUrl },
    });

    await logActivity({
      actor: "user",
      action: "designs.render.replace",
      entityType: "design",
      entityId: id,
      inputSummary: "manual image replacement",
      outputSummary: "ok — manualImageUrl stored on design brief",
      rawMetadata: { status: "success" },
    });

    return apiOk<{ imageUrl: string }>(
      { imageUrl: parsed.data.imageUrl },
      requestId,
    );
  });
}
