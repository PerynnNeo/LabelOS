import { integrationStatus } from "@/lib/env";
import { isSetupError } from "@/app/app/_lib/server";
import { countProducts, listCollections } from "@/lib/supabase/repositories";
import { PageHeader, Icon } from "@/components/lo";
import { LimitationsPanel } from "@/components/lo/limitations-panel";
import { ConnectionTest } from "./_components/connection-test";
import { ModelSafetyCard } from "./_components/model-safety-card";

/**
 * Integrations (spec 23 & 26): Anthropic / Supabase / Shopify connection rows
 * with status dots, mode/model meta and connectivity tests; the display-only
 * Model & safety controls; the single-owner auth notice; and the MVP
 * limitations. No secret value is ever rendered — only booleans, mode labels
 * and the (non-sensitive) model id.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Counts {
  products: number;
  collections: number;
}

async function loadCounts(): Promise<{ counts: Counts; supabase: boolean }> {
  try {
    const [products, collections] = await Promise.all([
      countProducts(),
      listCollections(),
    ]);
    return {
      counts: { products, collections: collections.length },
      supabase: true,
    };
  } catch (error) {
    if (isSetupError(error)) {
      return { counts: { products: 0, collections: 0 }, supabase: false };
    }
    throw error;
  }
}

const OK = { dot: "#34C759", fg: "#248A3D", bg: "rgba(52,199,89,0.14)" };
const WARN = { dot: "#FF9500", fg: "#B25000", bg: "rgba(255,149,0,0.14)" };

interface Connection {
  name: string;
  mono: string;
  color: string;
  connected: boolean;
  status: string;
  meta: string;
  desc: string;
  test?: "anthropic" | "shopify";
}

export default async function IntegrationsPage() {
  const status = integrationStatus();
  const { counts, supabase } = await loadCounts();

  const shopifyLive =
    status.shopifyMode === "client_credentials" && status.shopifyConfigured;

  const connections: Connection[] = [
    {
      name: "Anthropic",
      mono: "A",
      color: "#D97757",
      connected: status.anthropic,
      status: status.anthropic ? "Connected" : "Mock mode",
      meta: status.anthropicModel,
      desc: "Powers every agent — analysis, styling, critique, product design.",
      test: "anthropic",
    },
    {
      name: "Supabase",
      mono: "S",
      color: "#3ECF8E",
      connected: supabase,
      status: supabase ? "Connected" : "Not configured",
      meta: supabase
        ? `${counts.products} products · ${counts.collections} collections`
        : "awaiting migration",
      desc: "Database, auth and image storage for the catalog.",
    },
    {
      name: "Shopify",
      mono: "S",
      color: "#95BF47",
      connected: shopifyLive,
      status: shopifyLive ? "Connected" : "Mock mode",
      meta: shopifyLive ? "live store · draft-only" : "labelos-demo · draft-only",
      desc: "Product publishing. Locked to draft creation with your approval.",
      test: "shopify",
    },
  ];

  return (
    <div>
      <PageHeader
        title="Integrations"
        subtitle="Connections, model settings and safety controls"
      />

      <div className="max-w-[860px] px-[30px] pb-11 pt-[22px]">
        {/* Connections */}
        <div className="mx-1 mb-2.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-muted">
          Connections
        </div>
        <div className="mb-[26px] overflow-hidden lo-card">
          {connections.map((c, i) => (
            <div
              key={c.name}
              className={
                "flex items-center gap-3.5 px-[18px] py-4" +
                (i < connections.length - 1
                  ? " border-b border-[rgba(0,0,0,0.05)]"
                  : "")
              }
            >
              <div
                className="flex size-10 flex-none items-center justify-center rounded-[11px] text-[17px] font-extrabold text-white"
                style={{ background: c.color }}
                aria-hidden
              >
                {c.mono}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[14.5px] font-[650] text-ink">
                  {c.name}
                  <span
                    aria-hidden
                    className="size-[7px] rounded-full"
                    style={{ background: c.connected ? OK.dot : WARN.dot }}
                  />
                </div>
                <div className="mt-0.5 text-[12px] text-muted">{c.desc}</div>
              </div>
              <div className="flex flex-none flex-col items-end gap-1.5 text-right">
                <span
                  className="inline-block rounded-full px-[11px] py-[3px] text-[12px] font-semibold"
                  style={{
                    color: c.connected ? OK.fg : WARN.fg,
                    background: c.connected ? OK.bg : WARN.bg,
                  }}
                >
                  {c.status}
                </span>
                <span className="font-mono text-[11px] text-faint">
                  {c.meta}
                </span>
                {c.test ? <ConnectionTest kind={c.test} /> : null}
              </div>
            </div>
          ))}
        </div>

        {/* Model & safety */}
        <div className="mx-1 mb-2.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-muted">
          Model &amp; safety
        </div>
        <ModelSafetyCard webSearchEnabled={status.webSearchEnabled} />

        {/* Single-owner auth notice (spec §4) */}
        <div className="mt-[26px] flex items-start gap-3 rounded-[14px] border border-[rgba(255,149,0,0.3)] bg-[rgba(255,149,0,0.07)] px-[18px] py-4">
          <div className="mt-0.5 flex-none text-[#B25000]">
            <Icon name="alert-triangle" size={18} />
          </div>
          <p className="text-[13px] leading-relaxed text-ink2">
            <b className="font-[650] text-ink">
              Single-owner hackathon authentication.
            </b>{" "}
            One shared owner access code protects the whole workspace. Replace it
            with proper per-user accounts before any commercial use.
          </p>
        </div>

        {/* MVP limitations */}
        <div className="mt-[18px]">
          <LimitationsPanel />
        </div>
      </div>
    </div>
  );
}
