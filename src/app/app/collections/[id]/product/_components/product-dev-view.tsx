"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import type { DesignRow } from "@/lib/supabase/repositories";
import {
  newDesignSchema,
  type Costing,
  type NewDesign,
  type TechPack,
} from "@/lib/domain/schemas";
import {
  Card,
  Pill,
  Button,
  Swatch,
  NextAction,
  Icon,
  AgentAvatar,
} from "@/components/lo";
import { money, pct } from "@/lib/ui/tokens";
import { cn } from "@/lib/utils";
import { apiRequest, errorMessage } from "@/app/app/_lib/api-client";

export type ProductTab = "concepts" | "spec";

// ---------------------------------------------------------------------------
// Segmented Concepts ↔ Specification toggle (rendered in the page header).
// Drives the active tab through the `?tab=` search param so the server owns
// the header/tracker/footer chrome.
// ---------------------------------------------------------------------------
export function PdTabToggle({
  collectionId,
  tab,
}: {
  collectionId: string;
  tab: ProductTab;
}) {
  const router = useRouter();
  const base = `/app/collections/${collectionId}/product`;
  const go = (next: ProductTab) => {
    router.push(next === "concepts" ? base : `${base}?tab=spec`);
  };
  const item = (value: ProductTab, label: string) => {
    const active = tab === value;
    return (
      <button
        type="button"
        onClick={() => go(value)}
        aria-pressed={active}
        className={cn(
          "rounded-[7px] px-3.5 py-1.5 text-[12.5px] font-semibold transition",
          active
            ? "bg-surface text-accent shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
            : "text-muted hover:text-ink2",
        )}
      >
        {label}
      </button>
    );
  };
  return (
    <div className="flex rounded-[9px] bg-[rgba(120,120,128,0.12)] p-0.5">
      {item("concepts", "Concepts")}
      {item("spec", "Specification")}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function designImageUrl(design: DesignRow): string | undefined {
  const brief =
    design.design_brief && typeof design.design_brief === "object"
      ? (design.design_brief as Record<string, unknown>)
      : {};
  const manual = brief.manualImageUrl;
  if (typeof manual === "string" && /^https?:\/\//i.test(manual)) return manual;
  return design.rendered_image_path ?? undefined;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const RISK_COLOR: Record<NewDesign["estimatedRisk"], string> = {
  low: "#248A3D",
  medium: "#B25000",
  high: "#C4271B",
};

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------
export interface ProductDevViewProps {
  tab: ProductTab;
  collectionId: string;
  collectionName: string;
  climate: string;
  design: DesignRow | null;
}

export function ProductDevView({
  tab,
  collectionId,
  climate,
  design,
}: ProductDevViewProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [detecting, setDetecting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [drafting, setDrafting] = useState(false);

  const briefResult = design ? newDesignSchema.safeParse(design.design_brief) : null;
  const brief: NewDesign | null = briefResult?.success ? briefResult.data : null;
  const costing: Costing | null = design?.costing ?? null;
  const techPack: TechPack | null = design?.tech_pack ?? null;
  const imageUrl = design ? designImageUrl(design) : undefined;
  const currency = costing?.currency ?? "SGD";
  const approved = design ? design.status === "approved" || design.status === "in_development" : false;

  // -- Actions --------------------------------------------------------------
  async function runGap() {
    setDetecting(true);
    try {
      await apiRequest(`/api/collections/${collectionId}/gap`, {
        method: "POST",
        body: {},
      });
      toast.success("Assortment gap detected — a new concept is ready.");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDetecting(false);
    }
  }

  async function generateDrafts(designId: string): Promise<boolean> {
    let ok = true;
    try {
      await apiRequest(`/api/designs/${designId}/render`, { method: "POST" });
    } catch {
      ok = false;
    }
    try {
      await apiRequest(`/api/designs/${designId}/tech-pack`, { method: "POST" });
    } catch (error) {
      ok = false;
      toast.error(errorMessage(error));
    }
    return ok;
  }

  async function approveConcept() {
    if (!design) return;
    setApproving(true);
    try {
      await apiRequest(`/api/designs/${design.id}`, {
        method: "PATCH",
        body: { status: "approved" },
      });
    } catch (error) {
      toast.error(errorMessage(error));
      setApproving(false);
      return;
    }
    const clean = await generateDrafts(design.id);
    toast[clean ? "success" : "warning"](
      clean
        ? "Concept approved — draft specification ready."
        : "Concept approved. Some drafts could not be generated — retry from the specification tab.",
    );
    setApproving(false);
    router.push(`${pathname}?tab=spec`);
    router.refresh();
  }

  async function draftSpecOnly() {
    if (!design) return;
    setDrafting(true);
    const clean = await generateDrafts(design.id);
    if (clean) toast.success("Draft specification generated.");
    setDrafting(false);
    router.refresh();
  }

  // -- Empty (no design yet) ------------------------------------------------
  if (!design || !brief) {
    return (
      <div className="px-[30px] pb-10 pt-1">
        {tab === "concepts" ? (
          <NextAction
            icon="layers"
            title="Detect the assortment gap"
            help="The Gap Analyst reviews your final outfits and proposes one new garment to complete the collection. Costing is computed in code, never by the model."
            action={{
              label: "Detect the assortment gap",
              onClick: runGap,
              loading: detecting,
            }}
          />
        ) : (
          <Card className="p-[18px]">
            <div className="text-[14.5px] font-[650] text-ink">
              No specification yet
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink3">
              Detect the assortment gap on the Concepts tab and approve the
              concept — the draft tech pack, costing and bill of materials appear
              here once a design exists.
            </p>
          </Card>
        )}
      </div>
    );
  }

  // -- Concepts tab ---------------------------------------------------------
  if (tab === "concepts") {
    const unlocked = brief.outfitIdsUnlocked.length;
    return (
      <div className="px-[30px] pb-10 pt-1">
        {/* Gap Analyst */}
        <Card className="mb-4 flex items-start gap-4 p-[18px_20px]">
          <AgentAvatar actor="Gap Designer" size={38} />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-muted">
              Gap Analyst · detected assortment gap
            </div>
            <div className="mt-1 text-[16px] font-bold tracking-[-0.01em] text-ink">
              {brief.problemSolved}
            </div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink2">
              {brief.targetCustomer}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="text-[11.5px] text-muted">Unlocks:</span>
              <Pill fg="#248A3D" bg="rgba(52,199,89,0.12)">
                {unlocked > 0
                  ? `${unlocked} final look${unlocked === 1 ? "" : "s"}`
                  : "Completes the assortment"}
              </Pill>
            </div>
          </div>
        </Card>

        {/* Next action */}
        <NextAction
          className="mb-[18px]"
          title="Select a concept, then approve it to prepare a specification"
          help={
            <>
              Currently selected: <b className="text-ink">{brief.name}</b> ·
              target gross margin {costing ? pct(costing.targetGrossMargin) : "—"}.
              This concept is an AI proposal, not production approved.
            </>
          }
          action={{
            label: approved ? "Regenerate specification" : "Approve concept & prepare spec",
            onClick: approveConcept,
            loading: approving,
          }}
        />

        {/* The one real concept card */}
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ConceptCard
            brief={brief}
            costing={costing}
            climate={climate}
            imageUrl={imageUrl}
            approved={approved}
            currency={currency}
          />
        </div>

        {/* Future actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <span title="Coming soon" className="inline-block">
            <Button variant="secondary" size="sm" disabled>
              Request variations
            </Button>
          </span>
          <span className="text-[11.5px] text-faint">
            One garment per collection in this release — variations are coming soon.
          </span>
        </div>
      </div>
    );
  }

  // -- Specification tab ----------------------------------------------------
  return (
    <div className="px-[30px] pb-10 pt-1">
      {/* Draft warning */}
      <div className="mb-4 flex items-start gap-3 rounded-[13px] border border-[rgba(255,149,0,0.22)] bg-[rgba(255,149,0,0.09)] px-4 py-3">
        <Icon
          name="alert-triangle"
          size={16}
          className="mt-0.5 flex-none text-[#B25000]"
        />
        <div className="text-[12.5px] leading-relaxed text-[#7A4A00]">
          <b className="font-[650]">
            Draft specification — requires product-development and sample
            validation.
          </b>{" "}
          Measurements and costs are AI estimates, not manufacturing-ready.
          {techPack ? (
            <span className="ml-1 font-mono text-[11px] text-[#8A5A12]">
              ({techPack.status})
            </span>
          ) : null}
        </div>
      </div>

      {!techPack ? (
        <Card className="p-[18px]">
          <div className="text-[14.5px] font-[650] text-ink">
            No draft specification yet
          </div>
          <p className="mt-1 mb-3 text-[12.5px] leading-relaxed text-ink3">
            The Tech Pack Writer drafts a bill of materials, construction notes
            and a quality checklist for {brief.name}. Costs remain code-computed.
          </p>
          <Button size="sm" onClick={draftSpecOnly} loading={drafting}>
            Draft specification now
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[1.4fr_1fr] lg:items-start">
          {/* Left: BOM + notes + open questions */}
          <div className="flex flex-col gap-4">
            <Card className="p-[18px_20px]">
              <div className="mb-3 flex items-center gap-2.5">
                <div className="flex-1 text-[15px] font-[650] text-ink">
                  {techPack.garmentName || brief.name}
                </div>
                <span className="rounded-full bg-[rgba(120,120,128,0.12)] px-[9px] py-[3px] font-mono text-[11px] font-semibold text-ink2">
                  {techPack.styleCode} · v{techPack.version}
                </span>
              </div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.03em] text-muted">
                Bill of materials
              </div>
              <div className="overflow-x-auto">
                {techPack.billOfMaterials.length === 0 ? (
                  <p className="py-2 text-[12.5px] text-muted">
                    No bill-of-materials rows drafted.
                  </p>
                ) : (
                  techPack.billOfMaterials.map((row, i) => (
                    <div
                      key={`${row.item}-${i}`}
                      className="flex items-center gap-3 border-b border-[rgba(0,0,0,0.05)] py-[7px] text-[12.5px]"
                    >
                      <span className="min-w-0 flex-1 truncate text-ink2">
                        {row.item}
                      </span>
                      <span className="hidden w-[120px] flex-none truncate text-muted sm:block">
                        {row.placement}
                      </span>
                      <span className="w-[130px] flex-none truncate text-right text-ink3">
                        {row.composition}
                      </span>
                      <Pill
                        tone={
                          row.verified
                            ? { label: "", fg: "#248A3D", bg: "rgba(52,199,89,0.14)" }
                            : { label: "", fg: "#B25000", bg: "rgba(255,149,0,0.15)" }
                        }
                      >
                        {row.verified ? "Verified" : "Unverified"}
                      </Pill>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Card className="p-[16px_18px]">
                <div className="mb-2.5 text-[13.5px] font-[650] text-ink">
                  Construction notes
                </div>
                <BulletList items={techPack.constructionNotes} tone="neutral" />
              </Card>
              <Card className="p-[16px_18px]">
                <div className="mb-2.5 text-[13.5px] font-[650] text-ink">
                  Quality checklist
                </div>
                <CheckList items={techPack.qualityChecks} />
              </Card>
            </div>

            <Card className="p-[16px_18px]">
              <div className="text-[13.5px] font-[650] text-ink">
                Measurement assumptions &amp; open questions
              </div>
              <div className="mb-2.5 mt-1 text-[11.5px] text-muted">
                Sizes {techPack.sizeRange.length ? techPack.sizeRange.join(" · ") : "S–XL"}
                {" · measurements estimated from comparable styles"}
              </div>
              <QuestionList
                items={[...techPack.assumptions, ...techPack.unresolvedQuestions]}
              />
            </Card>
          </div>

          {/* Right: costing + labels + send */}
          <div className="flex flex-col gap-4">
            <Card className="p-[18px_20px]">
              <div className="mb-3 text-[14.5px] font-[650] text-ink">
                Costing &amp; margin
              </div>
              {costing ? (
                <>
                  <SpecRow
                    label="Target unit cost"
                    value={money(costing.detailedEstimate.maximumFactoryCost, currency)}
                  />
                  <SpecRow
                    label="Est. landed cost"
                    value={money(costing.maximumLandedCost, currency)}
                  />
                  <SpecRow
                    label="Retail"
                    value={money(costing.targetRetailPrice, currency)}
                  />
                  <div className="mt-3 flex gap-2.5">
                    <div className="flex-1 rounded-[11px] bg-[rgba(52,199,89,0.1)] px-3.5 py-2.5">
                      <div className="text-[11px] text-[#248A3D]">Gross margin</div>
                      <div className="text-[19px] font-bold text-[#248A3D]">
                        {pct(costing.targetGrossMargin)}
                      </div>
                    </div>
                    <div className="flex-1 rounded-[11px] bg-canvas px-3.5 py-2.5">
                      <div className="text-[11px] text-muted">MOQ cash commit</div>
                      <div className="text-[19px] font-bold text-ink">
                        {money(150 * costing.detailedEstimate.maximumFactoryCost, currency)}
                      </div>
                    </div>
                  </div>
                  <p className="mt-2.5 text-[11px] leading-relaxed text-faint">
                    MOQ cash = 150 units × maximum factory cost. Landed cost = retail
                    × (1 − target margin), computed in code.
                  </p>
                </>
              ) : (
                <p className="text-[12.5px] text-muted">No costing model available.</p>
              )}
            </Card>

            <Card className="p-[16px_18px]">
              <div className="mb-2.5 text-[13.5px] font-[650] text-ink">
                Labels &amp; packaging
              </div>
              {techPack.labelling.length || techPack.packaging.length ? (
                <BulletList
                  items={[...techPack.labelling, ...techPack.packaging]}
                  tone="neutral"
                />
              ) : (
                <p className="text-[12px] leading-relaxed text-ink2">
                  Woven main label · care + content label · recycled polybag ·
                  kraft hang-tag with QR to lookbook.
                </p>
              )}
            </Card>

            <a
              href={`/app/designs/${design.id}/print`}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-[9px] border border-[rgba(0,0,0,0.12)] bg-surface px-4 text-[13px] font-semibold text-ink transition hover:bg-[#FAFAFA]"
            >
              <Icon name="eye" size={15} />
              Open tech-pack print view
            </a>

            <Button
              size="md"
              className="h-[46px] w-full"
              onClick={() => router.push(`/app/collections/${collectionId}/sourcing`)}
            >
              Send to Production &amp; Sourcing
              <Icon name="arrow-right" size={16} strokeWidth={2} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Concept card
// ---------------------------------------------------------------------------
function ConceptCard({
  brief,
  costing,
  climate,
  imageUrl,
  approved,
  currency,
}: {
  brief: NewDesign;
  costing: Costing | null;
  climate: string;
  imageUrl: string | undefined;
  approved: boolean;
  currency: string;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-[16px] border-[1.5px] border-accent bg-surface shadow-card">
      {/* Front / back with overlay label */}
      <div className="relative flex gap-1.5 p-2.5 pb-0">
        <span className="absolute left-[15px] top-[15px] z-[2] rounded-[6px] bg-black/55 px-2 py-[3px] text-[10px] font-bold text-white backdrop-blur-[3px]">
          AI concept — not production approved
        </span>
        <Swatch
          className="flex-1"
          aspect="3/4"
          rounded={9}
          seed={`${brief.name}-front`}
          imageUrl={imageUrl}
          label="Front"
        />
        <Swatch
          className="flex-1"
          aspect="3/4"
          rounded={9}
          seed={`${brief.name}-back`}
          label="Back"
        />
      </div>

      <div className="flex flex-1 flex-col p-[13px_15px_15px]">
        <div className="mb-1.5 flex items-center gap-2">
          <Pill
            tone={
              approved
                ? { label: "", fg: "#248A3D", bg: "rgba(52,199,89,0.15)" }
                : { label: "", fg: "#0863C4", bg: "rgba(10,132,255,0.13)" }
            }
          >
            {approved ? "Approved" : "AI proposal"}
          </Pill>
        </div>
        <div className="text-[15px] font-bold tracking-[-0.01em] text-ink">
          {brief.name}
        </div>
        <div className="mt-0.5 text-[11.5px] text-muted">
          {titleCase(brief.category)} · {brief.silhouette}
        </div>

        {/* Colourway */}
        <div className="my-3 flex items-center gap-2">
          <span
            className="size-5 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)]"
            style={{ background: brief.colourHex }}
            aria-hidden
          />
          <span className="text-[11.5px] text-ink2">{brief.colour}</span>
        </div>

        {/* Rows */}
        <div className="flex flex-col gap-1.5 text-[11.5px]">
          <SpecMini label="Material" value={brief.fabricRequirements.join(", ") || "—"} />
          <SpecMini label="Construction" value={brief.constructionDirection} />
          <SpecMini label="Climate" value={climate} />
          <SpecMini label="For" value={brief.targetCustomer} />
          <SpecMini
            label="Risk"
            value={`${titleCase(brief.estimatedRisk)} risk`}
            valueColor={RISK_COLOR[brief.estimatedRisk]}
          />
        </div>

        {/* Retail / cost / margin */}
        <div className="my-3 flex gap-2 border-y border-[rgba(0,0,0,0.06)] py-[11px]">
          <div className="flex-1">
            <div className="text-[10.5px] text-muted">Retail</div>
            <div className="text-[15px] font-bold text-ink">
              {costing ? money(costing.targetRetailPrice, currency) : "—"}
            </div>
          </div>
          <div className="flex-1">
            <div className="text-[10.5px] text-muted">Est. cost</div>
            <div className="text-[15px] font-bold text-ink">
              {costing ? money(costing.maximumLandedCost, currency) : "—"}
            </div>
          </div>
          <div className="flex-1">
            <div className="text-[10.5px] text-muted">Margin</div>
            <div className="text-[15px] font-bold text-[#248A3D]">
              {costing ? pct(costing.targetGrossMargin) : "—"}
            </div>
          </div>
        </div>

        <div className="mt-auto flex h-9 items-center justify-center gap-1.5 rounded-[9px] bg-[rgba(10,132,255,0.1)] text-[13px] font-semibold text-accent">
          <Icon name="check" size={15} strokeWidth={2.4} />
          Selected concept
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------
function SpecMini({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex gap-2">
      <span className="w-[74px] flex-none text-muted">{label}</span>
      <span
        className="min-w-0 flex-1 text-ink2"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.05)] py-[7px] text-[13px]">
      <span className="text-muted">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </div>
  );
}

function BulletList({
  items,
  tone,
}: {
  items: string[];
  tone: "neutral";
}) {
  if (items.length === 0) {
    return <p className="text-[12px] text-muted">None recorded.</p>;
  }
  return (
    <div className="flex flex-col">
      {items.map((t, i) => (
        <div key={i} className="flex items-start gap-2 py-1">
          <span
            className={cn(
              "mt-1.5 size-[5px] flex-none rounded-full",
              tone === "neutral" && "bg-[#C7C7CC]",
            )}
          />
          <span className="text-[12px] leading-relaxed text-ink2">{t}</span>
        </div>
      ))}
    </div>
  );
}

function CheckList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="text-[12px] text-muted">None recorded.</p>;
  }
  return (
    <div className="flex flex-col">
      {items.map((t, i) => (
        <div key={i} className="flex items-start gap-2 py-1">
          <Icon
            name="check"
            size={13}
            strokeWidth={2.6}
            className="mt-0.5 flex-none text-[#248A3D]"
          />
          <span className="text-[12px] leading-relaxed text-ink2">{t}</span>
        </div>
      ))}
    </div>
  );
}

function QuestionList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return (
      <p className="text-[12px] text-muted">
        No open questions — verify measurements against a physical sample.
      </p>
    );
  }
  return (
    <div className="flex flex-col">
      {items.map((t, i) => (
        <div key={i} className="flex items-start gap-2 py-1">
          <Icon
            name="info"
            size={13}
            strokeWidth={2}
            className="mt-0.5 flex-none text-[#B25000]"
          />
          <span className="text-[12px] leading-relaxed text-ink2">{t}</span>
        </div>
      ))}
    </div>
  );
}
