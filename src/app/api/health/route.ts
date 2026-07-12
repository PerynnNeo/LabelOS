import { apiOk, withApiErrorHandling } from "@/lib/api";
import { getEnv } from "@/lib/env";

/**
 * GET /api/health — public liveness check.
 * Returns coarse mode flags only; never secrets or configuration values.
 */
export async function GET() {
  return withApiErrorHandling(async (requestId) => {
    const env = getEnv();
    return apiOk(
      {
        status: "ok" as const,
        version: "0.1.0",
        demoMode: env.DEMO_MODE,
        shopifyMode: env.SHOPIFY_MODE,
      },
      requestId,
    );
  });
}
