import "server-only";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "./session";

/**
 * Session guards.
 *
 * `src/proxy.ts` already blocks unauthenticated traffic to /app/* and the
 * protected /api/* routes, but route handlers and server components should
 * still verify the session themselves (defence in depth — never rely on the
 * proxy alone).
 */

export type SessionCheck = { ok: true } | { ok: false };

/**
 * Verify the session cookie on an incoming API request.
 *
 * Usage in a route handler:
 *   const session = await requireSession(request);
 *   if (!session.ok) return apiError("UNAUTHORIZED", "A valid session is required.");
 */
export async function requireSession(
  request: NextRequest,
): Promise<SessionCheck> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return { ok: false };
  return (await verifySessionToken(token)) ? { ok: true } : { ok: false };
}

/**
 * cookies()-based variant for server components and server actions, where no
 * NextRequest is available.
 */
export async function getSessionFromCookies(): Promise<SessionCheck> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return { ok: false };
  return (await verifySessionToken(token)) ? { ok: true } : { ok: false };
}
