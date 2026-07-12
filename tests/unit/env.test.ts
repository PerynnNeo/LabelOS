import { describe, it, expect } from "vitest";
import {
  parseEnv,
  integrationStatus,
  isSupabaseConfigured,
  isAnthropicConfigured,
  isShopifyLive,
  isAuthConfigured,
} from "@/lib/env";

/**
 * parseEnv is a pure function over an arbitrary source object, so these tests
 * never touch process.env. integrationStatus is derived from a parsed Env.
 */

describe("parseEnv defaults", () => {
  it("applies documented defaults when the source is empty", () => {
    const env = parseEnv({} as NodeJS.ProcessEnv);
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.APP_ACCESS_CODE).toBe("");
    expect(env.SESSION_SECRET).toBe("");
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.ANTHROPIC_MODEL).toBe("claude-sonnet-5");
    expect(env.SHOPIFY_MODE).toBe("mock");
    expect(env.SHOPIFY_API_VERSION).toBe("2026-07");
    expect(env.NODE_ENV).toBe("development");
    // numeric defaults
    expect(env.MAX_CATALOG_PRODUCTS).toBe(20);
    expect(env.MAX_CLAUDE_CALLS_PER_RUN).toBe(40);
    expect(env.MAX_TREND_SEARCH_USES).toBe(3);
    expect(env.MAX_UPLOAD_BYTES).toBe(8 * 1024 * 1024);
    // boolean defaults
    expect(env.DEMO_MODE).toBe(false);
    expect(env.ENABLE_CLAUDE_WEB_SEARCH).toBe(false);
    expect(env.RUN_LIVE_TESTS).toBe(false);
  });
});

describe("boolean coercion", () => {
  it("treats only 'true' and '1' as true", () => {
    expect(parseEnv({ DEMO_MODE: "true" } as never).DEMO_MODE).toBe(true);
    expect(parseEnv({ DEMO_MODE: "1" } as never).DEMO_MODE).toBe(true);
    expect(parseEnv({ DEMO_MODE: "false" } as never).DEMO_MODE).toBe(false);
    expect(parseEnv({ DEMO_MODE: "0" } as never).DEMO_MODE).toBe(false);
    expect(parseEnv({ DEMO_MODE: "yes" } as never).DEMO_MODE).toBe(false);
    expect(parseEnv({ DEMO_MODE: "" } as never).DEMO_MODE).toBe(false);
    expect(parseEnv({} as never).DEMO_MODE).toBe(false);
  });

  it("coerces ENABLE_CLAUDE_WEB_SEARCH and RUN_LIVE_TESTS the same way", () => {
    const env = parseEnv({
      ENABLE_CLAUDE_WEB_SEARCH: "1",
      RUN_LIVE_TESTS: "true",
    } as never);
    expect(env.ENABLE_CLAUDE_WEB_SEARCH).toBe(true);
    expect(env.RUN_LIVE_TESTS).toBe(true);
  });
});

describe("limits coercion", () => {
  it("coerces numeric strings to numbers", () => {
    const env = parseEnv({
      MAX_CATALOG_PRODUCTS: "5",
      MAX_CLAUDE_CALLS_PER_RUN: "12",
      MAX_TREND_SEARCH_USES: "2",
      MAX_UPLOAD_BYTES: "1024",
    } as never);
    expect(env.MAX_CATALOG_PRODUCTS).toBe(5);
    expect(env.MAX_CLAUDE_CALLS_PER_RUN).toBe(12);
    expect(env.MAX_TREND_SEARCH_USES).toBe(2);
    expect(env.MAX_UPLOAD_BYTES).toBe(1024);
  });

  it("rejects non-positive limits", () => {
    expect(() => parseEnv({ MAX_CLAUDE_CALLS_PER_RUN: "0" } as never)).toThrow(
      /Invalid environment configuration/,
    );
    expect(() => parseEnv({ MAX_CATALOG_PRODUCTS: "-3" } as never)).toThrow();
  });

  it("rejects non-integer limits", () => {
    expect(() => parseEnv({ MAX_TREND_SEARCH_USES: "3.5" } as never)).toThrow();
  });

  it("rejects an invalid LOG_LEVEL enum", () => {
    expect(() => parseEnv({ LOG_LEVEL: "trace" } as never)).toThrow();
  });
});

describe("integrationStatus flags across configs", () => {
  it("reports everything off for an empty config", () => {
    const env = parseEnv({} as never);
    const status = integrationStatus(env);
    expect(status).toEqual({
      demoMode: false,
      supabase: false,
      anthropic: false,
      anthropicModel: "claude-sonnet-5",
      shopifyMode: "mock",
      shopifyConfigured: false,
      webSearchEnabled: false,
      authConfigured: false,
    });
  });

  it("flags Supabase only when BOTH url and service key are present", () => {
    expect(
      isSupabaseConfigured(
        parseEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" } as never),
      ),
    ).toBe(false);
    expect(
      isSupabaseConfigured(
        parseEnv({
          NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: "service-key",
        } as never),
      ),
    ).toBe(true);
  });

  it("flags Anthropic when a key is set", () => {
    expect(isAnthropicConfigured(parseEnv({} as never))).toBe(false);
    expect(
      isAnthropicConfigured(parseEnv({ ANTHROPIC_API_KEY: "sk-x" } as never)),
    ).toBe(true);
  });

  it("flags Shopify live only in client_credentials mode with all credentials", () => {
    // Correct mode but missing credentials → not live.
    expect(
      isShopifyLive(parseEnv({ SHOPIFY_MODE: "client_credentials" } as never)),
    ).toBe(false);
    // All credentials present but mode still mock → not live.
    expect(
      isShopifyLive(
        parseEnv({
          SHOPIFY_SHOP: "shop",
          SHOPIFY_CLIENT_ID: "id",
          SHOPIFY_CLIENT_SECRET: "secret",
        } as never),
      ),
    ).toBe(false);
    const live = parseEnv({
      SHOPIFY_MODE: "client_credentials",
      SHOPIFY_SHOP: "shop",
      SHOPIFY_CLIENT_ID: "id",
      SHOPIFY_CLIENT_SECRET: "secret",
    } as never);
    expect(isShopifyLive(live)).toBe(true);
    expect(integrationStatus(live).shopifyMode).toBe("client_credentials");
    expect(integrationStatus(live).shopifyConfigured).toBe(true);
  });

  it("flags auth only with an 8+ char access code and a 32+ char session secret", () => {
    expect(
      isAuthConfigured(
        parseEnv({ APP_ACCESS_CODE: "short", SESSION_SECRET: "x".repeat(40) } as never),
      ),
    ).toBe(false);
    expect(
      isAuthConfigured(
        parseEnv({ APP_ACCESS_CODE: "longenough", SESSION_SECRET: "tooshort" } as never),
      ),
    ).toBe(false);
    expect(
      isAuthConfigured(
        parseEnv({
          APP_ACCESS_CODE: "longenough",
          SESSION_SECRET: "x".repeat(32),
        } as never),
      ),
    ).toBe(true);
  });

  it("reflects demoMode and webSearch toggles", () => {
    const env = parseEnv({
      DEMO_MODE: "true",
      ENABLE_CLAUDE_WEB_SEARCH: "true",
    } as never);
    const status = integrationStatus(env);
    expect(status.demoMode).toBe(true);
    expect(status.webSearchEnabled).toBe(true);
  });
});
