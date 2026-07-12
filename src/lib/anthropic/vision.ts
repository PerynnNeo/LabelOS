import { getEnv } from "@/lib/env";
import type {
  Base64ImageSource,
  ContentBlockParam,
  ImageBlockParam,
  TextBlockParam,
} from "@anthropic-ai/sdk/resources/messages";

/**
 * Pure vision helpers for the Anthropic Messages API (spec section 8 — "Vision
 * input").
 *
 * Deliberately dependency-light: this module does NO storage, network, or
 * database work — it only validates image bytes and turns them into Anthropic
 * content blocks. Callers download the private image (via the storage layer),
 * then hand the bytes here. Nothing in this file consumes a secret, so it does
 * not need `server-only`; it is used exclusively on the server regardless.
 *
 * Only JPEG, PNG, GIF and WebP are accepted — the exact set the Messages API
 * supports for base64 image sources — and the size ceiling comes from
 * `MAX_UPLOAD_BYTES`.
 */

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

const ALLOWED_SET = new Set<string>(ALLOWED_IMAGE_MIME_TYPES);

export type ImageValidationCode =
  | "empty"
  | "unsupported_type"
  | "too_large";

export class ImageValidationError extends Error {
  readonly code: ImageValidationCode;
  /** Owner-facing guidance about what to do next. */
  readonly guidance: string;

  constructor(code: ImageValidationCode, message: string, guidance: string) {
    super(message);
    this.name = "ImageValidationError";
    this.code = code;
    this.guidance = guidance;
  }
}

export interface ValidatedImage {
  mediaType: AllowedImageMime;
  byteLength: number;
}

/** Normalise a content-type header: strip parameters, lowercase, trim. */
function normalizeContentType(contentType: string): string {
  return contentType.split(";")[0]?.trim().toLowerCase() ?? "";
}

/**
 * Detect the image type from magic bytes. Returns a supported MIME type or null.
 * Used to reconcile a missing or clearly wrong `Content-Type` header — Claude
 * needs the *correct* media_type, not whatever the upload happened to declare.
 */
export function sniffImageMime(bytes: Uint8Array): AllowedImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Validate raw image bytes against the allowed MIME set and the configured
 * size ceiling. The effective media type prefers the magic-byte sniff (more
 * trustworthy than a client-supplied header) and falls back to the declared
 * content type.
 *
 * @throws ImageValidationError on empty input, an unsupported type, or a file
 * larger than `MAX_UPLOAD_BYTES`.
 */
export function validateImage(
  bytes: Uint8Array,
  contentType: string,
): ValidatedImage {
  if (bytes.length === 0) {
    throw new ImageValidationError(
      "empty",
      "The image is empty (0 bytes).",
      "Re-upload the garment photo — the file appears to be empty or failed to transfer.",
    );
  }

  const declared = normalizeContentType(contentType);
  const sniffed = sniffImageMime(bytes);
  const mediaType = (sniffed ?? declared) as string;

  if (!ALLOWED_SET.has(mediaType)) {
    throw new ImageValidationError(
      "unsupported_type",
      `Unsupported image type "${mediaType || contentType || "unknown"}".`,
      "Use a JPEG, PNG, GIF, or WebP image. HEIC, TIFF, PDF, and SVG are not supported for garment analysis.",
    );
  }

  const maxBytes = getEnv().MAX_UPLOAD_BYTES;
  if (bytes.length > maxBytes) {
    const mb = (maxBytes / (1024 * 1024)).toFixed(1);
    throw new ImageValidationError(
      "too_large",
      `Image is ${bytes.length} bytes, over the ${maxBytes}-byte limit.`,
      `Resize or compress the photo to under ${mb} MB and try again.`,
    );
  }

  return { mediaType: mediaType as AllowedImageMime, byteLength: bytes.length };
}

/**
 * Convert validated image bytes into a base64 Anthropic image content block.
 * Validation runs first, so an unsupported or oversized image throws before any
 * base64 work happens.
 */
export function toImageBlock(
  bytes: Uint8Array,
  contentType: string,
): ImageBlockParam {
  const { mediaType } = validateImage(bytes, contentType);
  const source: Base64ImageSource = {
    type: "base64",
    media_type: mediaType,
    data: Buffer.from(bytes).toString("base64"),
  };
  return { type: "image", source };
}

/**
 * Assemble a vision user-content array: the image block FIRST, then the text
 * prompt — the order the vision guidance recommends so the model has the image
 * in context before the instructions.
 */
export function buildVisionContent(
  imageBlock: ImageBlockParam,
  text: string,
): ContentBlockParam[] {
  const textBlock: TextBlockParam = { type: "text", text };
  return [imageBlock, textBlock];
}
