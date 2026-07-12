import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api";
import { requireSession } from "@/lib/auth/require-session";
import { logActivity } from "@/lib/logging/activity";
import {
  approvalActionSchema,
  approvalStatusSchema,
} from "@/lib/domain/schemas";
import {
  findApproval,
  insertApproval,
  listApprovals,
  type ApprovalFilter,
  type ApprovalRow,
} from "@/lib/supabase/repositories";

/**
 * /api/approvals (spec sections 13, 21, 24).
 *
 * GET  — list approval records, optionally filtered by entityType, entityId,
 *        or status.
 * POST — create a pending approval for an expensive/public action. Idempotent:
 *        an existing pending record for the same (entityType, entityId, action)
 *        is returned instead of creating a duplicate.
 */
export const runtime = "nodejs";

const postSchema = z.object({
  entityType: z.string().min(1).max(60),
  entityId: z.uuid(),
  action: approvalActionSchema,
});

export async function GET(request: NextRequest) {
  return withApiErrorHandling<{ approvals: ApprovalRow[] }>(async (requestId) => {
    const session = await requireSession(request);
    if (!session.ok) {
      return apiError("UNAUTHORIZED", "A valid session is required.", {
        requestId,
      });
    }

    const url = request.nextUrl;
    const filter: ApprovalFilter = {};

    const entityType = url.searchParams.get("entityType");
    if (entityType) filter.entityType = entityType;

    const entityId = url.searchParams.get("entityId");
    if (entityId) {
      if (!z.uuid().safeParse(entityId).success) {
        return apiError("VALIDATION_ERROR", "entityId must be a UUID.", {
          requestId,
        });
      }
      filter.entityId = entityId;
    }

    const status = url.searchParams.get("status");
    if (status) {
      const parsedStatus = approvalStatusSchema.safeParse(status);
      if (!parsedStatus.success) {
        return apiError(
          "VALIDATION_ERROR",
          "status must be one of: pending, approved, rejected.",
          { requestId },
        );
      }
      filter.status = parsedStatus.data;
    }

    const approvals = await listApprovals(filter);
    return apiOk<{ approvals: ApprovalRow[] }>({ approvals }, requestId);
  });
}

export async function POST(request: NextRequest) {
  return withApiErrorHandling<{ approval: ApprovalRow; created: boolean }>(
    async (requestId) => {
      const session = await requireSession(request);
      if (!session.ok) {
        return apiError(
          "UNAUTHORIZED",
          "A valid session is required to create an approval.",
          { requestId },
        );
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
          "Provide entityType, a UUID entityId, and a valid action (CREATE_SHOPIFY_DRAFT | PUBLISH_SHOPIFY | APPROVE_DESIGN).",
          {
            requestId,
            details: parsed.error.issues.map(
              (i) => `${i.path.join(".")}: ${i.message}`,
            ),
          },
        );
      }

      const { entityType, entityId, action } = parsed.data;

      // Dedupe: return an existing pending approval rather than duplicating.
      const existing = await findApproval(
        entityType,
        entityId,
        action,
        "pending",
      );
      if (existing) {
        return apiOk<{ approval: ApprovalRow; created: boolean }>(
          { approval: existing, created: false },
          requestId,
        );
      }

      const approval = await insertApproval({
        entity_type: entityType,
        entity_id: entityId,
        action,
        status: "pending",
      });

      await logActivity({
        actor: "user",
        action: "approval.create",
        entityType,
        entityId,
        inputSummary: `request approval: ${action}`,
        outputSummary: `ok — pending approval ${approval.id}`,
        rawMetadata: { status: "success", action },
      });

      return apiOk<{ approval: ApprovalRow; created: boolean }>(
        { approval, created: true },
        requestId,
      );
    },
  );
}
