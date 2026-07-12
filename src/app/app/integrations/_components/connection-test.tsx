"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/lo";
import { apiRequest, errorMessage } from "@/app/app/_lib/api-client";

/**
 * Connectivity probe button for a single integration row. Calls the relevant
 * test route and surfaces a secret-free result inline — never an API key or
 * token, only the labelled outcome the route returns (model id / mock-vs-live,
 * or shop name / domain / currency).
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

export function ConnectionTest({ kind }: { kind: "anthropic" | "shopify" }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<
    { ok: boolean; message: string } | null
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
        setResult({
          ok: true,
          message: data.mock
            ? "Mock provider responded (no key / demo mode)."
            : `Live — model ${data.model}.`,
        });
      } else {
        const data = await apiRequest<ShopifyResult>(
          "/api/integrations/shopify/test",
          { method: "POST" },
        );
        setResult({
          ok: true,
          message:
            data.mode === "mock"
              ? `Mock store — ${data.shopName} (${data.currency}).`
              : `${data.shopName} · ${data.domain} (${data.currency}).`,
        });
      }
      toast.success("Connection test succeeded.");
    } catch (error) {
      const message = errorMessage(error);
      setResult({ ok: false, message });
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={runTest}
        disabled={loading}
        className="inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-[rgba(0,0,0,0.12)] bg-surface px-3 text-[12.5px] font-semibold text-ink transition hover:bg-[#FAFAFA] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <span
            aria-hidden
            className="size-3.5 animate-[lo-spin_0.7s_linear_infinite] rounded-full border-2 border-current border-t-transparent"
          />
        ) : (
          <Icon name="refresh-cw" size={13} strokeWidth={1.9} />
        )}
        Test
      </button>
      {result ? (
        <p
          className="flex max-w-[220px] items-start justify-end gap-1 text-right text-[11px] leading-snug"
          style={{ color: result.ok ? "#248A3D" : "#C4271B" }}
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
