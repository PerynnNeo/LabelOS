"use client";

import type { ApiResult, ApiErrorCode } from "@/lib/api";

/**
 * Tiny client-side fetch wrapper for the LabelOS ApiResult envelope.
 *
 * Every mutation in the private app flows through here so that { ok:false }
 * envelopes surface a typed {@link ApiError} the caller can catch and toast.
 * `@/lib/api` is imported type-only, so no server module is bundled.
 */

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly details: unknown;

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** JSON-serialisable request body. */
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Call a LabelOS API route and unwrap the envelope. Resolves with the `data`
 * payload on success; rejects with an {@link ApiError} carrying the server's
 * (owner-friendly, secret-free) message on failure.
 */
export async function apiRequest<T>(
  url: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { method = "GET", body, signal } = options;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      signal,
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      "INTERNAL_ERROR",
      "Could not reach the server. Check your connection and try again.",
    );
  }

  let envelope: ApiResult<T> | null = null;
  try {
    envelope = (await response.json()) as ApiResult<T>;
  } catch {
    envelope = null;
  }

  if (!envelope) {
    throw new ApiError(
      "INTERNAL_ERROR",
      `The server returned an unexpected response (HTTP ${response.status}).`,
    );
  }

  if (!envelope.ok) {
    throw new ApiError(
      envelope.error.code,
      envelope.error.message,
      envelope.error.details,
    );
  }

  return envelope.data;
}

/** Normalise any thrown value into a user-facing message for a toast. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong. Please try again.";
}
