import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type {
  ContentBlockParam,
  Message,
  TextBlock,
} from "@anthropic-ai/sdk/resources/messages";
import type { z } from "zod";
import { getEnv } from "@/lib/env";
import { usageSchema, type Usage } from "@/lib/domain/schemas";
import { logActivity } from "@/lib/logging/activity";
import {
  AnthropicNotConfiguredError,
  getAnthropicClient,
} from "./client";

/**
 * The single structured-output entry point for LabelOS (spec section 8).
 *
 * Every agent that needs Claude to return JSON goes through {@link structuredCall}.
 * It:
 *  1. builds a JSON-schema output format from the caller's Zod schema
 *     (`zodOutputFormat`, which strips JSON-schema keywords the API does not
 *     enforce — numeric bounds, string lengths — and folds them into the
 *     schema description);
 *  2. calls the Messages API with SDK retries disabled (we run our own);
 *  3. classifies the response — refusal, max-token cutoff, missing text block,
 *     malformed/invalid JSON — into a typed {@link AnthropicCallError};
 *  4. RE-VALIDATES the parsed object with the original Zod schema in
 *     application code (the API-side enforcement is best-effort only);
 *  5. records model, token usage, route, entity id, result status, duration,
 *     and error category to the activity log — never the API key or image data.
 *
 * Transient failures (rate limit, overloaded, network) are retried with
 * exponential backoff (500ms, 2000ms), at most twice. A single invalid-output
 * retry is allowed; refusals and validation failures are never retried further.
 */

// ---------------------------------------------------------------------------
// Error taxonomy
// ---------------------------------------------------------------------------

export type AnthropicCallErrorCategory =
  | "not_configured"
  | "auth"
  | "rate_limit"
  | "overloaded"
  | "refusal"
  | "max_tokens"
  | "invalid_output"
  | "network"
  | "unknown";

export class AnthropicCallError extends Error {
  readonly category: AnthropicCallErrorCategory;
  /** Underlying cause, when there is one (never contains the API key). */
  readonly cause?: unknown;

  constructor(
    category: AnthropicCallErrorCategory,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = "AnthropicCallError";
    this.category = category;
    this.cause = cause;
  }
}

const TRANSIENT_CATEGORIES: ReadonlySet<AnthropicCallErrorCategory> = new Set([
  "rate_limit",
  "overloaded",
  "network",
]);

/** Backoff schedule (ms) between transient retries. Length == max retries. */
const BACKOFF_MS = [500, 2000] as const;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A user message content: either plain text or an array of content blocks. */
export type AnthropicUserContent = Array<ContentBlockParam>;

export interface StructuredCallOptions<S extends z.ZodType> {
  /** Zod schema the output is validated against (source of truth). */
  schema: S;
  /** Canonical schema name; also drives the deterministic mock provider. */
  schemaName: string;
  /** System prompt (role text + grounding). */
  system: string;
  /** User message — a string, or content blocks (e.g. image + text). */
  user: string | AnthropicUserContent;
  /** Output token ceiling. Defaults to 4096. */
  maxTokens?: number;
  /** Route/action label for the activity log, e.g. "products.analyse". */
  route: string;
  /** Entity the call relates to, for the activity log. */
  entityId?: string | null;
}

export interface StructuredCallResult<T> {
  data: T;
  usage: Usage;
}

const DEFAULT_MAX_TOKENS = 4096;

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

/**
 * Map any thrown value into an {@link AnthropicCallError}. Order matters:
 * connection/auth/rate-limit subclasses are checked before the generic
 * APIError branch (they all extend APIError).
 */
