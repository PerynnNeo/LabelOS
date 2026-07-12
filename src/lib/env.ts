import { z } from "zod";

/**
 * Environment validation for LabelOS.
 *
 * Deliberately lenient: missing external credentials must never prevent the
 * app from starting. Routes that need a credential check the feature flags
 * below and return a friendly setup message instead of crashing.
 *
 * This module contains no secrets itself; modules that USE secrets
 * (Anthropic/Shopify/Supabase clients) are gated behind `server-only`.
 */

const boolString = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const envSchema = z.object({
  // Application
  APP_URL: z.string().default("http://localhost:3000"),
  APP_ACCESS_CODE: z.string().default(""),
  SESSION_SECRET: z.string().default(""),
  // "access_code" gates /app and mutation APIs behind the login code (default).
  // "open" disables the gate — the workspace is reachable with no login. Use
  // "open" only for local/demo; a public deployment should stay on access_code.
  AUTH_MODE: z.enum(["access_code", "open"]).default("access_code"),
  DEMO_MODE: boolString,
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // Cost and safety limits
  MAX_CATALOG_PRODUCTS: z.coerce.number().int().positive().default(20),
  MAX_CLAUDE_CALLS_PER_RUN: z.coerce.number().int().positive().default(40),
  MAX_TREND_SEARCH_USES: z.coerce.number().int().positive().default(3),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(8 * 1024 * 1024),

  // Anthropic — server only
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5"),
  ENABLE_CLAUDE_WEB_SEARCH: boolString,

  // Image generation — server only (garment concept images)
  IMAGE_PROVIDER: z.enum(["mock", "replicate"]).default("mock"),
  REPLICATE_API_TOKEN: z.string().optional(),
  REPLICATE_MODEL: z.string().default("black-forest-labs/flux-1.1-pro"),
  IMAGE_GENERATION_CONCURRENCY: z.coerce.number().int().positive().default(2),
  IMAGE_GENERATION_MAX_CONCEPTS: z.coerce.number().int().positive().default(12),
  SUPABASE_STORAGE_BUCKET_CONCEPTS: z.string().default("design-concepts"),

  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // Shopify — server only
  SHOPIFY_MODE: z.enum(["mock", "client_credentials"]).default("mock"),
  SHOPIFY_SHOP: z.string().optional(),
  SHOPIFY_CLIENT_ID: z.string().optional(),
  SHOPIFY_CLIENT_SECRET: z.string().optional(),
  SHOPIFY_API_VERSION: z.string().default("2026-07"),

  // Optional live-integration tests
  RUN_LIVE_TESTS: boolString,

  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

/** Parse an arbitrary env source. Exported for tests and verify-env. */
export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

let cached: Env | null = null;

export function getEnv(): Env {
  if (!cached) {
    cached = parseEnv(process.env);
  }
  return cached;
}

/** Test helper — clears the memoised env so a new process.env is re-read. */
export function resetEnvCache(): void {
  cached = null;
}

// ---------------------------------------------------------------------------
// Feature flags — routes use these to decide between real and mock providers
// ---------------------------------------------------------------------------

export function isSupabaseConfigured(env: Env = getEnv()): boolean {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

export function isAnthropicConfigured(env: Env = getEnv()): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}

export function isShopifyLive(env: Env = getEnv()): boolean {
  return (
    env.SHOPIFY_MODE === "client_credentials" &&
    Boolean(env.SHOPIFY_SHOP && env.SHOPIFY_CLIENT_ID && env.SHOPIFY_CLIENT_SECRET)
  );
}

/**
 * True when live garment-image generation is configured (Replicate selected and
 * a token present). Otherwise the deterministic SVG mock provider is used, so
 * the new-collection design flow always produces recognisable concept sheets
 * without any external image API.
 */
export function isImageProviderLive(env: Env = getEnv()): boolean {
  return env.IMAGE_PROVIDER === "replicate" && Boolean(env.REPLICATE_API_TOKEN);
}

export function isAuthConfigured(env: Env = getEnv()): boolean {
  return env.APP_ACCESS_CODE.length >= 8 && env.SESSION_SECRET.length >= 32;
}

/**
 * True when the access-code gate is disabled (AUTH_MODE=open). The proxy and
 * requireSession then let requests through without a session — intended for
 * local/demo use only.
 */
export function isAuthOpen(env: Env = getEnv()): boolean {
  return env.AUTH_MODE === "open";
}

export interface IntegrationStatus {
  demoMode: boolean;
  supabase: boolean;
  anthropic: boolean;
  anthropicModel: string;
  shopifyMode: "mock" | "client_credentials";
  shopifyConfigured: boolean;
  webSearchEnabled: boolean;
  authConfigured: boolean;
  imageProvider: "mock" | "replicate";
  imageProviderLive: boolean;
  imageModel: string;
}

export function integrationStatus(env: Env = getEnv()): IntegrationStatus {
  return {
    demoMode: env.DEMO_MODE,
    supabase: isSupabaseConfigured(env),
    anthropic: isAnthropicConfigured(env),
    anthropicModel: env.ANTHROPIC_MODEL,
    shopifyMode: env.SHOPIFY_MODE,
    shopifyConfigured: isShopifyLive(env),
    webSearchEnabled: env.ENABLE_CLAUDE_WEB_SEARCH,
    authConfigured: isAuthConfigured(env),
    imageProvider: env.IMAGE_PROVIDER,
    imageProviderLive: isImageProviderLive(env),
    imageModel: env.REPLICATE_MODEL,
  };
}
