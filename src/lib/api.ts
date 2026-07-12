import { NextResponse } from "next/server";

/**
 * Standard response envelope used by every LabelOS API route.
 */

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "STATE_INVALID"
  | "APPROVAL_REQUIRED"
  | "JOB_RUNNING"
  | "LIMIT_EXCEEDED"
  | "PROVIDER_NOT_CONFIGURED"
  | "PROVIDER_ERROR"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export type ApiResult<T> =
  | { ok: true; data: T; requestId: string }
  | {
      ok: false;
      error: {
        code: ApiErrorCode;
        message: string;
        details?: unknown;
      };
      requestId: string;
    };

const ERROR_STATUS: Record<ApiErrorCode, number> = {
  UNAUTHORIZED: 401,
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  STATE_INVALID: 409,
  APPROVAL_REQUIRED: 403,
  JOB_RUNNING: 409,
  LIMIT_EXCEEDED: 429,
  PROVIDER_NOT_CONFIGURED: 424,
  PROVIDER_ERROR: 502,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export function newRequestId(): string {
  return crypto.randomUUID();
}

export function apiOk<T>(data: T, requestId: string = newRequestId()) {
  const body: ApiResult<T> = { ok: true, data, requestId };
  return NextResponse.json(body);
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  options: { details?: unknown; requestId?: string; status?: number } = {},
) {
  const body: ApiResult<never> = {
    ok: false,
    error: { code, message, details: options.details },
    requestId: options.requestId ?? newRequestId(),
  };
  return NextResponse.json(body, {
    status: options.status ?? ERROR_STATUS[code],
  });
}

/**
 * Wrap a route handler body: catches unexpected errors and returns a clean
 * INTERNAL_ERROR without leaking stack traces in production.
 */
export async function withApiErrorHandling<T>(
  fn: (requestId: string) => Promise<NextResponse<ApiResult<T>>>,
): Promise<NextResponse<ApiResult<T>>> {
  const requestId = newRequestId();
  try {
    return await fn(requestId);
  } catch (error) {
    const message =
      process.env.NODE_ENV === "production"
        ? "An unexpected error occurred."
        : error instanceof Error
          ? error.message
          : String(error);
    console.error(`[api] requestId=${requestId}`, error);
    return apiError("INTERNAL_ERROR", message, { requestId }) as NextResponse<
      ApiResult<T>
    >;
  }
}
