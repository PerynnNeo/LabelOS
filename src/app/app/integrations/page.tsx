import { Database, Bot, Store, ShieldAlert } from "lucide-react";
import { integrationStatus } from "@/lib/env";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LimitationsPanel } from "@/components/limitations-panel";
import { PageHeader } from "@/app/app/_components/page-header";
import { IntegrationTestButton } from "@/app/app/_components/integration-test-button";

/**
 * Integrations (spec 23 & 26): Supabase / Anthropic / Shopify status with mode
 * and model indicators, connectivity test buttons, redacted (boolean-only)
 * configuration hints, the single-owner auth notice, and the MVP limitations.
 * No secret value is ever rendered — only booleans and non-sensitive labels.
 */
export const dynamic = "force-dynamic";

function ConfiguredBadge({ ok }: { ok: boolean }) {
  return (
    <Badge variant={ok ? "success" : "warning"} dot>
      {ok ? "Configured" : "Not configured"}
    </Badge>
  );
}

function HintRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}

export default function IntegrationsPage() {
  const status = integrationStatus();
  const shopifyLive =
    status.shopifyMode === "client_credentials" && status.shopifyConfigured;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Configuration"
        title="Integrations"
        description="LabelOS runs fully in demo mode without any credentials. Connect providers to go live — every secret stays server-side."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Supabase */}
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Database aria-hidden className="size-4 text-accent" />
              Supabase
            </CardTitle>
            <ConfiguredBadge ok={status.supabase} />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm leading-relaxed text-muted">
              Database and private/public storage buckets. Required for products,
              collections, and history.
            </p>
            <div className="border-t border-line pt-2">
              <HintRow
                label="Status"
                value={status.supabase ? "Connected" : "Awaiting credentials"}
              />
            </div>
            {!status.supabase ? (
              <p className="text-xs leading-relaxed text-muted">
                Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, then
                run supabase/migrations/001_initial.sql.
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* Anthropic */}
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Bot aria-hidden className="size-4 text-accent" />
              Anthropic
            </CardTitle>
            <Badge variant={status.anthropic ? "success" : "warning"} dot>
              {status.anthropic ? "Live" : "Mock"}
            </Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm leading-relaxed text-muted">
              Powers every agent. Without a key, high-quality deterministic mocks
              keep the app fully demonstrable.
            </p>
            <div className="border-t border-line pt-2">
              <HintRow label="Model" value={status.anthropicModel} />
              <HintRow
                label="Web search"
                value={status.webSearchEnabled ? "Enabled" : "Disabled"}
              />
            </div>
            <IntegrationTestButton kind="anthropic" />
          </CardContent>
        </Card>

        {/* Shopify */}
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Store aria-hidden className="size-4 text-accent" />
              Shopify
            </CardTitle>
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
              {shopifyLive ? "Live" : "Mock"}
            </Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm leading-relaxed text-muted">
              Draft and publish to your own owner-controlled store. The mock
              provider mirrors the real GraphQL flow for demos.
            </p>
            <div className="border-t border-line pt-2">
              <HintRow label="Mode" value={status.shopifyMode} />
              <HintRow
                label="Credentials"
                value={status.shopifyConfigured ? "Complete" : "Not set"}
              />
            </div>
            <IntegrationTestButton kind="shopify" />
          </CardContent>
        </Card>
      </div>

      {/* Redacted configuration hints — booleans and non-secret labels only. */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-x-8 sm:grid-cols-2">
          <HintRow label="Demo mode" value={status.demoMode ? "On" : "Off"} />
          <HintRow
            label="Authentication"
            value={status.authConfigured ? "Configured" : "Not configured"}
          />
          <HintRow
            label="Supabase"
            value={status.supabase ? "Connected" : "Not configured"}
          />
          <HintRow
            label="Anthropic key"
            value={status.anthropic ? "Present" : "Absent"}
          />
          <HintRow
            label="Shopify credentials"
            value={status.shopifyConfigured ? "Present" : "Absent"}
          />
          <HintRow
            label="Claude web search"
            value={status.webSearchEnabled ? "Enabled" : "Disabled"}
          />
        </CardContent>
      </Card>

      {/* Single-owner auth notice (spec §4). */}
      <div className="flex items-start gap-3 border border-warning/30 bg-warning/5 px-5 py-4">
        <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
        <p className="text-sm leading-relaxed text-ink">
          Single-owner hackathon authentication. Replace with proper user
          accounts before commercial use.
        </p>
      </div>

      <LimitationsPanel />
    </div>
  );
}
