import Link from "next/link";
import { integrationStatus } from "@/lib/env";
import {
  countProducts,
  getAppSettings,
  listCollections,
  type AppSettingsRow,
} from "@/lib/supabase/repositories";
import type { BrandProfile } from "@/lib/domain/schemas";
import {
  Card,
  CardTitle,
  Chip,
  EmptyState,
  Icon,
  PageHeader,
  SetupCard,
} from "@/components/lo";
import { money, pct } from "@/lib/ui/tokens";
import { isSetupError } from "@/app/app/_lib/server";
import { SeedButton } from "@/app/app/_components/seed-button";

/**
 * Brand Profile (`isBrand`). The onboarding checklist derives each step's state
 * from real backend signals; the profile grid and palette render from the stored
 * `brand_profile`. A Supabase/setup error degrades to a friendly card.
 */
export const dynamic = "force-dynamic";

interface BrandData {
  configured: boolean;
  settings: AppSettingsRow | null;
  productCount: number;
  analysedCount: number;
  collectionCount: number;
}

async function loadBrand(): Promise<BrandData> {
  try {
    const [settings, productCount, analysedCount, collections] =
      await Promise.all([
        getAppSettings(),
        countProducts(),
        countProducts({ analysisStatus: "complete" }),
        listCollections(),
      ]);
    return {
      configured: true,
      settings,
      productCount,
      analysedCount,
      collectionCount: collections.length,
    };
  } catch (error) {
    if (isSetupError(error)) {
      return {
        configured: false,
        settings: null,
        productCount: 0,
        analysedCount: 0,
        collectionCount: 0,
      };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Onboarding checklist
// ---------------------------------------------------------------------------

interface OnboardingStep {
  label: string;
  done: boolean;
  href?: string;
  ctaLabel?: string;
}

function onboardingSteps(
  data: BrandData,
  shopifyReady: boolean,
): OnboardingStep[] {
  return [
    { label: "Create brand profile", done: data.settings != null },
    {
      label: "Connect Shopify or use demo store",
      done: shopifyReady,
      href: "/app/integrations",
      ctaLabel: "Set up integrations",
    },
    {
      label: "Add or import products",
      done: data.productCount > 0,
      href: "/app/catalog",
      ctaLabel: "Add products",
    },
    {
      label: "Analyse & review catalog",
      done: data.analysedCount > 0,
      href: "/app/catalog",
      ctaLabel: "Review catalog",
    },
    {
      label: "Create first collection",
      done: data.collectionCount > 0,
      href: "/app/collections/new",
      ctaLabel: "Create first collection",
    },
  ];
}

// ---------------------------------------------------------------------------
// Palette — brand_profile.colours are names; map the common ones to a swatch
// colour and fall back to a deterministic tonal chip for anything unknown.
// ---------------------------------------------------------------------------

const COLOUR_HEX: Record<string, string> = {
  ivory: "#F3EFE6",
  cream: "#EFE9DB",
  bone: "#E7E0D2",
  sand: "#D9CDB8",
  stone: "#C9C2B4",
  taupe: "#B7A99A",
  clay: "#B8A48C",
  camel: "#C19A6B",
  terracotta: "#C57B57",
  blush: "#E7C9BE",
  charcoal: "#3A3A3D",
  ink: "#2B2B2E",
  black: "#1D1D1F",
  white: "#FFFFFF",
  "palm green": "#6E7F63",
  olive: "#7A7A52",
  "sea-salt blue": "#A9C0C9",
  "sea salt blue": "#A9C0C9",
  navy: "#2A3345",
  slate: "#5B6572",
};

function paletteBackground(name: string): string {
  const key = name.trim().toLowerCase();
  const hex = COLOUR_HEX[key];
  if (hex) return hex;
  // Deterministic neutral tint for unknown names so a swatch still renders.
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 22% 82%)`;
}

// ---------------------------------------------------------------------------
// Profile fields
// ---------------------------------------------------------------------------

function profileFields(
  settings: AppSettingsRow,
  profile: BrandProfile,
): Array<{ k: string; v: string }> {
  const currency = settings.currency || profile.typicalPriceRange.currency || "SGD";
  const symbol = currency === "SGD" ? "S$" : currency;
  const range = profile.typicalPriceRange;
  const fields: Array<{ k: string; v: string }> = [
    { k: "Customer", v: profile.audience || "—" },
    { k: "Target market", v: settings.market || "—" },
    { k: "Currency", v: `${currency} (${symbol})` },
    { k: "Climate", v: profile.climate || "—" },
    {
      k: "Price range",
      v: `${money(range.min, currency)} – ${money(range.max, currency)}`,
    },
    { k: "Target gross margin", v: pct(profile.targetGrossMargin) },
    { k: "Default season", v: profile.defaultSeason || "—" },
    {
      k: "Preferred colours",
      v: profile.colours.length ? profile.colours.join(" · ") : "—",
    },
    {
      k: "Styles to avoid",
      v: profile.prohibitedStyles.length
        ? profile.prohibitedStyles.join(" · ")
        : "—",
    },
  ];
  return fields;
}

export default async function BrandPage() {
  const status = integrationStatus();
  const data = await loadBrand();
  const shopifyReady = status.shopifyConfigured || status.demoMode;

  const steps = onboardingSteps(data, shopifyReady);
  const onboardingDone = steps.filter((s) => s.done).length;
  const firstIncompleteIdx = steps.findIndex((s) => !s.done);
  const cta = steps.find((s, i) => !s.done && i >= 1 && s.href);

  const settings = data.settings;
  const profile = settings?.brand_profile ?? null;

  return (
    <div>
      <PageHeader
        title="Brand Profile"
        subtitle="Everything the agents use to stay on-brand"
        actions={
          <button
            type="button"
            disabled
            title="Editing the brand profile is coming soon"
            className="inline-flex h-9 cursor-not-allowed items-center rounded-[9px] border border-[rgba(0,0,0,0.12)] bg-surface px-[15px] text-[13px] font-semibold text-ink opacity-50"
          >
            Edit profile
          </button>
        }
      />

      <div className="px-[30px] pb-11 pt-[22px]">
        {!data.configured ? (
          <SetupCard
            service="Supabase"
            message="Your brand profile lives in the database. Add the Supabase credentials and run the migration to view and edit it — until then LabelOS runs on demo defaults."
          />
        ) : (
          <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[300px_1fr]">
            {/* Onboarding checklist */}
            <Card className="px-5 py-[18px]">
              <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-accent">
                Getting started
              </div>
              <div className="my-1 text-[16px] font-bold text-ink">
                {onboardingDone} of 5 complete
              </div>
              <p className="mb-3.5 text-[12px] leading-snug text-muted">
                Finish these once and LabelOS runs end-to-end.
              </p>

              {steps.map((step, i) => {
                const state = step.done
                  ? "done"
                  : i === firstIncompleteIdx
                    ? "doing"
                    : "todo";
                return (
                  <div
                    key={step.label}
                    className="flex items-center gap-[11px] border-t border-[rgba(0,0,0,0.05)] py-[9px]"
                  >
                    <span
                      className="flex size-[22px] flex-none items-center justify-center rounded-full"
                      style={{
                        background: state === "done" ? "#34C759" : "transparent",
                        border:
                          state === "done"
                            ? "none"
                            : state === "doing"
                              ? "1.5px solid #0A84FF"
                              : "1.5px solid rgba(0,0,0,0.18)",
                      }}
                    >
                      {state === "done" ? (
                        <Icon
                          name="check"
                          size={12}
                          strokeWidth={3.2}
                          className="text-white"
                        />
                      ) : (
                        <span
                          className="block size-2 rounded-full"
                          style={{
                            background:
                              state === "doing" ? "#0A84FF" : "#C7C7CC",
                          }}
                        />
                      )}
                    </span>
                    <span
                      className="flex-1 text-[12.5px] text-ink"
                      style={{ fontWeight: state === "done" ? 500 : 600 }}
                    >
                      {step.label}
                    </span>
                    <span
                      className="text-[10.5px] font-semibold"
                      style={{
                        color:
                          state === "done"
                            ? "#248A3D"
                            : state === "doing"
                              ? "#B25000"
                              : "#8E8E93",
                      }}
                    >
                      {state === "done"
                        ? "Done"
                        : state === "doing"
                          ? "In progress"
                          : "To do"}
                    </span>
                  </div>
                );
              })}

              {cta?.href ? (
                <Link
                  href={cta.href}
                  className="mt-3.5 flex h-10 w-full items-center justify-center gap-1.5 rounded-[11px] bg-accent text-[13.5px] font-semibold text-white transition hover:brightness-[0.96]"
                >
                  {cta.ctaLabel}
                  <Icon name="arrow-right" size={15} strokeWidth={2} />
                </Link>
              ) : null}
            </Card>

            {/* Profile + palette */}
            <Card className="px-1.5 py-2">
              <div className="px-3.5 pb-2 pt-2.5">
                <CardTitle>Profile</CardTitle>
              </div>

              {profile && settings ? (
                <>
                  <div className="px-3.5 pb-1">
                    <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.03em] text-muted">
                      Palette
                    </div>
                    {profile.colours.length > 0 ? (
                      <div className="flex flex-wrap gap-3.5">
                        {profile.colours.slice(0, 8).map((name) => (
                          <div key={name} className="text-center">
                            <div
                              className="size-[34px] rounded-[9px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]"
                              style={{ background: paletteBackground(name) }}
                            />
                            <div className="mt-[5px] max-w-[54px] truncate text-[10.5px] capitalize text-muted">
                              {name}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[12.5px] text-muted">
                        No palette defined.
                      </div>
                    )}
                  </div>

                  {profile.personality.length > 0 ? (
                    <div className="px-3.5 pb-1 pt-3.5">
                      <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.03em] text-muted">
                        Personality
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {profile.personality.map((trait) => (
                          <Chip key={trait} className="capitalize">
                            {trait}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-3 grid grid-cols-1 gap-x-[18px] sm:grid-cols-2">
                    {profileFields(settings, profile).map((field) => (
                      <div
                        key={field.k}
                        className="flex justify-between gap-3 border-t border-[rgba(0,0,0,0.05)] px-3.5 py-[10px] text-[13px]"
                      >
                        <span className="flex-none text-muted">{field.k}</span>
                        <span className="text-right font-semibold text-ink">
                          {field.v}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyState
                  icon="user"
                  title="No brand profile yet"
                  description="Your brand profile powers every agent. Seed the demo dataset or configure your brand to populate it."
                  action={
                    status.demoMode && data.productCount === 0 ? (
                      <SeedButton variant="primary" size="sm" />
                    ) : undefined
                  }
                />
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
