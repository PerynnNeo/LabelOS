import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  FileWarning,
  Printer,
  ShoppingBag,
} from "lucide-react";
import { getSessionFromCookies } from "@/lib/auth/require-session";
import { SupabaseNotConfiguredError } from "@/lib/supabase/admin";
import { getDesign, type DesignRow } from "@/lib/supabase/repositories";
import { newDesignSchema, type NewDesign } from "@/lib/domain/schemas";
import { SKETCH_DISCLAIMER } from "@/lib/domain/flat-sketch";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";

/**
 * Design overview (spec sections 16–18, 20–21).
 *
 * Session-protected server component summarising one proposed design: its
 * brief, the code-computed costing model, the flat sketch, and the downstream
 * status (tech pack / listing / Shopify draft), with links to the printable
 * tech pack and back to the collection studio.
 *
 * Reads the design directly from the service-role repository layer → Node.
 */
export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RISK_VARIANT: Record<NewDesign["estimatedRisk"], BadgeVariant> = {
  low: "success",
  medium: "warning",
  high: "danger",
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

function StepStatus({
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
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-sm text-ink">{label}</span>
      <Badge variant={done ? "success" : "neutral"} dot>
        {done ? doneLabel : pendingLabel}
      </Badge>
    </div>
  );
}

function DefinitionRow({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-6">
      <dt className="text-xs font-medium uppercase tracking-[0.15em] text-muted sm:w-40 sm:shrink-0">
        {term}
      </dt>
      <dd className="text-sm leading-relaxed text-ink">{children}</dd>
    </div>
  );
}

function TagList({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="text-muted">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, index) => (
        <Badge key={index} variant="neutral">
          {item}
        </Badge>
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
          <EmptyState
            icon={FileWarning}
            title="Backend not configured"
            description="Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, run the migration, then reload."
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
          icon={FileWarning}
          title="Design not found"
          description="This design may have been removed. Return to the studio to continue."
          action={
            <Link
              href="/app/collections"
              className="inline-flex h-10 items-center gap-2 border border-line bg-surface px-5 text-sm font-medium tracking-wide text-ink transition-colors hover:border-ink"
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

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <Link
          href={studioHref}
          className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Back to the studio
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="eyebrow">Proposed design</span>
            <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">
              {brief?.name ?? design.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="accent">{humanizeStatus(design.status)}</Badge>
              {brief ? (
                <Badge variant="neutral">
                  {brief.category.charAt(0).toUpperCase() +
                    brief.category.slice(1)}
                </Badge>
              ) : null}
              {brief ? (
                <Badge variant={RISK_VARIANT[brief.estimatedRisk]}>
                  {brief.estimatedRisk.charAt(0).toUpperCase() +
                    brief.estimatedRisk.slice(1)}{" "}
                  risk
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/app/designs/${design.id}/print`}
              className="inline-flex h-10 items-center gap-2 border border-line bg-surface px-5 text-sm font-medium tracking-wide text-ink transition-colors hover:border-ink"
            >
              <Printer aria-hidden className="size-4" />
              Tech pack print view
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        {/* Left column — sketch + downstream status */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Flat sketch</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="aspect-[4/5] w-full overflow-hidden border border-line bg-paper">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl}
                    alt={`Flat sketch of ${brief?.name ?? design.name}`}
                    className="size-full object-contain"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center px-6 text-center text-sm text-muted">
                    No sketch rendered yet.
                  </div>
                )}
              </div>
              <p className="text-xs text-muted">{SKETCH_DISCLAIMER}.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Production status</CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-line py-1">
              <StepStatus
                label="Draft tech pack"
                done={hasTechPack}
                doneLabel="Draft ready"
                pendingLabel="Not generated"
              />
              <StepStatus
                label="Product listing"
                done={hasListing}
                doneLabel="Ready"
                pendingLabel="Not generated"
              />
              <StepStatus
                label="Shopify draft"
                done={hasShopifyDraft}
                doneLabel="Draft created"
                pendingLabel="Not created"
              />
            </CardContent>
          </Card>

          {hasShopifyDraft ? (
            <div className="flex items-start gap-2.5 border border-line bg-surface px-4 py-3 text-sm text-muted">
              <ShoppingBag aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 break-all">
                Shopify product GID:{" "}
                <span className="text-ink">{design.shopify_product_gid}</span>
              </span>
            </div>
          ) : null}
        </div>

        {/* Right column — brief + costing */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Design brief</CardTitle>
            </CardHeader>
            <CardContent>
              {brief ? (
                <dl className="divide-y divide-line">
                  <DefinitionRow term="Problem solved">
                    {brief.problemSolved}
                  </DefinitionRow>
                  <DefinitionRow term="Target customer">
                    {brief.targetCustomer}
                  </DefinitionRow>
                  <DefinitionRow term="Silhouette">
                    {brief.silhouette}
                  </DefinitionRow>
                  <DefinitionRow term="Colour">
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden
                        className="inline-block size-4 shrink-0 border border-line"
                        style={{ backgroundColor: brief.colourHex }}
                      />
                      {brief.colour}
                    </span>
                  </DefinitionRow>
                  <DefinitionRow term="Construction">
                    {brief.constructionDirection}
                  </DefinitionRow>
                  <DefinitionRow term="Fabric">
                    <TagList items={brief.fabricRequirements} />
                  </DefinitionRow>
                  <DefinitionRow term="Unlocks looks">
                    {brief.outfitIdsUnlocked.length > 0
                      ? `${brief.outfitIdsUnlocked.length} existing outfit${
                          brief.outfitIdsUnlocked.length === 1 ? "" : "s"
                        }`
                      : "—"}
                  </DefinitionRow>
                  <DefinitionRow term="Verified data">
                    <TagList items={brief.verifiedData} />
                  </DefinitionRow>
                  <DefinitionRow term="Assumed data">
                    <TagList items={brief.assumedData} />
                  </DefinitionRow>
                  {brief.originalitySafeguards.length > 0 ? (
                    <DefinitionRow term="Originality">
                      <ul className="flex list-disc flex-col gap-1 pl-4 marker:text-line">
                        {brief.originalitySafeguards.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </DefinitionRow>
                  ) : null}
                  {brief.openQuestions.length > 0 ? (
                    <DefinitionRow term="Open questions">
                      <ul className="flex list-disc flex-col gap-1 pl-4 marker:text-line">
                        {brief.openQuestions.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </DefinitionRow>
                  ) : null}
                </dl>
              ) : (
                <p className="text-sm text-muted">
                  This design does not yet have a complete brief. Run gap
                  detection in the studio to generate one.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Costing</CardTitle>
            </CardHeader>
            <CardContent>
              {costing ? (
                <div className="flex flex-col gap-6">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="flex flex-col gap-1 border border-line bg-paper px-4 py-3">
                      <span className="text-xs font-medium uppercase tracking-[0.15em] text-muted">
                        Target retail
                      </span>
                      <span className="font-display text-xl text-ink">
                        {formatCurrency(
                          costing.targetRetailPrice,
                          costing.currency,
                        )}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 border border-line bg-paper px-4 py-3">
                      <span className="text-xs font-medium uppercase tracking-[0.15em] text-muted">
                        Target margin
                      </span>
                      <span className="font-display text-xl text-ink">
                        {Math.round(costing.targetGrossMargin * 100)}%
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 border border-accent/40 bg-accent/5 px-4 py-3">
                      <span className="text-xs font-medium uppercase tracking-[0.15em] text-accent">
                        Max landed cost
                      </span>
                      <span className="font-display text-xl text-ink">
                        {formatCurrency(
                          costing.maximumLandedCost,
                          costing.currency,
                        )}
                      </span>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-[0.15em] text-muted">
                      Detailed estimate
                    </p>
                    <dl className="divide-y divide-line text-sm">
                      {(
                        [
                          ["Packaging allowance", costing.detailedEstimate.packagingAllowance],
                          ["Freight allowance", costing.detailedEstimate.freightAllowance],
                          ["Duty allowance", costing.detailedEstimate.dutyAllowance],
                          ["Sample allocation", costing.detailedEstimate.sampleAllocation],
                          ["Return allowance", costing.detailedEstimate.returnAllowance],
                        ] as const
                      ).map(([label, value]) => (
                        <div
                          key={label}
                          className="flex items-center justify-between gap-4 py-2"
                        >
                          <dt className="text-muted">{label}</dt>
                          <dd className="tabular-nums text-ink">
                            {formatCurrency(value, costing.currency)}
                          </dd>
                        </div>
                      ))}
                      <div className="flex items-center justify-between gap-4 py-2">
                        <dt className="font-medium text-ink">
                          Maximum factory cost
                        </dt>
                        <dd className="font-medium tabular-nums text-ink">
                          {formatCurrency(
                            costing.detailedEstimate.maximumFactoryCost,
                            costing.currency,
                          )}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-3 text-xs leading-relaxed text-muted">
                      Computed by code as target retail × (1 − target margin),
                      less packaging, freight, duty, sample, and return
                      allowances. Calculated {formatDate(costing.calculatedAt)}.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">
                  No costing model yet. It is generated with the design brief.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
