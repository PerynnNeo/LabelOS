import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api";
import { getEnv, isAuthConfigured } from "@/lib/env";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth/session";
import {
  isRateLimited,
  recordFailure,
  recordSuccess,
  retryAfterSeconds,
} from "@/lib/auth/rate-limit";

export const runtime = "nodejs";

const bodySchema = z.object({
  accessCode: z.string().min(1).max(512),
});

/**
 * Timing-safe access-code comparison.
 *
 * Both values are hashed with SHA-256 first so the buffers passed to
 * timingSafeEqual always have equal length (timingSafeEqual throws on length
 * mismatch, and a length-based early exit would itself leak information).
 * The result reveals only match / no-match — never which characters matched.
 */
function safeCompare(candidate: string, expected: string): boolean {
  const a = createHash("sha256").update(candidate, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "local";
}

export async function POST(request: NextRequest) {
  return withApiErrorHandling<{ ok: true }>(async (requestId) => {
    const env = getEnv();

    if (!isAuthConfigured(env)) {
      return apiError(
        "PROVIDER_NOT_CONFIGURED",
        "Login is not configured yet. Set APP_ACCESS_CODE (at least 8 characters) and SESSION_SECRET (at least 32 characters) in .env.local, then restart the dev server. Run `npm run verify:env` to check.",
        { requestId },
      );
    }

    const key = clientKey(request);
    if (isRateLimited(key)) {
      const seconds = retryAfterSeconds(key);
      return apiError(
        "RATE_LIMITED",
        `Too many failed login attempts. Try again in about ${Math.max(1, Math.ceil(seconds / 60))} minute(s).`,
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
      return apiError("VALIDATION_ERROR", "accessCode is required.", {
        requestId,
      });
    }

    if (!safeCompare(parsed.data.accessCode, env.APP_ACCESS_CODE)) {
      recordFailure(key);
      // Deliberately generic: never reveal how close the attempt was.
      return apiError("UNAUTHORIZED", "That access code is not correct.", {
        requestId,
      });
    }

    recordSuccess(key);
    const token = await createSessionToken();
    const response = apiOk<{ ok: true }>({ ok: true }, requestId);
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  });
}
