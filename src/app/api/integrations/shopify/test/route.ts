import type { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api";
import { requireSession } from "@/lib/auth/require-session";
import { ShopifyError, shopifyErrorToApiCode } from "@/lib/shopify/client";
import { getShopifyProvider } from "@/lib/shopify/provider";

/**
 * POST /api/integrations/shopify/test (spec sections 10, 25, 26).
 *
 * Runs the provider's `shop` connection test. In SHOPIFY_MODE=mock the mock
 * provider returns stable fake shop details; in client_credentials mode it
 * exchanges credentials and queries the real store. ShopifyError categories map
 * to friendly, secret-free messages; the access token is never returned.
 */
export const runtime = "nodejs";

interface ShopifyTestResponse {
  shopName: string;
  domain: string;
  currency: string;
  mode: "mock" | "client_credentials";
}

export async function POST(request: NextRequest) {
  return withApiErrorHandling<ShopifyTestResponse>(async (requestId) => {
    const session = await requireSession(request);
    if (!session.ok) {
      return apiError("UNAUTHORIZED", "A valid session is required.", {
        requestId,
      });
    }

    const provider = getShopifyProvider();
    try {
      const connection = await provider.testConnection();
      return apiOk<ShopifyTestResponse>(
        { ...connection, mode: provider.mode },
        requestId,
      );
    } catch (error) {
      if (error instanceof ShopifyError) {
        return apiError(shopifyErrorToApiCode(error), error.message, {
          requestId,
        });
      }
      throw error;
    }
  });
}
