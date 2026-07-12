import type { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { requireSession } from "@/lib/auth/require-session";
import { runSeed, type SeedResult } from "@/lib/seed/run-seed";

/**
 * POST /api/seed — load the demo dataset.
 *
 * Requires a valid session and DEMO_MODE=true. Idempotent: safe to call more
 * than once (existing rows are skipped). Touches Supabase storage + sharp, so
 * it runs on the Node.js runtime.
 */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return withApiErrorHandling<SeedResult>(async (requestId) => {
    const session = await requireSession(request);
    if (!session.ok) {
      return apiError(
        "UNAUTHORIZED",
        "A valid session is required to seed demo data.",
        { requestId },
      );
    }

    if (!getEnv().DEMO_MODE) {
      return apiError(
        "STATE_INVALID",
        "Seeding is only available when DEMO_MODE=true. Enable demo mode in your environment and restart the server.",
        { requestId },
      );
    }

    const result = await runSeed();
    return apiOk<SeedResult>(result, requestId);
  });
}
