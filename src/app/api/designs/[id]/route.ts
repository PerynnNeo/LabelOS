import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api";
import { requireSession } from "@/lib/auth/require-session";
import { logActivity } from "@/lib/logging/activity";
import {
  getDesign,
  listRfqsByDesign,
  listSuppliers,
  updateDesign,
  type DesignPatch,
  type DesignRow,
  type RfqRow,
} from "@/lib/supabase/repositories";

/**
 * /api/designs/[id] (spec sections 16, 24).
 *
 * GET   — the design plus its RFQs, each annotated with its supplier name.
 * PATCH — validated status transitions (proposed → approved → in_development)
 *         and/or a shallow merge into the design brief JSONB.
 *
 * The design status column is free text (default "draft"); LabelOS treats
 * "draft" as the canonical initial "proposed" state so the transition rules
 * work regardless of what the gap designer stamped on creation.
 */
export const runtime = "nodejs";

const idSchema = z.uuid();

/** Allowed forward transitions in the design lifecycle. */
const DESIGN_TRANSITIONS: Record<string, readonly string[]> = {
  proposed: ["approved"],
  approved: ["in_development"],
  in_development: [],
};

/** Canonicalise the stored status so "draft" behaves as "proposed". */
function normalizeDesignStatus(status: string): string {
  return status === "draft" || status === "" ? "proposed" : status;
}

const patchSchema = z
  .object({
    status: z.enum(["proposed", "approved", "in_development"]).optional(),
    designBrief: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((obj) => obj.status !== undefined || obj.designBrief !== undefined, {
    message: "Provide a status and/or designBrief to update.",
  });

interface RfqWithSupplier extends RfqRow {
  supplierName: string;
}

interface DesignGetResponse {
  design: DesignRow;
  rfqs: RfqWithSupplier[];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiErrorHandling<DesignGetResponse>(async (requestId) => {
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

    const [rfqs, suppliers] = await Promise.all([
      listRfqsByDesign(id),
      listSuppliers(),
    ]);
    const supplierNames = new Map(suppliers.map((s) => [s.id, s.name]));
    const rfqsWithSupplier: RfqWithSupplier[] = rfqs.map((rfq) => ({
      ...rfq,
      supplierName: supplierNames.get(rfq.supplier_id) ?? "Unknown supplier",
    }));

    return apiOk<DesignGetResponse>(
      { design, rfqs: rfqsWithSupplier },
      requestId,
    );
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiErrorHandling<{ design: DesignRow }>(async (requestId) => {
    const session = await requireSession(request);
    if (!session.ok) {
      return apiError(
        "UNAUTHORIZED",
        "A valid session is required to update a design.",
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

    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(
        "VALIDATION_ERROR",
        "Provide a status (proposed | approved | in_development) and/or a designBrief object.",
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

    const { status, designBrief } = parsed.data;
    const patch: DesignPatch = {};

    if (status !== undefined) {
      const current = normalizeDesignStatus(design.status);
      const isNoop = status === current;
      const isAllowed =
        isNoop || (DESIGN_TRANSITIONS[current] ?? []).includes(status);
      if (!isAllowed) {
        await logActivity({
          actor: "user",
          action: "design.status.update",
          entityType: "design",
          entityId: id,
          inputSummary: `attempt ${current} → ${status}`,
          outputSummary: `rejected: invalid transition`,
          rawMetadata: { from: current, to: status, status: "error" },
        });
        return apiError(
          "STATE_INVALID",
          `A design in "${current}" cannot move to "${status}". Allowed next: ${
            (DESIGN_TRANSITIONS[current] ?? []).join(", ") || "none"
          }.`,
          { requestId },
        );
      }
      patch.status = status;
    }

    if (designBrief !== undefined) {
      const existingBrief =
        design.design_brief && typeof design.design_brief === "object"
          ? (design.design_brief as Record<string, unknown>)
          : {};
      patch.design_brief = { ...existingBrief, ...designBrief };
    }

    const updated = await updateDesign(id, patch);

    await logActivity({
      actor: "user",
      action: "design.update",
      entityType: "design",
      entityId: id,
      inputSummary: [
        status !== undefined ? `status → ${status}` : null,
        designBrief !== undefined ? "brief edited" : null,
      ]
        .filter(Boolean)
        .join("; "),
      outputSummary: "ok",
      rawMetadata: { status: "success" },
    });

    return apiOk<{ design: DesignRow }>({ design: updated }, requestId);
  });
}
