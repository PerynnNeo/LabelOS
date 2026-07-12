import type { BrandProfile, CollectionBrief } from "@/lib/domain/schemas";
import { trendReportSchema } from "@/lib/domain/schemas";
import {
  AGENT_SCHEMA_NAMES,
  PROMPT_VERSIONS,
  formatBrandProfile,
  withGrounding,
} from "./common";

/**
 * LabelOS Trend Scout (spec section 8, Part VI — "Trend Scout").
 *
 * Two request builders:
 * - {@link TREND_SCOUT_SYSTEM} + {@link buildTrendResearchRequest}: the FIRST,
 *   web-search-enabled research call (used by web-search.ts) — free-form so
 *   Claude can gather and cite evidence.
 * - {@link buildFallbackTrendRequest}: the no-web-search structured call that
 *   produces a clearly-labelled `model_only` report with honest limitations.
 *
 * The trend report schema itself is re-exported so routes reference the
 * agent's contract here.
 */

const TREND_SCOUT_ROLE = `You are the LabelOS Trend Scout for an independent e-commerce clothing brand.
Investigate directions relevant to the specified market, season, climate,
audience, price tier, and brand identity. Distinguish emerging, growing,
established, declining, and uncertain signals. A viral post is not enough
evidence by itself. Prefer recent and independent sources. Explain relevance,
commercial use, climate fit, confidence, and limitations. Reject popular trends
that do not fit the brand. Do not present forecasting as certainty.`;

export const TREND_SCOUT_SYSTEM = withGrounding(TREND_SCOUT_ROLE);

export const trendSchema = trendReportSchema;

/** Shared brief block used by every trend request. */
function briefBlock(brief: CollectionBrief, brand: BrandProfile): string {
  return [
    "Brand profile:",
    formatBrandProfile(brand),
    "",
    "Collection brief:",
    `- Market: ${brief.market}`,
    `- Season: ${brief.season}`,
    `- Climate: ${brief.climate}`,
    `- Audience: ${brief.audience}`,
    `- Price tier: ${brief.priceTier}`,
    `- Commercial objective: ${brief.commercialObjective}`,
    brief.prohibitedStyles.length
      ? `- Prohibited styles: ${brief.prohibitedStyles.join(", ")}`
      : "- Prohibited styles: none stated",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Live web-search research call (first of two). Free-form; NO structured schema.
// ---------------------------------------------------------------------------

export interface TrendResearchPrompt {
  system: string;
  user: string;
  promptVersion: string;
}

/**
 * Build the free-form research prompt for the web-search call. The prompt asks
 * Claude to search for and summarise cited evidence — it does NOT ask for the
 * final schema (a separate structured call converts the evidence into it).
 */
export function buildTrendResearchRequest(input: {
  brief: CollectionBrief;
  brandProfile: BrandProfile;
  maxSearches: number;
}): TrendResearchPrompt {
  const { brief, brandProfile, maxSearches } = input;
  const user = [
    `Research current fashion directions for this brand and brief. Use at most ${maxSearches} web searches, preferring recent, independent sources.`,
    "",
    briefBlock(brief, brandProfile),
    "",
    "For each direction you find, note: what it is, how established it is, why it is (or is not) relevant to THIS brand's audience and tropical climate, and the source (title, URL, date). Explicitly flag popular directions that do NOT fit the brand so they can be rejected. Do not overstate certainty.",
  ].join("\n");

  return {
    system: TREND_SCOUT_SYSTEM,
    user,
    promptVersion: PROMPT_VERSIONS.trendScout,
  };
}

// ---------------------------------------------------------------------------
// Evidence → schema conversion call (second of two).
// ---------------------------------------------------------------------------

export interface TrendSynthesisRequest {
  system: string;
  user: string;
  schemaName: string;
  promptVersion: string;
}

const TREND_SYNTHESIS_ROLE = `You are the LabelOS Trend Scout writing up research that has already been
gathered. Convert the supplied evidence and source list into the Trend Report
structured output. Use ONLY the evidence and sources provided below — do not add
directions that are not supported by the evidence, and cite only from the given
source list. Set every signal's confidence honestly and populate limitations.
The application sets sourceMode, market, season and generatedAt after you
respond, so focus on the signals, rejected signals, and limitations.`;

/**
 * Build the structured conversion call that turns gathered web-search evidence
 * into a {@link trendReportSchema} report. Fed the evidence text and source
 * list — never open-ended internet instructions.
 */
export function buildTrendSynthesisRequest(input: {
  brief: CollectionBrief;
  brandProfile: BrandProfile;
  evidenceText: string;
  sources: Array<{ title: string; url: string; date: string | null }>;
}): TrendSynthesisRequest {
  const { brief, brandProfile, evidenceText, sources } = input;
  const sourceList =
    sources.length > 0
      ? sources
          .map(
            (source, index) =>
              `[${index + 1}] ${source.title} — ${source.url}${source.date ? ` (${source.date})` : ""}`,
          )
          .join("\n")
      : "(no sources were cited by the search)";

  const user = [
    briefBlock(brief, brandProfile),
    "",
    "Gathered evidence:",
    evidenceText.trim() || "(no evidence text was returned)",
    "",
    "Cited sources:",
    sourceList,
    "",
    "Produce the Trend Report structured output: signals (each with adoptionStage, relevanceToBrand, climateFit, confidence 0-1, recommendedUse, avoidBecause, and sources drawn from the list above), rejectedSignals, and limitations.",
  ].join("\n");

  return {
    system: withGrounding(TREND_SYNTHESIS_ROLE),
    user,
    schemaName: AGENT_SCHEMA_NAMES.trendReport,
    promptVersion: PROMPT_VERSIONS.trendScout,
  };
}

// ---------------------------------------------------------------------------
// Fallback (no web search) structured call.
// ---------------------------------------------------------------------------

const TREND_FALLBACK_ROLE = `You are the LabelOS Trend Scout. Live web research is DISABLED for this run, so
you have no current market evidence. Produce demonstration hypotheses only —
directional ideas grounded in the brand and climate, not claims about current
market data. Leave every signal's sources empty, keep confidence modest, and
state clearly in limitations that these are model-only hypotheses without live
evidence. The application labels the report sourceMode "model_only".`;

/**
 * Build the no-web-search structured request. The resulting report must be
 * clearly labelled as model-only with limitations noting the absence of live
 * evidence (the provider also forces sourceMode to "model_only").
 */
export function buildFallbackTrendRequest(input: {
  brief: CollectionBrief;
  brandProfile: BrandProfile;
}): TrendSynthesisRequest {
  const { brief, brandProfile } = input;
  const user = [
    briefBlock(brief, brandProfile),
    "",
    "Web search is disabled. Propose 3 directional hypotheses (signals) and at least 1 rejectedSignal that would NOT fit this brand. Every signal must have an empty sources array, an honest confidence (0-1), and clear reasoning tying it to the audience and tropical climate. In limitations, state that these are demonstration hypotheses generated without live market evidence.",
  ].join("\n");

  return {
    system: withGrounding(TREND_FALLBACK_ROLE),
    user,
    schemaName: AGENT_SCHEMA_NAMES.trendReport,
    promptVersion: PROMPT_VERSIONS.trendScout,
  };
}
