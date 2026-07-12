import type { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api";
import { integrationStatus, type IntegrationStatus } from "@/lib/env";
import { requireSession } from "@/lib/auth/require-session";
import { SupabaseNotConfiguredError } from "@/lib/supabase/admin";
import {
  countProducts,
  isMissingMigrationError,
  listCollections,
} from "@/lib/supabase/repositories";

/**
 * GET /api/integrations/status (spec sections 23, 26).
 *
 * Returns the coarse integration status flags plus catalog counts. When
 * Supabase is not configured (or the migration has not been run) the counts
 * fall back to zeros and `supabase` is reported false — never a 500.
 */
export const runtime = "nodejs";

interface Counts {
  products: number;
  analysed: number;
  collections: number;
}

type StatusResponse = IntegrationStatus & { counts: Counts };

export async function GET(request: NextRequest) {
  return withApiErrorHandling<StatusResponse>(async (requestId) => {
    const session = await requireSession(request);
    if (!session.ok) {
      return apiError("UNAUTHORIZED", "A valid session is required.", {
        requestId,
      });
    }

    const status = integrationStatus();
    let counts: Counts = { products: 0, analysed: 0, collections: 0 };
    let supabase = status.supabase;

    try {
      const [products, analysed, collections] = await Promise.all([
        countProducts(),
        countProducts({ analysisStatus: "complete" }),
        listCollections(),
      ]);
      counts = { products, analysed, collections: collections.length };
    } catch (error) {
      if (
        error instanceof SupabaseNotConfiguredError ||
        isMissingMigrationError(error)
      ) {
        counts = { products: 0, analysed: 0, collections: 0 };
        supabase = false;
      } else {
        throw error;
      }
    }

    return apiOk<StatusResponse>({ ...status, supabase, counts }, requestId);
  });
}
