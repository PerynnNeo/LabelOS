import type { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { requireSession } from "@/lib/auth/require-session";
import { ShopifyError, shopifyErrorToApiCode } from "@/lib/shopify/client";
import { getShopifyProvider } from "@/lib/shopify/provider";
import { logActivity } from "@/lib/logging/activity";
import { upsertProductByShopifyGid } from "@/lib/supabase/repositories";

/**
 * POST /api/shopify/import (spec sections 9, 10, 24).
 *
 * Imports up to MAX_CATALOG_PRODUCTS products from Shopify (real store in
 * client_credentials mode, deterministic mock otherwise). Each product is
 * upserted by its Shopify GID so repeated imports never create duplicates; the
 * raw provider node is stored in raw_metadata. No customer or order data is
 * fetched. An activity-log entry records the outcome.
 */
export const runtime = "nodejs";

interface ImportResponse {
  imported: number;
  updated: number;
  skipped: number;
}

export async function POST(request: NextRequest) {
  return withApiErrorHandling<ImportResponse>(async (requestId) => {
    const session = await requireSession(request);
    if (!session.ok) {
      return apiError(
        "UNAUTHORIZED",
        "A valid session is required to import products.",
        { requestId },
      );
    }

    const env = getEnv();
    const provider = getShopifyProvider();
    const providerName = provider.mode === "mock" ? "shopify-mock" : "shopify";

    let products;
    try {
      products = await provider.importProducts(env.MAX_CATALOG_PRODUCTS);
    } catch (error) {
      if (error instanceof ShopifyError) {
        await logActivity({
          actor: "shopify-import",
          action: "shopify.import",
          entityType: "product",
          provider: providerName,
          inputSummary: `import up to ${env.MAX_CATALOG_PRODUCTS} products`,
          outputSummary: `failed — ${error.message}`,
          rawMetadata: { status: "error", category: error.category },
        });
        return apiError(shopifyErrorToApiCode(error), error.message, {
          requestId,
        });
      }
      throw error;
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const product of products) {
      if (!product.gid) {
        skipped += 1;
        continue;
      }
      try {
        const { created } = await upsertProductByShopifyGid({
          source: "shopify",
          shopify_gid: product.gid,
          external_id: product.gid,
          title: product.title,
          description: product.description,
          vendor: product.vendor,
          product_type: product.productType,
          sku: product.sku ?? "",
          price: product.price ?? 0,
          inventory_quantity: product.inventoryQuantity ?? 0,
          public_image_url: product.imageUrl,
          status: "active",
          raw_metadata: { shopify: product.raw },
          analysis_status: "pending",
        });
        if (created) imported += 1;
        else updated += 1;
      } catch (error) {
        skipped += 1;
        console.error(
          `[shopify.import] failed to upsert product ${product.gid}`,
          error,
        );
      }
    }

    await logActivity({
      actor: "shopify-import",
      action: "shopify.import",
      entityType: "product",
      provider: providerName,
      inputSummary: `import up to ${env.MAX_CATALOG_PRODUCTS} products (${provider.mode})`,
      outputSummary: `imported ${imported}, updated ${updated}, skipped ${skipped}`,
      rawMetadata: { status: "success", mode: provider.mode },
    });

    return apiOk<ImportResponse>({ imported, updated, skipped }, requestId);
  });
}
