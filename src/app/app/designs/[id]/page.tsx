import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { getSessionFromCookies } from "@/lib/auth/require-session";
import { SupabaseNotConfiguredError } from "@/lib/supabase/admin";
import { getDesign, type DesignRow } from "@/lib/supabase/repositories";
import { newDesignSchema, type NewDesign } from "@/lib/domain/schemas";
import { SKETCH_DISCLAIMER } from "@/lib/domain/flat-sketch";
import {
  Card,
  CardHeader,
  CardTitle,
  CardRow,
  Chip,
  EmptyState,
  Pill,
  SetupCard,
} from "@/components/lo";
import { type Tone } from "@/lib/ui/tokens";
import { formatCurrency, formatDate } from "@/lib/utils";

/**
 * Design overview.
 *
 * Session-protected server component summarising one proposed design: its brief,
 * the code-computed costing model, the flat sketch, and downstream status (tech
 * pack / listing / Shopify draft), with links to the printable tech pack and
 * back to the collection studio.
 *
 * Reads the design directly from the service-role repository layer → Node.
 */
export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RISK_TONE: Record<NewDesign["estimatedRisk"], Tone> = {
  low: { label: "Low risk", fg: "#248A3D", bg: "rgba(52,199,89,0.14)" },
  medium: { label: "Medium risk", fg: "#B25000", bg: "rgba(255,149,0,0.15)" },
  high: { label: "High risk", fg: "#C4271B", bg: "rgba(255,59,48,0.14)" },
};

