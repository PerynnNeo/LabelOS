import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api";
import { requireSession } from "@/lib/auth/require-session";
import { logActivity } from "@/lib/logging/activity";
import {
  getApproval,
  updateApproval,
  type ApprovalRow,
} from "@/lib/supabase/repositories";

/**
 * PATCH /api/approvals/[id] (spec sections 13, 24).
 *
 * Record a human decision on a pending approval: set status to approved or
 * rejected, store the decision note, and stamp approved_at on approval. Only a
 * pending approval can be decided.
 */
export const runtime = "nodejs";

const idSchema = z.uuid();

const patchSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().max(2000).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiErrorHandling<{ approval: ApprovalRow }>(async (requestId) => {
    const session = await requireSession(request);
    if (!session.ok) {
      return apiError(
        "UNAUTHORIZED",
        "A valid session is required to decide an approval.",
        { requestId },
      );
    }

    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return apiError("VALIDATION_ERROR", "Invalid approval id.", { requestId });
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
        "Provide a decision of 'approved' or 'rejected' (and an optional note).",
        {
          requestId,
          details: parsed.error.issues.map(
            (i) => `${i.path.join(".")}: ${i.message}`,
          ),
        },
      );
    }

    const approval = await getApproval(id);
    if (!approval) {
      return apiError("NOT_FOUND", `No approval found with id ${id}.`, {
        requestId,
      });
    }

    if (approval.status !== "pending") {
      return apiError(
        "STATE_INVALID",
        `This approval has already been ${approval.status}. Decisions are final; create a new approval if you need to change course.`,
        { requestId },
      );
    }

    const { decision, note } = parsed.data;
    const updated = await updateApproval(id, {
      status: decision,
      decision_note: note ?? "",
      approved_at: decision === "approved" ? new Date().toISOString() : null,
    });

    await logActivity({
      actor: "user",
      action: "approval.decide",
      entityType: approval.entity_type,
      entityId: approval.entity_id,
      inputSummary: `${approval.action} → ${decision}`,
      outputSummary: `ok — approval ${id} ${decision}`,
      rawMetadata: { status: "success", action: approval.action, decision },
    });

    return apiOk<{ approval: ApprovalRow }>({ approval: updated }, requestId);
  });
}
