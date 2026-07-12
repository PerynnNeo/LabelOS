import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { getEnv } from "@/lib/env";

/**
 * Signed access-code sessions for the single-owner MVP.
 *
 * A successful login issues an HS256 JWT (via `jose`) stored in an HttpOnly
 * cookie. There is exactly one "user" (the brand owner), so the payload
 * carries no identity beyond a fixed subject claim.
 *
 * NOTE: `src/proxy.ts` verifies the same token with `jose` directly (it
 * cannot import this module because of `server-only`). The cookie name and
 * algorithm below must stay in sync with the constants in `src/proxy.ts`.
 */

/** Session cookie name. Keep in sync with src/proxy.ts. */
export const SESSION_COOKIE = "labelos_session";

/** Sessions are valid for seven days. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const SESSION_ALG = "HS256";
const SESSION_SUBJECT = "owner";

function secretKey(): Uint8Array {
  const { SESSION_SECRET } = getEnv();
  if (SESSION_SECRET.length < 32) {
    // Login is blocked earlier by isAuthConfigured(); this is defence in depth
    // so a token can never be signed with a weak or empty secret.
    throw new Error(
      "SESSION_SECRET is not configured (needs at least 32 characters).",
    );
  }
  return new TextEncoder().encode(SESSION_SECRET);
}

/** Create a signed session token valid for seven days. */
export async function createSessionToken(): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: SESSION_ALG })
    .setSubject(SESSION_SUBJECT)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

/**
 * Verify a session token. Returns true only for a correctly signed,
 * unexpired owner session. Never throws.
 */
export async function verifySessionToken(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: [SESSION_ALG],
    });
    return payload.sub === SESSION_SUBJECT;
  } catch {
    return false;
  }
}

export interface SessionCookieOptions {
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
}

/**
 * Cookie options for the session cookie: HttpOnly, SameSite=Lax, Secure in
 * production, scoped to the whole app.
 */
export function sessionCookieOptions(
  maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS,
): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** Cookie options that immediately expire the session cookie (logout). */
export function clearedSessionCookieOptions(): SessionCookieOptions {
  return sessionCookieOptions(0);
}
