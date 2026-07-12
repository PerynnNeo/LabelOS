import "server-only";
import type { z } from "zod";
import type { ApiErrorCode } from "@/lib/api";
import { getEnv, isShopifyLive } from "@/lib/env";
import {
  shopifyGraphqlEnvelopeSchema,
  type ShopifyGraphqlCost,
  type ShopifyGraphqlErrorItem,
  type ShopifyUserError,
} from "./schemas";
import { getAccessToken, resetTokenCache, ShopifyTokenError } from "./token";

/**
 * Typed Shopify Admin GraphQL client (spec section 10).
 *
 * - checks HTTP status;
 * - parses the { data, errors, extensions } envelope defensively;
 * - surfaces extensions.cost when present;
 * - throws a single categorised `ShopifyError` with a friendly UI message;
 * - redacts variables in error contexts (keys only — never values).
 */

export type ShopifyErrorCategory =
  | "not_configured"
  | "auth"
  | "not_installed"
  | "missing_scope"
  | "user_error"
  | "rate_limited"
  | "network"
  | "graphql_error";

/** Default friendly messages per category (spec section 26). */
export const SHOPIFY_ERROR_UI_MESSAGES: Record<ShopifyErrorCategory, string> = {
  not_configured:
    "Shopify is not configured. Set SHOPIFY_SHOP, SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in .env.local, or keep SHOPIFY_MODE=mock to use the simulated store.",
  auth: "Shopify rejected the credentials — check the Client ID/Secret and that the app is installed on this store.",
  not_installed:
    "The LabelOS app is not installed on this store (or the shop was not found). Install the released app version on the development store in the Shopify Dev Dashboard, and check the SHOPIFY_SHOP subdomain.",
  missing_scope:
    "The Shopify app is missing a required access scope. Add read_products, write_products, read_inventory, read_publications and write_publications to the app version, release it, and reinstall the app on the store.",
  user_error:
    "Shopify rejected the request payload. Review the details and adjust the fields.",
  rate_limited:
    "Shopify rate limit reached — wait a few seconds and try again.",
  network:
    "Could not reach Shopify. Check your network connection and try again shortly.",
  graphql_error:
    "Shopify returned an unexpected response. Try again; if it persists, check the API version and app scopes.",
};

export class ShopifyError extends Error {
  readonly category: ShopifyErrorCategory;
  /** Safe, secret-free context (e.g. redacted variable keys, userErrors). */
  readonly details?: unknown;

  constructor(
    category: ShopifyErrorCategory,
    message?: string,
    details?: unknown,
  ) {
    super(message ?? SHOPIFY_ERROR_UI_MESSAGES[category]);
    this.name = "ShopifyError";
    this.category = category;
    this.details = details;
  }
}

/** Map a ShopifyError category to the standard API envelope error code. */
export function shopifyErrorToApiCode(error: ShopifyError): ApiErrorCode {
  switch (error.category) {
    case "not_configured":
      return "PROVIDER_NOT_CONFIGURED";
    case "rate_limited":
      return "RATE_LIMITED";
    case "user_error":
      return "VALIDATION_ERROR";
    default:
      return "PROVIDER_ERROR";
  }
}

const SENSITIVE_KEY_PATTERN = /secret|token|password|credential|api[_-]?key/i;

/**
 * Redacts GraphQL variables for error contexts and logs: only key names and
 * coarse value types survive; any key that looks sensitive is fully masked.
 */
export function redactVariables(
  variables: Record<string, unknown> | undefined,
): Record<string, string> {
  if (!variables) return {};
  const summary: Record<string, string> = {};
  for (const [key, value] of Object.entries(variables)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      summary[key] = "[redacted]";
    } else if (value === null) {
      summary[key] = "null";
    } else if (Array.isArray(value)) {
      summary[key] = `array(${value.length})`;
    } else {
      summary[key] = typeof value;
    }
  }
  return summary;
}

export interface ShopifyGraphqlOptions<T> {
  query: string;
  variables?: Record<string, unknown>;
  /** When provided, `data` is validated (unknown → typed) before returning. */
  schema?: z.ZodType<T>;
}

export interface ShopifyGraphqlResult<T> {
  data: T;
  /** extensions.cost when Shopify includes it, else null. */
  cost: ShopifyGraphqlCost | null;
}

function graphqlEndpoint(): string {
  const env = getEnv();
  return `https://${env.SHOPIFY_SHOP}.myshopify.com/admin/api/${env.SHOPIFY_API_VERSION}/graphql.json`;
}

