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

export function isAuthConfigured(env: Env = getEnv()): boolean {
  return env.APP_ACCESS_CODE.length >= 8 && env.SESSION_SECRET.length >= 32;
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
  };
}
