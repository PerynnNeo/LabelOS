import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { requireSession } from "@/lib/auth/require-session";
import type { Usage } from "@/lib/domain/schemas";
import { usageSchema } from "@/lib/domain/schemas";
import { getAnthropicProvider } from "@/lib/anthropic/provider";
import {
  AnthropicCallError,
  type AnthropicCallErrorCategory,
} from "@/lib/anthropic/structured";

/**
 * POST /api/integrations/anthropic/test (spec sections 8, 25, 26).
 *
 * A tiny connectivity probe. When a live provider is active it makes one small
 * structured call; in DEMO_MODE or when the key is missing the deterministic
 * mock is selected and we return a clearly-labelled mock success. The API key
 * is never returned to the browser.
 */
export const runtime = "nodejs";

interface AnthropicTestResponse {
  ok: boolean;
  model: string;
  live: boolean;
  mock: boolean;
  usage: Usage;
}

const probeSchema = z.object({
  ok: z.boolean(),
  model: z.string(),
});

function categoryToApiCode(category: AnthropicCallErrorCategory) {
  switch (category) {
    case "not_configured":
      return "PROVIDER_NOT_CONFIGURED" as const;
    case "rate_limit":
    case "overloaded":
      return "RATE_LIMITED" as const;
    default:
      return "PROVIDER_ERROR" as const;
  }
}

export async function POST(request: NextRequest) {
  return withApiErrorHandling<AnthropicTestResponse>(async (requestId) => {
    const session = await requireSession(request);
    if (!session.ok) {
      return apiError("UNAUTHORIZED", "A valid session is required.", {
        requestId,
      });
    }

    const provider = getAnthropicProvider();

    // Mock / DEMO_MODE / missing key → return a labelled mock success rather
    // than pretending to reach the API (the mock has no probe-schema handler).
    if (!provider.isLive) {
      return apiOk<AnthropicTestResponse>(
        {
          ok: true,
          model: "mock",
          live: false,
          mock: true,
          usage: usageSchema.parse({}),
        },
        requestId,
      );
    }

    try {
      const { data, usage } = await provider.structuredCall({
        schema: probeSchema,
        schemaName: "integration_test",
        system:
          "You are a connectivity probe for LabelOS. Reply only with the requested structured object.",
        user: 'Respond with {"ok": true, "model": "<your model id>"}. Set "ok" to true.',
        maxTokens: 128,
        route: "integrations.anthropic.test",
        entityId: null,
      });

      return apiOk<AnthropicTestResponse>(
        {
          ok: data.ok,
          // Report the configured model authoritatively — never trust the
          // model string Claude echoes back.
          model: getEnv().ANTHROPIC_MODEL,
          live: true,
          mock: false,
          usage,
        },
        requestId,
      );
    } catch (error) {
      if (error instanceof AnthropicCallError) {
        return apiError(categoryToApiCode(error.category), error.message, {
          requestId,
        });
      }
      throw error;
    }
  });
}