function categoriseGraphqlErrors(
  errors: ShopifyGraphqlErrorItem[],
  variableSummary: Record<string, string>,
): ShopifyError {
  const messages = errors.map((e) => e.message).join("; ");
  const codes = errors.map((e) => e.extensions?.code ?? "");

  if (codes.includes("THROTTLED")) {
    return new ShopifyError("rate_limited", undefined, {
      graphqlErrors: messages,
    });
  }
  if (codes.includes("ACCESS_DENIED") || /access denied/i.test(messages)) {
    return new ShopifyError(
      "missing_scope",
      `${SHOPIFY_ERROR_UI_MESSAGES.missing_scope} (Shopify said: ${messages})`,
      { graphqlErrors: messages, variables: variableSummary },
    );
  }
  if (/not installed/i.test(messages)) {
    return new ShopifyError("not_installed", undefined, {
      graphqlErrors: messages,
    });
  }
  return new ShopifyError(
    "graphql_error",
    `Shopify returned GraphQL errors: ${messages}`,
    { graphqlErrors: messages, variables: variableSummary },
  );
}

/**
 * Executes one Admin GraphQL operation. Throws `ShopifyError` on every
 * failure mode; on success returns `{ data, cost }`.
 */
export async function shopifyGraphql<T = unknown>(
  options: ShopifyGraphqlOptions<T>,
): Promise<ShopifyGraphqlResult<T>> {
  const env = getEnv();
  if (!isShopifyLive(env)) {
    throw new ShopifyError("not_configured");
  }

  const variableSummary = redactVariables(options.variables);

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (error) {
    if (error instanceof ShopifyTokenError) {
      throw new ShopifyError(error.category, error.message);
    }
    throw error;
  }

  let response: Response;
  try {
    response = await fetch(graphqlEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: options.query,
        variables: options.variables ?? {},
      }),
      cache: "no-store",
    });
  } catch {
    throw new ShopifyError("network", undefined, {
      variables: variableSummary,
    });
  }

  if (response.status === 401) {
    // Token may have been revoked or expired server-side; drop the cache so
    // the next attempt performs a fresh exchange.
    resetTokenCache();
    throw new ShopifyError(
      "auth",
      "Shopify rejected the access token — check the Client ID/Secret and that the app is still installed on this store, then try again.",
    );
  }
  if (response.status === 402 || response.status === 403) {
    throw new ShopifyError("not_installed");
  }
  if (response.status === 404) {
    throw new ShopifyError(
      "not_installed",
      `Shopify shop or API version not found — check the SHOPIFY_SHOP subdomain and SHOPIFY_API_VERSION (${env.SHOPIFY_API_VERSION}).`,
    );
  }
  if (response.status === 429) {
    const retryAfter = response.headers.get("retry-after");
    throw new ShopifyError(
      "rate_limited",
      retryAfter
        ? `Shopify rate limit reached — retry after ${retryAfter}s.`
        : undefined,
    );
  }
  if (!response.ok) {
    throw new ShopifyError(
      "network",
      `Shopify returned HTTP ${response.status}. This is usually temporary — try again shortly.`,
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await response.json();
  } catch {
    throw new ShopifyError(
      "graphql_error",
      "Shopify returned a non-JSON response body.",
    );
  }

  const envelope = shopifyGraphqlEnvelopeSchema.safeParse(rawBody);
  if (!envelope.success) {
    throw new ShopifyError(
      "graphql_error",
      "Shopify returned an unrecognised response envelope.",
      { issues: envelope.error.issues.map((i) => i.message) },
    );
  }

  const cost = envelope.data.extensions?.cost ?? null;

  if (envelope.data.errors && envelope.data.errors.length > 0) {
    throw categoriseGraphqlErrors(envelope.data.errors, variableSummary);
  }

  const data = envelope.data.data;
  if (data === undefined || data === null) {
    throw new ShopifyError(
      "graphql_error",
      "Shopify returned no data for this operation.",
      { variables: variableSummary },
    );
  }

  if (options.schema) {
    const parsed = options.schema.safeParse(data);
    if (!parsed.success) {
      throw new ShopifyError(
        "graphql_error",
        "Shopify returned an unexpected response shape for this operation.",
        {
          issues: parsed.error.issues.map(
            (i) => `${i.path.join(".")}: ${i.message}`,
          ),
          variables: variableSummary,
        },
      );
    }
    return { data: parsed.data, cost };
  }

  return { data: data as T, cost };
}

/**
 * Checks a mutation payload's `userErrors`; throws a categorised
 * `user_error` with all messages joined. Also treats a missing payload
 * (mutation field resolved to null) as a failure.
 */
export function collectUserErrors(
  payload:
    | { userErrors?: readonly ShopifyUserError[] | null }
    | null
    | undefined,
  operation = "Shopify mutation",
): void {
  if (payload === null || payload === undefined) {
    throw new ShopifyError(
      "graphql_error",
      `Shopify returned no payload for ${operation}.`,
    );
  }
  const userErrors = payload.userErrors ?? [];
  if (userErrors.length === 0) return;

  const joined = userErrors
    .map((e) => {
      const field = e.field?.join(".") ?? "";
      return field ? `${field}: ${e.message}` : e.message;
    })
    .join("; ");
  throw new ShopifyError(
    "user_error",
    `Shopify rejected ${operation}: ${joined}`,
    { userErrors },
  );
}
