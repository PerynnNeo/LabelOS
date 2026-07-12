import "server-only";
import type { z } from "zod";
import { getEnv, isAnthropicConfigured } from "@/lib/env";
import type {
  BrandProfile,
  CollectionBrief,
  TrendReport,
  Usage,
} from "@/lib/domain/schemas";
import { trendReportSchema } from "@/lib/domain/schemas";
import { buildFallbackTrendRequest } from "@/lib/agents/trend-scout";
import {
  structuredCall,
  type StructuredCallOptions,
  type StructuredCallResult,
} from "./structured";
import { runTrendResearch } from "./web-search";
import { getMockAnthropicProvider } from "./mock-provider";

/**
 * Anthropic provider abstraction (spec sections 8, 25).
 *
 * Routes call {@link getAnthropicProvider} and never touch the raw client, so
 * the live and mock providers are interchangeable — exactly like the Shopify
 * provider. Missing credentials (or DEMO_MODE) select the deterministic mock so
 * the app is always demonstrable.
 */

export interface TrendResearchInput {
  brief: CollectionBrief;
  brandProfile: BrandProfile;
}

export interface TrendResearchOutput {
  report: TrendReport;
  usage: Usage;
}

export interface AnthropicProvider {
  /** True for the real API-backed provider, false for the deterministic mock. */
  readonly isLive: boolean;
  structuredCall<S extends z.ZodType>(
    opts: StructuredCallOptions<S>,
  ): Promise<StructuredCallResult<z.infer<S>>>;
  trendResearch(opts: TrendResearchInput): Promise<TrendResearchOutput>;
}

// ---------------------------------------------------------------------------
// Live provider
// ---------------------------------------------------------------------------

class LiveAnthropicProvider implements AnthropicProvider {
  readonly isLive = true;

  structuredCall<S extends z.ZodType>(
    opts: StructuredCallOptions<S>,
  ): Promise<StructuredCallResult<z.infer<S>>> {
    return structuredCall(opts);
  }

  async trendResearch({
    brief,
    brandProfile,
  }: TrendResearchInput): Promise<TrendResearchOutput> {
    // Live web-search path when enabled; otherwise a clearly-labelled
    // model-only fallback structured call.
    if (getEnv().ENABLE_CLAUDE_WEB_SEARCH) {
      const { report, usage } = await runTrendResearch({ brief, brandProfile });
      return { report, usage };
    }

    const fallback = buildFallbackTrendRequest({ brief, brandProfile });
    const { data, usage } = await structuredCall({
      schema: trendReportSchema,
      schemaName: fallback.schemaName,
      system: fallback.system,
      user: fallback.user,
      maxTokens: 8192,
      route: "collections.trends",
      entityId: null,
    });

    const report: TrendReport = {
      ...data,
      sourceMode: "model_only",
      market: brief.market,
      season: brief.season,
      generatedAt: new Date().toISOString(),
    };
    return { report, usage };
  }
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

let liveProvider: LiveAnthropicProvider | null = null;

/**
 * Real provider whenever an Anthropic key is configured; otherwise the
 * deterministic mock.
 *
 * Note (spec §1.3/§1.4): DEMO_MODE does NOT gate Claude. Demo mode governs
 * Shopify/supplier illustrative data and seeding — but garment analysis, outfit
 * evaluation, revision, gap explanation, concept generation, specification and
 * store copy must call the real Claude API whenever the key is present, even in
 * demo mode. A missing key must never crash the app — the mock path is always
 * available so the whole workflow stays demonstrable without credentials.
 */
export function getAnthropicProvider(): AnthropicProvider {
  const env = getEnv();
  if (isAnthropicConfigured(env)) {
    if (!liveProvider) liveProvider = new LiveAnthropicProvider();
    return liveProvider;
  }
  return getMockAnthropicProvider();
}
