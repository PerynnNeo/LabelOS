"use client";

import { useEffect, useState } from "react";
import { AgentTrace, type AgentTraceEntry } from "@/components/lo";
import { formatDate, formatRelative } from "@/lib/utils";

/**
 * Developer activity timeline. Renders the shared <AgentTrace> from serialisable
 * rows, mapping actor slugs to display names and building the mono token line.
 * Relative time is computed only after mount (deterministic absolute date on the
 * server/first render) so there is no hydration mismatch.
 */

export interface ActivityRowLite {
  id: string;
  actor: string;
  action: string;
  inputSummary: string;
  outputSummary: string;
  provider: string | null;
  model: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    webSearchRequests: number;
    durationMs: number;
  };
  status: string | null;
  createdAt: string;
}

/** Actor slug → display name (aligns with the agent colour map where it can). */
const ACTOR_LABELS: Record<string, string> = {
  "collection-curator": "Collection Curator",
  "flat-sketch": "Flat Sketch",
  "gap-designer": "Gap Designer",
  "garment-analyst": "Garment Librarian",
  "listing-writer": "Listing Writer",
  "outfit-composer": "Outfit Composer",
  "outfit-critic": "Runway Jury",
  "outfit-reviser": "Outfit Reviser",
  "rfq-generator": "RFQ Generator",
  seed: "Seed",
  "shopify-import": "Shopify Import",
  "tech-pack-writer": "Tech Pack Writer",
  "trend-scout": "Trend Scout",
  user: "Owner",
  system: "System",
};

function actorLabel(actor: string): string {
  if (ACTOR_LABELS[actor]) return ACTOR_LABELS[actor];
  return actor
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

function tokenLine(row: ActivityRowLite): string {
  const parts: string[] = [];
  const model = row.model ?? row.provider;
  if (model) parts.push(model);
  const tok = row.usage.inputTokens + row.usage.outputTokens;
  if (tok > 0) parts.push(`${tok.toLocaleString("en-US")} tok`);
  if (row.usage.durationMs > 0) {
    parts.push(`${(row.usage.durationMs / 1000).toFixed(1)}s`);
  }
  if (row.usage.webSearchRequests > 0) {
    parts.push(`${row.usage.webSearchRequests} web search`);
  }
  if (row.status === "error") parts.push("error");
  if (row.status === "running") parts.push("running");
  return parts.length > 0 ? parts.join(" · ") : row.action;
}

export function ActivityTimeline({ entries }: { entries: ActivityRowLite[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const mapped: AgentTraceEntry[] = entries.map((row) => ({
    id: row.id,
    actor: actorLabel(row.actor),
    action: row.inputSummary || row.action,
    detail: row.outputSummary || undefined,
    tokens: tokenLine(row),
    running: row.status === "running",
    error: row.status === "error",
    time: mounted ? formatRelative(row.createdAt) : formatDate(row.createdAt),
  }));

  return <AgentTrace entries={mapped} />;
}
