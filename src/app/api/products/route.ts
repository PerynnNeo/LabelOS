import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api";
import { requireSession } from "@/lib/auth/require-session";
import { normalizeCategory } from "@/lib/domain/category-normalizer";
import {
  analysisStatusSchema,
  garmentCategorySchema,
  productSourceSchema,
} from "@/lib/domain/schemas";
import {
  insertProduct,
  listProducts,
  type ProductRow,
} from "@/lib/supabase/repositories";

/**
 * /api/products (spec sections 9, 24).
 *
 * GET  — list catalog products with optional filters (category, analysisStatus,
 *        source, inStock). Source/analysisStatus are pushed to the query;
 *        category and inStock are applied in memory (category derives from the
 *        analysis/product-type via the deterministic normaliser).
 * POST — create an upload-sourced product from the upload form. The image was
 *        already uploaded via a signed URL; imagePath references that object.
 */
export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET — list
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  source: productSourceSchema.optional(),
  analysisStatus: analysisStatusSchema.optional(),
  category: garmentCategorySchema.optional(),
  inStock: z.enum(["true", "false"]).optional(),
});

export async function GET(request: NextRequest) {
  return withApiErrorHandling<{ products: ProductRow[] }>(async (requestId) => {
    const session = await requireSession(request);
    if (!session.ok) {
      return apiError("UNAUTHORIZED", "A valid session is required.", {
        requestId,
      });
    }

    const parsed = listQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid product filter.", {
        requestId,
        details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }

    const { source, analysisStatus, category, inStock } = parsed.data;

    let products = await listProducts({ source, analysisStatus });

    if (category) {
      products = products.filter(
        (product) =>
          normalizeCategory({
            productType: product.product_type,
            analysisCategory: product.analysis?.category ?? null,
          }) === category,
      );
    }
    if (inStock === "true") {
      products = products.filter((product) => product.inventory_quantity > 0);
    } else if (inStock === "false") {
      products = products.filter((product) => product.inventory_quantity <= 0);
    }

    return apiOk<{ products: ProductRow[] }>({ products }, requestId);
  });
}

// ---------------------------------------------------------------------------
// POST — create (upload source)
// ---------------------------------------------------------------------------

const createProductSchema = z.object({
  title: z.string().min(1).max(300),
  sku: z.string().max(120).default(""),
  productType: z.string().max(120).default(""),
  price: z.coerce.number().nonnegative().default(0),
  inventoryQuantity: z.coerce.number().int().nonnegative().default(0),
  description: z.string().max(5000).default(""),
  imagePath: z.string().min(1).max(500).nullable().default(null),
});

export async function POST(request: NextRequest) {
  return withApiErrorHandling<{ product: ProductRow }>(async (requestId) => {
    const session = await requireSession(request);
    if (!session.ok) {
      return apiError(
        "UNAUTHORIZED",
        "A valid session is required to create a product.",
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

    const parsed = createProductSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "A product title is required.", {
        requestId,
        details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }

    const input = parsed.data;
    const product = await insertProduct({
      source: "upload",
      title: input.title,
      sku: input.sku,
      product_type: input.productType,
      price: input.price,
      inventory_quantity: input.inventoryQuantity,
      description: input.description,
      image_path: input.imagePath,
      analysis_status: "pending",
    });

    return apiOk<{ product: ProductRow }>({ product }, requestId);
  });
}
