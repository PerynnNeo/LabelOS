import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { requireSession } from "@/lib/auth/require-session";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  createSignedUploadUrl,
  sanitizeFilename,
  StorageOperationError,
  type SignedUpload,
} from "@/lib/supabase/storage";

/**
 * POST /api/uploads/sign — issue a signed Supabase upload URL for the private
 * catalog bucket (spec sections 9, 24, 28).
 *
 * The browser uploads the garment image directly to Supabase using the returned
 * signed URL/token, so the service-role key never reaches the client. We
 * validate the declared MIME type and size, sanitise the filename, and place
 * the object under a unique, collision-free key.
 */
export const runtime = "nodejs";

const bodySchema = z.object({
  filename: z.string().min(1).max(300),
  contentType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive(),
});

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

function normalizeMime(contentType: string): string {
  const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return type === "image/jpg" ? "image/jpeg" : type;
}

/** Ensure the object key ends with an image extension matching the MIME type. */
function ensureImageExtension(name: string, mime: string): string {
  if (/\.(jpe?g|png|gif|webp)$/i.test(name)) return name;
  return `${name}.${MIME_TO_EXT[mime]}`;
}

export async function POST(request: NextRequest) {
  return withApiErrorHandling<SignedUpload>(async (requestId) => {
    const session = await requireSession(request);
    if (!session.ok) {
      return apiError(
        "UNAUTHORIZED",
        "A valid session is required to request an upload URL.",
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

    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(
        "VALIDATION_ERROR",
        "filename, contentType and sizeBytes are required.",
        { requestId, details: parsed.error.issues.map((i) => i.message) },
      );
    }

    const { filename, contentType, sizeBytes } = parsed.data;

    const mime = normalizeMime(contentType);
    if (!(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mime)) {
      return apiError(
        "VALIDATION_ERROR",
        `Unsupported image type "${contentType}". Use a JPEG, PNG, GIF, or WebP image.`,
        { requestId },
      );
    }

    const maxBytes = getEnv().MAX_UPLOAD_BYTES;
    if (sizeBytes > maxBytes) {
      const mb = (maxBytes / (1024 * 1024)).toFixed(1);
      return apiError(
        "VALIDATION_ERROR",
        `Image is ${sizeBytes} bytes, over the ${maxBytes}-byte limit. Resize or compress the photo to under ${mb} MB and try again.`,
        { requestId },
      );
    }

    const safeName = ensureImageExtension(sanitizeFilename(filename), mime);
    const path = `uploads/${crypto.randomUUID()}-${safeName}`;

    try {
      const signed = await createSignedUploadUrl(path);
      return apiOk<SignedUpload>(signed, requestId);
    } catch (error) {
      if (error instanceof StorageOperationError) {
        return apiError(
          "PROVIDER_ERROR",
          "Could not create an upload URL. Confirm the Supabase 'catalog-private' storage bucket exists (run the migration) and try again.",
          { requestId },
        );
      }
      throw error;
    }
  });
}