function designImageUrl(design: DesignRow): string | null {
  const brief =
    design.design_brief && typeof design.design_brief === "object"
      ? (design.design_brief as Record<string, unknown>)
      : {};
  const manual = brief.manualImageUrl;
  if (typeof manual === "string" && /^https?:\/\//i.test(manual)) return manual;
  return design.rendered_image_path ?? null;
}

function humanizeStatus(status: string): string {
  const spaced = status.replace(/[_-]+/g, " ").trim().toLowerCase();
  if (!spaced) return "Draft";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function StatusRow({
  label,
  done,
  doneLabel,
  pendingLabel,
}: {
  label: string;
  done: boolean;
  doneLabel: string;
  pendingLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-[rgba(0,0,0,0.05)] px-4 py-[11px]">
      <span className="text-[13px] text-ink2">{label}</span>
      {done ? (
        <Pill
          dot
          fg="#248A3D"
          bg="rgba(52,199,89,0.15)"
          label={doneLabel}
        />
      ) : (
        <Pill dot fg="#6E6E73" bg="rgba(120,120,128,0.14)" label={pendingLabel} />
      )}
    </div>
  );
}

function CostTile({
  label,
  value,
  accent,
  positive,
}: {
  label: string;
  value: string;
  accent?: boolean;
  positive?: boolean;
}) {
  return (
    <div
      className="flex-1 rounded-[11px] px-3.5 py-3"
      style={{
        background: positive
          ? "rgba(52,199,89,0.1)"
          : accent
            ? "rgba(10,132,255,0.08)"
            : "#F5F5F7",
      }}
    >
      <div
        className="text-[11px] font-medium"
        style={{ color: positive ? "#248A3D" : "#8E8E93" }}
      >
        {label}
      </div>
      <div
        className="mt-1 text-[19px] font-bold tracking-[-0.01em]"
        style={{ color: positive ? "#248A3D" : "#1D1D1F" }}
      >
        {value}
      </div>
    </div>
  );
}

function TagValue({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="text-muted">—</span>;
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {items.map((item, index) => (
        <Chip key={index}>{item}</Chip>
      ))}
    </div>
  );
}

export default async function DesignOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionFromCookies();
  if (!session.ok) {
    redirect("/login?next=/app/dashboard");
  }

  const { id } = await params;

  let design: DesignRow | null;
  try {
    design = UUID_RE.test(id) ? await getDesign(id) : null;
  } catch (error) {
    if (error instanceof SupabaseNotConfiguredError) {
      return (
        <div className="mx-auto w-full max-w-2xl">
          <SetupCard
            service="Supabase"
            message="Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, run the migration, then reload."
          />
        </div>
      );
    }
    throw error;
  }

  if (!design) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <EmptyState
          icon="alert-triangle"
          title="Design not found"
          description="This design may have been removed. Return to the studio to continue."
          action={
            <Link
              href="/app/collections"
              className="inline-flex h-9 items-center gap-2 rounded-[9px] border border-[rgba(0,0,0,0.12)] bg-surface px-4 text-[13px] font-semibold text-ink transition-colors hover:bg-[#FAFAFA]"
            >
              Back to collections
            </Link>
          }
        />
      </div>
    );
  }

  const briefParsed = newDesignSchema.safeParse(design.design_brief);
  const brief = briefParsed.success ? briefParsed.data : null;
  const costing = design.costing;
  const imageUrl = designImageUrl(design);
  const studioHref = `/app/collections/${design.collection_id}`;

  const hasTechPack = design.tech_pack !== null;
  const hasListing = design.listing_payload !== null;
  const hasShopifyDraft = Boolean(design.shopify_product_gid);

  const marginPct = costing
    ? `${Math.round(costing.targetGrossMargin * 100)}%`
    : "—";
  const perUnit = costing
    ? formatCurrency(
        costing.detailedEstimate.maximumFactoryCost,
        costing.currency,
      )
    : "—";

  return (
    <div className="flex flex-col gap-7">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <Link
          href={studioHref}
          className="inline-flex items-center gap-2 text-[13px] text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Back to the studio
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
              Proposed design · draft
            </span>
            <h1 className="font-display text-[32px] leading-tight text-ink">
              {brief?.name ?? design.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <Pill
                fg="#0863C4"
                bg="rgba(10,132,255,0.12)"
                label={humanizeStatus(design.status)}
              />
              {brief ? (
                <Pill
                  fg="#48484A"
                  bg="rgba(120,120,128,0.14)"
                  label={capitalize(brief.category)}
                />
              ) : null}
              {brief ? <Pill tone={RISK_TONE[brief.estimatedRisk]} /> : null}
            </div>
          </div>
          <Link
            href={`/app/designs/${design.id}/print`}
            className="inline-flex h-9 items-center gap-2 rounded-[9px] border border-[rgba(0,0,0,0.12)] bg-surface px-3.5 text-[13px] font-semibold text-ink transition-colors hover:bg-[#FAFAFA]"
          >
            <Printer aria-hidden className="size-4" />
            Tech pack print view
          </Link>
        </div>
      </div>

      {/* Honesty banner */}
      <div className="flex items-start gap-3 rounded-[13px] border border-[rgba(0,0,0,0.05)] bg-[rgba(120,120,128,0.06)] px-4 py-3">
        <div className="text-[12.5px] leading-[1.45] text-ink3">
          Sketches, tech packs and costings here are{" "}
          <span className="font-[650] text-ink2">drafts for your review</span> —
          a starting point for a real product developer, not manufacturing-ready
          specs.
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        {/* Left column — sketch + downstream status */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Flat sketch</CardTitle>
              <Pill
                fg="#B25000"
                bg="rgba(255,149,0,0.14)"
                label="Draft"
              />
            </CardHeader>
            <div className="px-4 pb-4">
              <div className="aspect-[4/5] w-full overflow-hidden rounded-[12px] border border-line bg-[#F5F5F7]">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl}
                    alt={`Flat sketch of ${brief?.name ?? design.name}`}
                    className="size-full object-contain"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center px-6 text-center font-display text-[15px] text-faint">
                    No sketch rendered yet
                  </div>
                )}
              </div>
              <p className="mt-2 text-[11.5px] text-muted">
                {SKETCH_DISCLAIMER}.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Production status</CardTitle>
            </CardHeader>
            <div className="pb-1">
              <StatusRow
                label="Draft tech pack"
                done={hasTechPack}
                doneLabel="Draft ready"
                pendingLabel="Not generated"
              />
              <StatusRow
                label="Product listing"
                done={hasListing}
                doneLabel="Ready"
                pendingLabel="Not generated"
              />
              <StatusRow
                label="Shopify draft"
                done={hasShopifyDraft}
                doneLabel="Draft created"
                pendingLabel="Not created"
              />
            </div>
            {hasShopifyDraft ? (
              <div className="border-t border-[rgba(0,0,0,0.05)] px-4 py-3">
                <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted">
                  Shopify product GID
                </div>
                <div className="mt-1 break-all font-mono text-[11.5px] text-ink2">
                  {design.shopify_product_gid}
                </div>
              </div>
            ) : null}
          </Card>
        </div>

        {/* Right column — brief + costing */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Design brief</CardTitle>
            </CardHeader>
            {brief ? (
              <div>
                <CardRow label="Problem solved" value={brief.problemSolved} />
                <CardRow label="Target customer" value={brief.targetCustomer} />
                <CardRow label="Silhouette" value={brief.silhouette} />
                <CardRow
                  label="Colour"
                  value={
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden
                        className="inline-block size-4 rounded-[4px] border border-black/10"
                        style={{ backgroundColor: brief.colourHex }}
                      />
                      {brief.colour}
                    </span>
                  }
                />
                <CardRow
                  label="Construction"
                  value={brief.constructionDirection}
                />
                <CardRow
                  label="Fabric"
                  value={<TagValue items={brief.fabricRequirements} />}
                />
                <CardRow
                  label="Unlocks looks"
                  value={
                    brief.outfitIdsUnlocked.length > 0
                      ? `${brief.outfitIdsUnlocked.length} existing outfit${
                          brief.outfitIdsUnlocked.length === 1 ? "" : "s"
                        }`
                      : "—"
                  }
                />
                <CardRow
                  label="Verified data"
                  value={<TagValue items={brief.verifiedData} />}
                />
                <CardRow
                  label="Assumed data"
                  value={<TagValue items={brief.assumedData} />}
                />
                {brief.openQuestions.length > 0 ? (
                  <CardRow
                    label="Open questions"
                    value={
                      <ul className="flex list-disc flex-col gap-1 pl-4 text-left marker:text-faint">
                        {brief.openQuestions.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    }
                  />
                ) : null}
              </div>
            ) : (
              <p className="px-4 pb-4 text-[13px] text-muted">
                This design does not yet have a complete brief. Run gap
                detection in the studio to generate one.
              </p>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Costing &amp; margin</CardTitle>
            </CardHeader>
            <div className="px-4 pb-4">
              {costing ? (
                <div className="flex flex-col gap-4">
                  <p className="text-[11.5px] text-muted">
                    Computed by code as target retail × (1 − target margin), less
                    packaging, freight, duty, sample and return allowances. Verify
                    against supplier quotes.
                  </p>
                  <div className="flex gap-3">
                    <CostTile
                      label="Retail"
                      value={formatCurrency(
                        costing.targetRetailPrice,
                        costing.currency,
                      )}
                    />
                    <CostTile label="Gross margin" value={marginPct} positive />
                    <CostTile label="Max factory cost" value={perUnit} />
                  </div>

                  <div>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
                      Max landed cost{" "}
                      <span className="font-normal normal-case text-ink2">
                        {formatCurrency(
                          costing.maximumLandedCost,
                          costing.currency,
                        )}
                      </span>
                    </div>
                    <dl className="text-[12.5px]">
                      {(
                        [
                          [
                            "Packaging allowance",
                            costing.detailedEstimate.packagingAllowance,
                          ],
                          [
                            "Freight allowance",
                            costing.detailedEstimate.freightAllowance,
                          ],
                          [
                            "Duty allowance",
                            costing.detailedEstimate.dutyAllowance,
                          ],
                          [
                            "Sample allocation",
                            costing.detailedEstimate.sampleAllocation,
                          ],
                          [
                            "Return allowance",
                            costing.detailedEstimate.returnAllowance,
                          ],
                        ] as const
                      ).map(([label, value]) => (
                        <div
                          key={label}
                          className="flex items-center justify-between border-b border-[rgba(0,0,0,0.05)] py-[7px]"
                        >
                          <dt className="text-ink2">{label}</dt>
                          <dd className="font-mono tabular-nums text-ink">
                            {formatCurrency(value, costing.currency)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-3 text-[11px] text-muted">
                      Calculated {formatDate(costing.calculatedAt)}.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-[13px] text-muted">
                  No costing model yet. It is generated with the design brief.
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