export function classifyAnthropicError(error: unknown): AnthropicCallError {
  if (error instanceof AnthropicCallError) return error;

  if (error instanceof AnthropicNotConfiguredError) {
    return new AnthropicCallError("not_configured", error.message, error);
  }

  // Network / timeout — APIConnectionError (and its timeout subclass) carry no
  // HTTP status; treat as transient.
  if (error instanceof Anthropic.APIConnectionError) {
    return new AnthropicCallError(
      "network",
      "Could not reach the Claude API (network error or timeout).",
      error,
    );
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return new AnthropicCallError(
      "auth",
      "Claude rejected the API key (authentication failed). Check ANTHROPIC_API_KEY.",
      error,
    );
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AnthropicCallError(
      "rate_limit",
      "Claude rate limit hit. Backing off and retrying.",
      error,
    );
  }
  if (error instanceof Anthropic.APIError) {
    const status = typeof error.status === "number" ? error.status : undefined;
    const type = error.type ?? undefined;
    if (status === 529 || type === "overloaded_error") {
      return new AnthropicCallError(
        "overloaded",
        "Claude is temporarily overloaded (529).",
        error,
      );
    }
    if (status === 401) {
      return new AnthropicCallError(
        "auth",
        "Claude authentication failed (401).",
        error,
      );
    }
    if (status === 429) {
      return new AnthropicCallError("rate_limit", "Claude rate limit (429).", error);
    }
    return new AnthropicCallError(
      "unknown",
      `Claude API error${status ? ` (HTTP ${status})` : ""}: ${error.message}`,
      error,
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  return new AnthropicCallError("unknown", message, error);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractText(message: Message): string {
  return message.content
    .filter((block): block is TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function buildUsage(message: Message, durationMs: number): Usage {
  return usageSchema.parse({
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    webSearchRequests: message.usage.server_tool_use?.web_search_requests ?? 0,
    durationMs,
  });
}

function firstZodIssues(error: z.ZodError, max = 5): string {
  return error.issues
    .slice(0, max)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

// ---------------------------------------------------------------------------
// Single attempt (no retry) — throws AnthropicCallError
// ---------------------------------------------------------------------------

async function callOnce<S extends z.ZodType>(
  opts: StructuredCallOptions<S>,
): Promise<StructuredCallResult<z.infer<S>>> {
  const env = getEnv();
  const started = Date.now();

  // getAnthropicClient throws AnthropicNotConfiguredError when the key is unset.
  const client = getAnthropicClient();
  const format = zodOutputFormat(opts.schema);

  let message: Message;
  try {
    message = await client.messages.create(
      {
        model: env.ANTHROPIC_MODEL,
        max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
        output_config: { format },
      },
      { maxRetries: 0 },
    );
  } catch (error) {
    throw classifyAnthropicError(error);
  }

  if (message.stop_reason === "refusal") {
    throw new AnthropicCallError(
      "refusal",
      "Claude declined to answer this request (refusal). The prompt or image may have tripped a safety classifier.",
    );
  }
  if (message.stop_reason === "max_tokens") {
    throw new AnthropicCallError(
      "max_tokens",
      "Claude hit the output token limit before finishing; the structured result is incomplete. Increase maxTokens or simplify the request.",
    );
  }

  const text = extractText(message);
  if (text.trim() === "") {
    throw new AnthropicCallError(
      "invalid_output",
      "Claude returned no text block to parse.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new AnthropicCallError(
      "invalid_output",
      `Claude's output was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const result = opts.schema.safeParse(parsed);
  if (!result.success) {
    throw new AnthropicCallError(
      "invalid_output",
      `Claude's output failed schema validation: ${firstZodIssues(result.error)}`,
    );
  }

  return { data: result.data, usage: buildUsage(message, Date.now() - started) };
}

// ---------------------------------------------------------------------------
// Public entry point — retry wrapper + activity logging
// ---------------------------------------------------------------------------

export async function structuredCall<S extends z.ZodType>(
  opts: StructuredCallOptions<S>,
): Promise<StructuredCallResult<z.infer<S>>> {
  const env = getEnv();
  let transientAttempts = 0;
  let invalidRetried = false;

  for (;;) {
    try {
      const result = await callOnce(opts);
      // Success — record model, usage, route, entity id, duration.
      await logActivity({
        actor: opts.schemaName,
        action: opts.route,
        entityId: opts.entityId ?? null,
        provider: "anthropic",
        model: env.ANTHROPIC_MODEL,
        usage: result.usage,
        inputSummary: `${opts.schemaName} request`,
        outputSummary: `ok — ${result.usage.inputTokens} in / ${result.usage.outputTokens} out tokens in ${result.usage.durationMs}ms`,
        rawMetadata: { schemaName: opts.schemaName, status: "success" },
      });
      return result;
    } catch (error) {
      const callError = classifyAnthropicError(error);

      if (TRANSIENT_CATEGORIES.has(callError.category) && transientAttempts < BACKOFF_MS.length) {
        const delay = BACKOFF_MS[transientAttempts];
        transientAttempts += 1;
        await sleep(delay);
        continue;
      }
      // Allow exactly one retry for a malformed/invalid structured output.
      if (callError.category === "invalid_output" && !invalidRetried) {
        invalidRetried = true;
        continue;
      }

      await logActivity({
        actor: opts.schemaName,
        action: opts.route,
        entityId: opts.entityId ?? null,
        provider: "anthropic",
        model: env.ANTHROPIC_MODEL,
        inputSummary: `${opts.schemaName} request`,
        outputSummary: `error (${callError.category}): ${callError.message}`,
        rawMetadata: {
          schemaName: opts.schemaName,
          status: "error",
          errorCategory: callError.category,
        },
      });
      throw callError;
    }
  }
}
