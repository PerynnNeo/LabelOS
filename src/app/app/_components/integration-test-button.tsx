"use client";

import { useState } from "react";
import { CircleCheck, CircleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiRequest, errorMessage } from "@/app/app/_lib/api-client";

/**
 * Connectivity probe button for the Integrations screen. Calls the relevant
 * test route and surfaces a secret-free result inline. Never renders API keys
 * or tokens — only the labelled outcome the route returns.
 */

interface AnthropicResult {
  ok: boolean;
  model: string;
  live: boolean;
  mock: boolean;
}

interface ShopifyResult {
  shopName: string;
  domain: string;
  currency: string;
  mode: "mock" | "client_credentials";
}

export function IntegrationTestButton({
  kind,
}: {
  kind: "anthropic" | "shopify";
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<
    { ok: true; message: string } | { ok: false; message: string } | null
  >(null);

  async function runTest() {
    if (loading) return;
    setLoading(true);
    setResult(null);
    try {
      if (kind === "anthropic") {
        const data = await apiRequest<AnthropicResult>(
          "/api/integrations/anthropic/test",
          { method: "POST" },
        );
        const message = data.mock
          ? "Mock provider responded (no API key / demo mode)."
          : `Live Anthropic reachable — model ${data.model}.`;
        setResult({ ok: true, message });
      } else {
        const data = await apiRequest<ShopifyResult>(
          "/api/integrations/shopify/test",
          { method: "POST" },
        );
        const message =
          data.mode === "mock"
            ? `Mock store responded — ${data.shopName} (${data.currency}).`
            : `Connected to ${data.shopName} · ${data.domain} (${data.currency}).`;
        setResult({ ok: true, message });
      }
      toast.success("Test succeeded.");
    } catch (error) {
      const message = errorMessage(error);
      setResult({ ok: false, message });
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" size="sm" loading={loading} onClick={runTest}>
        Run test
      </Button>
      {result ? (
        <p
          className={
            result.ok
              ? "flex items-start gap-1.5 text-xs text-success"
              : "flex items-start gap-1.5 text-xs text-danger"
          }
        >
          {result.ok ? (
            <CircleCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          ) : (
            <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          )}
          <span>{result.message}</span>
        </p>
      ) : null}
    </div>
  );
}
