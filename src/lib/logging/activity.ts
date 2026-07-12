import "server-only";
import { insertActivityLog } from "@/lib/supabase/repositories";
import type { Usage } from "@/lib/domain/schemas";

/**
 * Activity log writer. Logging must never break the main flow: failures are
 * swallowed and reported via console.error only.
 *
 * Safety rules enforced here:
 * - summaries are truncated to 500 characters;
 * - image bytes / binary data are never written (replaced with a marker);
 * - metadata keys that look like secrets are redacted;
 * - oversized metadata strings (e.g. accidental base64) are truncated.
 */

const MAX_SUMMARY_LENGTH = 500;
const MAX_METADATA_STRING_LENGTH = 2_000;
const MAX_METADATA_ARRAY_LENGTH = 50;
const MAX_METADATA_DEPTH = 4;
const SECRET_KEY_PATTERN =
  /(api[_-]?key|secret|token|password|authorization|credential|cookie|session)/i;

export interface LogActivityInput {
  /** Which agent or subsystem acted, e.g. "garment-analyst", "user", "seed". */
  actor: string;
  /** What happened, e.g. "product.analyse", "shopify.draft.create". */
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  inputSummary?: string;
  outputSummary?: string;
  provider?: string | null;
  model?: string | null;
  usage?: Partial<Usage>;
  rawMetadata?: Record<string, unknown>;
}

function truncate(value: string, max = MAX_SUMMARY_LENGTH): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function scrub(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return truncate(value, MAX_METADATA_STRING_LENGTH);
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (
    value instanceof Uint8Array ||
    value instanceof ArrayBuffer ||
    (typeof Buffer !== "undefined" && Buffer.isBuffer(value))
  ) {
    return "[binary omitted]";
  }
  if (depth <= 0) return "[depth limit]";
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_METADATA_ARRAY_LENGTH)
      .map((item) => scrub(item, depth - 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY_PATTERN.test(key)
        ? "[redacted]"
        : scrub(entry, depth - 1);
    }
    return out;
  }
  return String(value);
}

/**
 * Write one activity-log row. Never throws — a failed log write is reported
 * to the server console and otherwise ignored so it cannot break the caller.
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    await insertActivityLog({
      actor: input.actor,
      action: input.action,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      input_summary: truncate(input.inputSummary ?? ""),
      output_summary: truncate(input.outputSummary ?? ""),
      provider: input.provider ?? null,
      model: input.model ?? null,
      usage: input.usage ?? {},
      raw_metadata: scrub(input.rawMetadata ?? {}, MAX_METADATA_DEPTH) as Record<
        string,
        unknown
      >,
    });
  } catch (error) {
    console.error(
      `[activity] failed to write activity log for action "${input.action}"`,
      error,
    );
  }
}
