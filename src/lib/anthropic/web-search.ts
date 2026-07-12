import "server-only";
import type {
  Message,
  WebSearchTool20260209,
} from "@anthropic-ai/sdk/resources/messages";
import { getEnv } from "@/lib/env";
import type {
  BrandProfile,
  CollectionBrief,
  TrendReport,
  Usage,
} from "@/lib/domain/schemas";
import { trendReportSchema } from "@/lib/domain/schemas";
import { logActivity } from "@/lib/logging/activity";
import {
  buildTrendResearchRequest,
  buildTrendSynthesisRequest,
} from "@/lib/agents/trend-scout";
import { getAnthropicClient } from "./client";
import {
  AnthropicCallError,
  classifyAnthropicError,
  structuredCall,
} from "./structured";

/**
 * Live trend research (spec section 8 — "Trend research", live mode).
 *
 * Two-call pattern:
 *  1. A web-search-enabled Messages call gathers cited evidence (capped at
 *     MAX_TREND_SEARCH_USES searches). We collect the text + unique cited
 *     sources from the response's text and web_search_tool_result blocks.
 *  2. A SECOND structured call converts that evidence — and only that evidence
 *     — into a {@link trendReportSchema} report. The application then forces
 *     sourceMode="live_web_search" and stamps market/season/generatedAt.
 *
 * Throws {@link AnthropicCallError} on failure (missing key, provider error, or
 * a search that returned no usable evidence).
 */

export interface TrendSource {
  title: string;
  url: string;
  date: string | null;
}

export interface TrendResearchResult {
  report: TrendReport;
  usage: Usage;
  rawEvidence: {
    evidenceText: string;
    sources: TrendSource[];
  };
}

function addSource(
  sources: Map<string, TrendSource>,
  title: string,
  url: string,
  date: string | null,
): void {
  if (!url) return;
  const existing = sources.get(url);
  if (existing) {
    // Keep the first non-null date and the longest title.
    if (!existing.date && date) existing.date = date;
    if (title && title.length > existing.title.length) existing.title = title;
    return;
  }
  sources.set(url, { title: title || url, url, date });
}

/**
 * Walk the web-search response, collecting evidence text and unique cited
 * sources. Text-block citations and web_search_tool_result blocks both
 * contribute sources; a search error is captured but not thrown here.
 */
function collectEvidence(message: Message): {
  evidenceText: string;
  sources: TrendSource[];
  searchErrorCode: string | null;
} {
  const textParts: string[] = [];
  const sources = new Map<string, TrendSource>();
  let searchErrorCode: string | null = null;

  for (const block of message.content) {
    if (block.type === "text") {
      textParts.push(block.text);
      for (const citation of block.citations ?? []) {
        if (citation.type === "web_search_result_location") {
          addSource(sources, citation.title ?? citation.url, citation.url, null);
        }
      }
    } else if (block.type === "web_search_tool_result") {
      const content = block.content;
      if (Array.isArray(content)) {
        for (const result of content) {
          addSource(sources, result.title, result.url, result.page_age);
        }
      } else {
        searchErrorCode = content.error_code;
      }
    }
  }

  return {
    evidenceText: textParts.join("\n").trim(),
    sources: [...sources.values()],
    searchErrorCode,
  };
}

function webSearchTool(maxUses: number): WebSearchTool20260209 {
  return {
    type: "web_search_20260209",
    name: "web_search",
    max_uses: maxUses,
  };
}

export async function runTrendResearch(input: {
  brief: CollectionBrief;
  brandProfile: BrandProfile;
}): Promise<TrendResearchResult> {
  const { brief, brandProfile } = input;
  const env = getEnv();
  const maxSearches = env.MAX_TREND_SEARCH_USES;

  const research = buildTrendResearchRequest({
    brief,
    brandProfile,
    maxSearches,
  });

  // ---- Call 1: web-search evidence gathering -----------------------------
  const client = getAnthropicClient();
  const searchStarted = Date.now();
  let searchMessage: Message;
  try {
    searchMessage = await client.messages.create(
      {
        model: env.ANTHROPIC_MODEL,
        max_tokens: 4096,
        system: research.system,
        messages: [{ role: "user", content: research.user }],
        tools: [webSearchTool(maxSearches)],
      },
      { maxRetries: 0 },
    );
  } catch (error) {
    throw classifyAnthropicError(error);
  }
  const searchDurationMs = Date.now() - searchStarted;

  if (searchMessage.stop_reason === "refusal") {
    throw new AnthropicCallError(
      "refusal",
      "Claude declined the trend-research request.",
    );
  }

  const { evidenceText, sources, searchErrorCode } =
    collectEvidence(searchMessage);
  const webSearchRequests =
    searchMessage.usage.server_tool_use?.web_search_requests ?? 0;

  await logActivity({
    actor: "trend-scout",
    action: "collections.trends.search",
    provider: "anthropic",
    model: env.ANTHROPIC_MODEL,
    usage: {
      inputTokens: searchMessage.usage.input_tokens,
      outputTokens: searchMessage.usage.output_tokens,
      webSearchRequests,
      durationMs: searchDurationMs,
    },
    inputSummary: `trend web search (${brief.market} · ${brief.season})`,
    outputSummary: searchErrorCode
      ? `search error: ${searchErrorCode}; ${sources.length} source(s) collected`
      : `${sources.length} source(s), ${webSearchRequests} search(es)`,
    rawMetadata: { searchErrorCode, sourceCount: sources.length },
  });

  if (evidenceText === "" && sources.length === 0) {
    throw new AnthropicCallError(
      searchErrorCode ? "unknown" : "invalid_output",
      searchErrorCode
        ? `Web search failed (${searchErrorCode}) and returned no usable evidence.`
        : "The web-search call returned no evidence or sources to build a trend report from.",
    );
  }

  // ---- Call 2: structured evidence → TrendReport -------------------------
  const synthesis = buildTrendSynthesisRequest({
    brief,
    brandProfile,
    evidenceText,
    sources,
  });

  const { data, usage: synthUsage } = await structuredCall({
    schema: trendReportSchema,
    schemaName: synthesis.schemaName,
    system: synthesis.system,
    user: synthesis.user,
    maxTokens: 8192,
    route: "collections.trends",
    entityId: null,
  });

  // Application owns the provenance-critical fields.
  const report: TrendReport = {
    ...data,
    sourceMode: "live_web_search",
    market: brief.market,
    season: brief.season,
    generatedAt: new Date().toISOString(),
  };

  const usage: Usage = {
    inputTokens: searchMessage.usage.input_tokens + synthUsage.inputTokens,
    outputTokens: searchMessage.usage.output_tokens + synthUsage.outputTokens,
    webSearchRequests: webSearchRequests + synthUsage.webSearchRequests,
    durationMs: searchDurationMs + synthUsage.durationMs,
  };

  return { report, usage, rawEvidence: { evidenceText, sources } };
}
