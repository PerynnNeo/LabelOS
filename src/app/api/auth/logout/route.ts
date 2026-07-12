import { apiOk, withApiErrorHandling } from "@/lib/api";
import {
  SESSION_COOKIE,
  clearedSessionCookieOptions,
} from "@/lib/auth/session";

export const runtime = "nodejs";

/** POST /api/auth/logout — clears the session cookie. */
export async function POST() {
  return withApiErrorHandling<{ ok: true }>(async (requestId) => {
    const response = apiOk<{ ok: true }>({ ok: true }, requestId);
    response.cookies.set(SESSION_COOKIE, "", clearedSessionCookieOptions());
    return response;
  });
}
