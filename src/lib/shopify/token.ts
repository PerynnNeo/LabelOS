import "server-only";
import { getEnv } from "@/lib/env";
import {
  shopifyTokenErrorResponseSchema,
  shopifyTokenResponseSchema,
} from "./schemas";

/**
 * Shopify one-store client-credentials token exchange (spec section 10).
 *
 * POST https://{SHOPIFY_SHOP}.myshopify.com/admin/oauth/access_token with
 * URL-encoded grant_type=client_credentials&client_id&client_secret.
 *
 * The short-lived Admin token is cached in memory and refreshed one minute
 * before expiry. A Vercel cold start simply requests a new token.
 *
 * SECURITY: this module never logs the client secret or the access token,
 * and never includes either in a thrown error.
 */

export type ShopifyTokenErrorCategory =
  | "not_configured"
  | "auth"
  | "not_installed"
  | "network";

/**
 * Error thrown by the token exchange. The GraphQL client wraps this into a
 * `ShopifyError` so callers only ever deal with one error type.
 */
export class ShopifyTokenError extends Error {
  readonly category: ShopifyTokenErrorCategory;

  constructor(category: ShopifyTokenErrorCategory, message: string) {
    super(message);
    this.name = "ShopifyTokenError";
    this.category = category;
  }
}

let cachedToken: { value: string; expiresAt: number } | null = null;

/** Refresh this long before the real expiry. */
const REFRESH_MARGIN_MS = 60_000;

/** Conservative fallback lifetime if Shopify omits expires_in. */
const DEFAULT_TOKEN_LIFETIME_SECONDS = 3600;

/**
 * Returns a valid Admin API access token, exchanging client credentials when
 * the cache is empty or within one minute of expiry.
 */
export async function getAccessToken(): Promise<string> {
  const env = getEnv();

  if (!env.SHOPIFY_SHOP || !env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET) {
    throw new ShopifyTokenError(
      "not_configured",
      "Shopify is not configured. Set SHOPIFY_SHOP, SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in .env.local, or keep SHOPIFY_MODE=mock to use the simulated store.",
    );
  }

  if (cachedToken && cachedToken.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
    return cachedToken.value;
  }

  const shop = env.SHOPIFY_SHOP;
  const url = `https://${shop}.myshopify.com/admin/oauth/access_token`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: env.SHOPIFY_CLIENT_ID,
        client_secret: env.SHOPIFY_CLIENT_SECRET,
      }).toString(),
      cache: "no-store",
    });
  } catch {
    throw new ShopifyTokenError(
      "network",
      `Could not reach ${shop}.myshopify.com — check your network connection and the SHOPIFY_SHOP subdomain.`,
    );
  }

  if (response.status === 404) {
    throw new ShopifyTokenError(
      "not_installed",
      `Shopify shop not found — check the SHOPIFY_SHOP subdomain ("${shop}" must be the part before .myshopify.com, with no protocol or domain suffix).`,
    );
  }

  if (
    response.status === 400 ||
    response.status === 401 ||
    response.status === 403
  ) {
    // Read the body for a hint (e.g. invalid_client) without ever logging
    // or rethrowing credential material.
    let hint = "";
    try {
      const body: unknown = await response.json();
      const parsed = shopifyTokenErrorResponseSchema.safeParse(body);
      if (parsed.success) {
        const code = parsed.data.error ?? parsed.data.errors ?? "";
        if (code) hint = ` (Shopify said: ${code})`;
      }
    } catch {
      // Body was not JSON — ignore; the status code is enough.
    }
    throw new ShopifyTokenError(
      "auth",
      `Shopify credentials rejected — check the Client ID/Secret and that the app is installed on this store${hint}. In the Dev Dashboard, open the app, release a version, and install it on the development store.`,
    );
  }

  if (!response.ok) {
    throw new ShopifyTokenError(
      "network",
      `Shopify token endpoint returned HTTP ${response.status}. This is usually temporary — try again shortly.`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ShopifyTokenError(
      "network",
      "Shopify token endpoint returned a non-JSON response. Try again shortly.",
    );
  }

  const parsed = shopifyTokenResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ShopifyTokenError(
      "auth",
      "Shopify returned an unexpected token response — check that the Client ID/Secret belong to a Dev Dashboard app installed on this store.",
    );
  }

  const expiresInSeconds =
    parsed.data.expires_in ?? DEFAULT_TOKEN_LIFETIME_SECONDS;
  cachedToken = {
    value: parsed.data.access_token,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  };
  return cachedToken.value;
}

/** Test helper — clears the in-memory token cache. */
export function resetTokenCache(): void {
  cachedToken = null;
}
