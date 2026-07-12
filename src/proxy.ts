import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import type { ApiResult } from "@/lib/api";

/**
 * LabelOS request proxy (Next 16 renamed `middleware` to `proxy`).
 *
 * Protection rules:
 *  - /app/*  → redirect to /login when the session cookie is missing/invalid.
 *  - /api/*  → 401 JSON ApiResult envelope, EXCEPT the public routes below.
 *  - /       and /lookbook/* are public (not matched at all).
 *
 * Route handlers still re-verify the session via requireSession() — this
 * proxy is the first line of defence, not the only one.
 *
 * The proxy runs on the Edge runtime, so it verifies the JWT with `jose`
 * directly instead of importing src/lib/auth/session.ts (that module is
 * `server-only`). Keep the constants below in sync with it.
 */

/** Keep in sync with SESSION_COOKIE in src/lib/auth/session.ts. */
const SESSION_COOKIE = "labelos_session";
const SESSION_ALG = "HS256";
const SESSION_SUBJECT = "owner";

/** API paths that stay public. Everything else under /api requires a session. */
const PUBLIC_API_PATHS = new Set(["/api/health", "/api/auth/login"]);

async function hasValidSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.SESSION_SECRET ?? "";
  if (!token || secret.length < 32) return false;
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      { algorithms: [SESSION_ALG] },
    );
    return payload.sub === SESSION_SUBJECT;
  } catch {
    return false;
  }
}

function unauthorizedJson(): NextResponse {
  const body: ApiResult<never> = {
    ok: false,
    error: {
      code: "UNAUTHORIZED",
      message: "A valid session is required. Log in at /login.",
    },
    requestId: crypto.randomUUID(),
  };
  return NextResponse.json(body, { status: 401 });
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api")) {
    if (PUBLIC_API_PATHS.has(pathname)) {
      return NextResponse.next();
    }
    if (await hasValidSession(request)) {
      return NextResponse.next();
    }
    return unauthorizedJson();
  }

  // /app and /app/*
  if (pathname === "/app" || pathname.startsWith("/app/")) {
    if (await hasValidSession(request)) {
      return NextResponse.next();
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/api/:path*"],
};
