import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api";
import { requireSession } from "@/lib/auth/require-session";
import {
  getProduct,
  updateProduct,
  type ProductPatch,
  type ProductRow,
} from "@/lib/supabase/repositories";

/**
 * /api/products/[id] (spec sections 9, 24).
 *
 * GET   — fetch a single product.
 * PATCH — update a limited, owner-editable set of fields (title, price,
 *         inventory, description, status). Analysis and provenance fields are
 *         never client-editable here.
 */
export const runtime = "nodejs";

const idSchema = z.uuid();

const patchSchema = z
  .object({
    title: z.string().min(1).max(300).optional(),
    price: z.coerce.number().nonnegative().optional(),
    inventory: z.coerce.number().int().nonnegative().optional(),
    description: z.string().max(5000).optional(),
    status: z.string().min(1).max(60).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "Provide at least one field to update.",
  });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiErrorHandling<{ product: ProductRow }>(async (requestId) => {
    const session = await requireSession(request);
    if (!session.ok) {
      return apiError("UNAUTHORIZED", "A valid session is required.", {
        requestId,
      });
    }

    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return apiError("VALIDATION_ERROR", "Invalid product id.", { requestId });
    }

    const product = await getProduct(id);
    if (!product) {
      return apiError("NOT_FOUND", `No product found with id ${id}.`, {
        requestId,
      });
    }

    return apiOk<{ product: ProductRow }>({ product }, requestId);
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiErrorHandling<{ product: ProductRow }>(async (requestId) => {
    const session = await requireSession(request);
    if (!session.ok) {
      return apiError(
        "UNAUTHORIZED",
        "A valid session is required to update a product.",
        { requestId },
      );
    }

    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return apiError("VALIDATION_ERROR", "Invalid product id.", { requestId });
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
        "Provide at least one of: title, price, inventory, description, status.",
        {
          requestId,
          details: parsed.error.issues.map(
            (i) => `${i.path.join(".")}: ${i.message}`,
          ),
        },
      );
    }

    const existing = await getProduct(id);
    if (!existing) {
      return apiError("NOT_FOUND", `No product found with id ${id}.`, {
        requestId,
      });
    }

    const { title, price, inventory, description, status } = parsed.data;
    const patch: ProductPatch = {};
    if (title !== undefined) patch.title = title;
    if (price !== undefined) patch.price = price;
    if (inventory !== undefined) patch.inventory_quantity = inventory;
    if (description !== undefined) patch.description = description;
    if (status !== undefined) patch.status = status;

    const product = await updateProduct(id, patch);
    return apiOk<{ product: ProductRow }>({ product }, requestId);
  });
}
