import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getEnv, isAnthropicConfigured } from "@/lib/env";

/**
 * Server-only lazy Anthropic client singleton.
 *
 * The client is created on first use so a missing key never crashes app
 * startup — routes catch {@link AnthropicNotConfiguredError} (or the
 * `not_configured` category of `AnthropicCallError`) and return a friendly
 * setup message / fall back to the mock provider instead.
 */

export class AnthropicNotConfiguredError extends Error {
  constructor() {
    super(
      "Claude is not configured. Add ANTHROPIC_API_KEY to .env.local (create one in the Claude Console under API keys), optionally set ANTHROPIC_MODEL, then restart the server. " +
        "Until then, keep DEMO_MODE=true to use the built-in mock provider.",
    );
    this.name = "AnthropicNotConfiguredError";
  }
}

let client: Anthropic | null = null;
let clientApiKey: string | null = null;

/**
 * Returns the shared Anthropic client, creating it lazily.
 * Throws {@link AnthropicNotConfiguredError} when ANTHROPIC_API_KEY is unset.
 */
export function getAnthropicClient(): Anthropic {
  const env = getEnv();
  if (!isAnthropicConfigured(env)) {
    throw new AnthropicNotConfiguredError();
  }
  const apiKey = env.ANTHROPIC_API_KEY as string;
  if (!client || clientApiKey !== apiKey) {
    client = new Anthropic({ apiKey });
    clientApiKey = apiKey;
  }
  return client;
}

/** Test helper — drops the cached client so a new env is re-read. */
export function resetAnthropicClient(): void {
  client = null;
  clientApiKey = null;
}
