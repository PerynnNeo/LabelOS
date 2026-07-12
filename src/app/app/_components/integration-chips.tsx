import type { IntegrationStatus } from "@/lib/env";
import { Badge } from "@/components/ui/badge";

/**
 * Row of integration status pills (Supabase / Anthropic / Shopify) with mode
 * and model annotations. Presentational; the type import is erased at build.
 */
export function IntegrationChips({ status }: { status: IntegrationStatus }) {
  const shopifyLabel =
    status.shopifyMode === "client_credentials"
      ? status.shopifyConfigured
        ? "Shopify · live"
        : "Shopify · incomplete"
      : "Shopify · mock";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={status.supabase ? "success" : "neutral"} dot>
        Supabase {status.supabase ? "connected" : "not configured"}
      </Badge>
      <Badge variant={status.anthropic ? "success" : "warning"} dot>
        Anthropic {status.anthropic ? "live" : "mock"} · {status.anthropicModel}
      </Badge>
      <Badge
        variant={
          status.shopifyMode === "client_credentials"
            ? status.shopifyConfigured
              ? "success"
              : "warning"
            : "neutral"
        }
        dot
      >
        {shopifyLabel}
      </Badge>
      {status.webSearchEnabled ? (
        <Badge variant="accent">Web search on</Badge>
      ) : (
        <Badge variant="neutral">Web search off</Badge>
      )}
      {status.demoMode ? <Badge variant="accent">Demo mode</Badge> : null}
    </div>
  );
}
