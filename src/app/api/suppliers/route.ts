import type { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api";
import { requireSession } from "@/lib/auth/require-session";
import { listSuppliers, type SupplierRow } from "@/lib/supabase/repositories";

/**
 * GET /api/suppliers (spec section 19).
 *
 * Returns the supplier board — leads only, never verified factories. This route
 * is session-protected; supplier emails are never exposed on the public
 * lookbook, only here behind authentication.
 */
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return withApiErrorHandling<{ suppliers: SupplierRow[] }>(async (requestId) => {
    const session = await requireSession(request);
    if (!session.ok) {
      return apiError("UNAUTHORIZED", "A valid session is required.", {
        requestId,
      });
    }

    const suppliers = await listSuppliers();
    return apiOk<{ suppliers: SupplierRow[] }>({ suppliers }, requestId);
  });
}
