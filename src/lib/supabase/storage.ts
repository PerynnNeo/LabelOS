import "server-only";
import { getEnv } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Server-only Supabase Storage helpers.
 *
 * Buckets (created by supabase/migrations/001_initial.sql):
 * - `catalog-private` — uploaded/seeded garment images. Never public; the
 *   server downloads bytes and forwards them (e.g. base64 to Claude vision).
 * - `publish-public` — approved assets (rendered flat sketches) that Shopify
 *   must be able to fetch over a public URL.
 */

export const CATALOG_PRIVATE_BUCKET = "catalog-private";
export const PUBLISH_PUBLIC_BUCKET = "publish-public";

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;
export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

const EXTENSION_MIME: Record<string, AllowedImageMimeType> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
};

export class StorageOperationError extends Error {
  readonly operation: string;

  constructor(operation: string, message: string) {
    super(`Storage operation "${operation}" failed: ${message}`);
    this.name = "StorageOperationError";
    this.operation = operation;
  }
}

/**
 * Reduce an arbitrary (user-supplied) filename to a safe basename:
 * strips directories, keeps only [a-zA-Z0-9._-], and bounds the length while
 * preserving the extension.
 */
export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[.\-_]+/, "")
    .replace(/[.\-_]+$/, "");
  if (cleaned.length === 0) return "file";
  const MAX_LENGTH = 128;
  if (cleaned.length <= MAX_LENGTH) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const extension = dot > 0 ? cleaned.slice(dot).slice(0, 16) : "";
  return cleaned.slice(0, MAX_LENGTH - extension.length) + extension;
}

/** Reject traversal and other unsafe object keys. */
function assertSafeStoragePath(operation: string, path: string): void {
  if (
    path.length === 0 ||
    path.startsWith("/") ||
    path.includes("..") ||
    path.includes("\\") ||
    !/^[a-zA-Z0-9/_.-]+$/.test(path)
  ) {
    throw new StorageOperationError(operation, `Unsafe storage path "${path}".`);
  }
}

function mimeFromExtension(path: string): AllowedImageMimeType | null {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return null;
  const extension = path.slice(dot + 1).toLowerCase();
  return EXTENSION_MIME[extension] ?? null;
}

function normalizeContentType(
  reported: string | undefined,
  path: string,
): string | null {
  const trimmed = (reported ?? "").trim().toLowerCase().split(";")[0];
  if (trimmed === "image/jpg") return "image/jpeg";
  if (trimmed && trimmed !== "application/octet-stream" && trimmed !== "text/plain") {
    return trimmed;
  }
  return mimeFromExtension(path);
}

function isAllowedImageMime(value: string | null): value is AllowedImageMimeType {
  return (
    value !== null &&
    (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(value)
  );
}

export interface SignedUpload {
  /** Object key inside the catalog-private bucket. */
  path: string;
  /** Full signed URL the browser can PUT/POST the file to. */
  signedUrl: string;
  /** Token for supabase-js `uploadToSignedUrl`. */
  token: string;
}

/**
 * Create a signed upload URL for the private catalog bucket. The browser
 * uploads directly to Supabase without ever seeing the service-role key.
 * Only allows image file extensions (jpeg/png/gif/webp).
 */
export async function createSignedUploadUrl(path: string): Promise<SignedUpload> {
  assertSafeStoragePath("createSignedUploadUrl", path);
  if (mimeFromExtension(path) === null) {
    throw new StorageOperationError(
      "createSignedUploadUrl",
      `Unsupported file extension for "${path}". Allowed: jpg, jpeg, png, gif, webp.`,
    );
  }
  const { data, error } = await supabaseAdmin()
    .storage.from(CATALOG_PRIVATE_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    throw new StorageOperationError(
      "createSignedUploadUrl",
      error?.message ?? "No signed URL returned.",
    );
  }
  return { path: data.path, signedUrl: data.signedUrl, token: data.token };
}

export interface PrivateImage {
  bytes: Uint8Array;
  contentType: AllowedImageMimeType;
}

/**
 * Download an image from the private catalog bucket with MIME and size
 * validation. Accepts JPEG/PNG/GIF/WebP only and rejects files larger than
 * MAX_UPLOAD_BYTES.
 */
export async function downloadPrivateImage(path: string): Promise<PrivateImage> {
  assertSafeStoragePath("downloadPrivateImage", path);
  const { data, error } = await supabaseAdmin()
    .storage.from(CATALOG_PRIVATE_BUCKET)
    .download(path);
  if (error || !data) {
    throw new StorageOperationError(
      "downloadPrivateImage",
      error?.message ?? `Object "${path}" not found in ${CATALOG_PRIVATE_BUCKET}.`,
    );
  }

  const contentType = normalizeContentType(data.type, path);
  if (!isAllowedImageMime(contentType)) {
    throw new StorageOperationError(
      "downloadPrivateImage",
      `Unsupported image type "${contentType ?? "unknown"}" for "${path}". ` +
        "Accepted: image/jpeg, image/png, image/gif, image/webp.",
    );
  }

  const arrayBuffer = await data.arrayBuffer();
  const maxBytes = getEnv().MAX_UPLOAD_BYTES;
  if (arrayBuffer.byteLength === 0) {
    throw new StorageOperationError(
      "downloadPrivateImage",
      `Object "${path}" is empty.`,
    );
  }
  if (arrayBuffer.byteLength > maxBytes) {
    throw new StorageOperationError(
      "downloadPrivateImage",
      `Image "${path}" is ${arrayBuffer.byteLength} bytes, above the ` +
        `configured limit of ${maxBytes} bytes (MAX_UPLOAD_BYTES).`,
    );
  }

  return { bytes: new Uint8Array(arrayBuffer), contentType };
}

async function uploadAsset(
  operation: string,
  bucket: string,
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  assertSafeStoragePath(operation, path);
  if (!isAllowedImageMime(normalizeContentType(contentType, path))) {
    throw new StorageOperationError(
      operation,
      `Unsupported content type "${contentType}". ` +
        "Accepted: image/jpeg, image/png, image/gif, image/webp.",
    );
  }
  if (bytes.byteLength === 0) {
    throw new StorageOperationError(operation, "Refusing to upload empty file.");
  }
  const { error } = await supabaseAdmin()
    .storage.from(bucket)
    .upload(path, bytes, { contentType, upsert: true, cacheControl: "3600" });
  if (error) {
    throw new StorageOperationError(operation, error.message);
  }
}

/**
 * Upload an approved asset to the public publish bucket and return its
 * public URL (e.g. for Shopify to fetch a rendered flat-sketch PNG).
 */
export async function uploadPublicAsset(
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string> {
  await uploadAsset("uploadPublicAsset", PUBLISH_PUBLIC_BUCKET, path, bytes, contentType);
  const { data } = supabaseAdmin()
    .storage.from(PUBLISH_PUBLIC_BUCKET)
    .getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Server-side upload into the private catalog bucket (used by the demo
 * seeder; regular user uploads go through signed URLs instead).
 * Returns the object path.
 */
export async function uploadPrivateAsset(
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string> {
  await uploadAsset("uploadPrivateAsset", CATALOG_PRIVATE_BUCKET, path, bytes, contentType);
  return path;
}
