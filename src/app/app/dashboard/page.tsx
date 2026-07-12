import Link from "next/link";
import { integrationStatus } from "@/lib/env";
import {
  listApprovals,
  listCollections,
  listDesignsByCollection,
  listOutfitsByCollection,
  listProducts,
  listRecentActivity,
  type ActivityLogRow,
  type ApprovalRow,
  type CollectionRow,
  type DesignRow,
  type OutfitRow,
  type ProductRow,
} from "@/lib/supabase/repositories";
import {
  AgentTrace,
  Card,
  CardTitle,
  EmptyState,
  Icon,
  type IconName,
  NextAction,
  PageHeader,
  Pill,
  SetupCard,
  StatCell,
  type AgentTraceEntry,
} from "@/components/lo";
import { ANALYSIS_TONE } from "@/lib/ui/tokens";
import { formatRelative } from "@/lib/utils";
import { isSetupError } from "@/app/app/_lib/server";
import { SeedButton } from "@/app/app/_components/seed-button";

/**
 * Dashboard (Overview). Mirrors the mockup's `isDashboard` block: a next-action
 * hero, the decision queue assembled from real pending work, the catalog-analysis
 * stat grid, the active-collection tracker, recent agent activity, and the
 * demo-mode explainer. A Supabase/setup error degrades to a friendly card.
 */
export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = new Set([
  "draft",
  "briefed",
  "active",
  "curated",
  "ready",
]);

const STUDIO_STAGES = [
  "Collection Brief",
  "Trend Direction",
  "Outfit Plan",
  "New Product Design",
  "Source & Sample",
  "Store Draft & Publish",
];

interface DashboardData {
  configured: boolean;
  products: ProductRow[];
  approvals: ApprovalRow[];
  collections: CollectionRow[];
  activity: ActivityLogRow[];
  activeCollection: CollectionRow | null;
  outfits: OutfitRow[];
  designs: DesignRow[];
}

async function loadDashboard(): Promise<DashboardData> {
  const empty: DashboardData = {
    configured: false,
    products: [],
    approvals: [],
    collections: [],
    activity: [],
    activeCollection: null,
    outfits: [],
    designs: [],
  };

  try {
    const [products, approvals, collections, activity] = await Promise.all([
      listProducts(),
      listApprovals({ status: "pending" }),
      listCollections(),
      listRecentActivity(10),
    ]);

    const activeCollection =
      collections.find((c) => ACTIVE_STATUSES.has(c.status)) ??
      collections[0] ??
      null;

    let outfits: OutfitRow[] = [];
    let designs: DesignRow[] = [];
    if (activeCollection) {
      [outfits, designs] = await Promise.all([
        listOutfitsByCollection(activeCollection.id),
        listDesignsByCollection(activeCollection.id),
      ]);
    }

    return {
      configured: true,
      products,
      approvals,
      collections,
      activity,
      activeCollection,
      outfits,
      designs,
    };
  } catch (error) {
    if (isSetupError(error)) return empty;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Catalog analysis counts (from the real analysis_status values). "Needs
// review" is derived: a completed analysis whose material read is unverified is
// genuinely awaiting the owner's sign-off — the honesty label from the mockup.
// ---------------------------------------------------------------------------

interface CatalogStats {
  total: number;
  completed: number;
  running: number;
  queued: number;
  failed: number;
  needsReview: number;
}

function catalogStats(products: ProductRow[]): CatalogStats {
  const by = (s: string) =>
    products.filter((p) => p.analysis_status === s).length;
  const needsReview = products.filter(
    (p) =>
      p.analysis_status === "complete" &&
      p.analysis != null &&
      p.analysis.materialObservation?.verified === false,
  ).length;
  return {
    total: products.length,
    completed: by("complete"),
    running: by("running"),
    queued: by("pending"),
    failed: by("failed"),
    needsReview,
  };
}

// ---------------------------------------------------------------------------
// Decision queue
// ---------------------------------------------------------------------------

interface QueueItem {
  key: string;
  label: string;
  detail: string;
  cta: string;
  fg: string;
  bg: string;
  icon: IconName;
  href: string;
}

const APPROVAL_LABELS: Record<
  string,
  { label: string; detail: string; icon: IconName; fg: string; bg: string }
> = {
  CREATE_SHOPIFY_DRAFT: {
    label: "Shopify draft awaiting your approval",
    detail: "Hidden draft — publication needs your sign-off",
    icon: "cart",
    fg: "#4C7A1E",
    bg: "rgba(149,191,71,0.16)",
  },
  PUBLISH_SHOPIFY: {
    label: "Publish awaiting your approval",
    detail: "Nothing goes live to customers until you confirm",
    icon: "cart",
    fg: "#4C7A1E",
    bg: "rgba(149,191,71,0.16)",
  },
  APPROVE_DESIGN: {
    label: "Design concept awaiting your approval",
    detail: "Review the proposed garment before it advances",
    icon: "ruler",
    fg: "#0863C4",
    bg: "rgba(10,132,255,0.12)",
  },
};

function buildQueue(
  data: DashboardData,
  stats: CatalogStats,
): QueueItem[] {
  const queue: QueueItem[] = [];
  const activeId = data.activeCollection?.id ?? null;
  const studioHref = activeId
    ? `/app/collections/${activeId}`
    : "/app/collections";

  if (stats.failed > 0) {
    queue.push({
      key: "failed",
      label: `${stats.failed} failed product ${stats.failed === 1 ? "analysis" : "analyses"}`,
      detail: "Garment Librarian could not read the image",
      cta: "Review & retry",
      fg: "#C4271B",
      bg: "rgba(255,59,48,0.12)",
      icon: "alert-triangle",
      href: "/app/catalog",
    });
  }

  if (stats.needsReview > 0) {
    queue.push({
      key: "needs-review",
      label: `${stats.needsReview} catalog ${stats.needsReview === 1 ? "analysis" : "analyses"} to review`,
      detail: "AI attributes ready for your approval",
      cta: "Review",
      fg: "#B25000",
      bg: "rgba(255,149,0,0.13)",
      icon: "eye",
      href: "/app/catalog",
    });
  }

  const candidates = data.outfits.filter((o) => o.status === "candidate").length;
  if (candidates > 0) {
    queue.push({
      key: "outfits",
      label: `${candidates} AI-shortlisted ${candidates === 1 ? "outfit" : "outfits"}`,
      detail: "Selected for your review — none approved yet",
      cta: "Review outfits",
      fg: "#5E5CE6",
      bg: "rgba(94,92,230,0.12)",
      icon: "layers",
      href: studioHref,
    });
  }

  // Proposed designs not already covered by a pending approval.
  const approvalEntityIds = new Set(data.approvals.map((a) => a.entity_id));
  const proposed = data.designs.filter(
    (d) => !d.shopify_product_gid && !approvalEntityIds.has(d.id),
  );
  if (proposed.length > 0) {
    queue.push({
      key: "designs",
      label: `${proposed.length} product ${proposed.length === 1 ? "concept" : "concepts"} to select`,
      detail: "Designed for the detected wardrobe gap",
      cta: "Select concept",
      fg: "#AF52DE",
      bg: "rgba(175,82,222,0.12)",
      icon: "ruler",
      href: `/app/designs/${proposed[0].id}`,
    });
  }

  for (const approval of data.approvals) {
    const meta = APPROVAL_LABELS[approval.action] ?? {
      label: approval.action.replace(/_/g, " ").toLowerCase(),
      detail: "Awaiting your decision",
      icon: "check" as IconName,
      fg: "#0863C4",
      bg: "rgba(10,132,255,0.12)",
    };
    const href =
      approval.entity_type === "design"
        ? `/app/designs/${approval.entity_id}`
        : studioHref;
    queue.push({
      key: `approval-${approval.id}`,
      label: meta.label,
      detail: meta.detail,
      cta: "Review & approve",
      fg: meta.fg,
      bg: meta.bg,
      icon: meta.icon,
      href,
    });
  }

  return queue;
}

// ---------------------------------------------------------------------------
// Activity trace mapping
// ---------------------------------------------------------------------------

function toTraceEntry(row: ActivityLogRow): AgentTraceEntry {
  const usage = row.usage ?? {};
  const input = typeof usage.inputTokens === "number" ? usage.inputTokens : 0;
  const output = typeof usage.outputTokens === "number" ? usage.outputTokens : 0;
  const duration =
    typeof usage.durationMs === "number" ? usage.durationMs : 0;
  const total = input + output;

  const tokenBits: string[] = [];
  if (row.model) tokenBits.push(row.model);
  else if (row.provider) tokenBits.push(row.provider);
  if (total > 0) tokenBits.push(`${total.toLocaleString("en-SG")} tok`);
  if (duration > 0) tokenBits.push(`${(duration / 1000).toFixed(1)}s`);

  const haystack = `${row.action} ${row.output_summary}`.toLowerCase();
  const error = /\bfail|error|unreadable\b/.test(haystack);

  return {
    id: row.id,
    actor: row.actor,
    action: row.action,
    detail: row.output_summary || row.input_summary || undefined,
    tokens: tokenBits.length > 0 ? tokenBits.join(" · ") : undefined,
    error,
    time: formatRelative(row.created_at),
  };
}

// ---------------------------------------------------------------------------
// Collection stage derivation
// ---------------------------------------------------------------------------

function collectionStage(collection: CollectionRow, designs: DesignRow[]): number {
  if (collection.status === "ready" || collection.shopify_collection_gid) return 6;
  if (designs.length > 0) return 4;
  if (collection.curation_summary) return 4;
  if (collection.trend_report) return 3;
  return collection.brief ? 2 : 1;
}

export default async function DashboardPage() {
  const status = integrationStatus();
  const data = await loadDashboard();
  const stats = catalogStats(data.products);
  const queue = buildQueue(data, stats);
  const pendingCount = queue.length;

  const showSeed =
    data.configured && status.demoMode && data.products.length === 0;

  const heroAction =
    pendingCount > 0
      ? { label: "Review pending decisions", href: queue[0].href }
      : { label: "Open catalog", href: "/app/catalog" };

  const statTiles: Array<{
    key: string;
    n: number;
    label: string;
    color?: string;
    bg: string;
  }> = [
    { key: "total", n: stats.total, label: "Total", bg: "#F0F0F2" },
    {
      key: "completed",
      n: stats.completed,
      label: "Completed",
      color: ANALYSIS_TONE.complete.fg,
      bg: ANALYSIS_TONE.complete.bg,
    },
    {
      key: "running",
      n: stats.running,
      label: "Running",
      color: ANALYSIS_TONE.running.fg,
      bg: ANALYSIS_TONE.running.bg,
    },
    {
      key: "queued",
      n: stats.queued,
      label: "Queued",
      color: ANALYSIS_TONE.pending.fg,
      bg: ANALYSIS_TONE.pending.bg,
    },
    {
      key: "failed",
      n: stats.failed,
      label: "Failed",
      color: ANALYSIS_TONE.failed.fg,
      bg: ANALYSIS_TONE.failed.bg,
    },
    {
      key: "needs-review",
      n: stats.needsReview,
      label: "Needs owner review",
      color: ANALYSIS_TONE.needs_review.fg,
      bg: ANALYSIS_TONE.needs_review.bg,
    },
  ];

  const stage = data.activeCollection
    ? collectionStage(data.activeCollection, data.designs)
    : 0;

  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle="Your studio at a glance — catalog readiness, the collection in progress, and everything waiting on you."
        actions={
          <>
            {showSeed ? <SeedButton variant="secondary" size="sm" /> : null}
            <Link
              href="/app/activity"
              className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-[rgba(0,0,0,0.1)] bg-surface px-[14px] text-[13px] font-semibold text-ink transition hover:bg-[#FAFAFA]"
            >
              <Icon name="activity" size={15} strokeWidth={1.9} />
              Activity log
            </Link>
          </>
        }
      />

      <div className="flex flex-col gap-[18px] px-[30px] pb-11 pt-[22px]">
        <NextAction
          size="lg"
          icon="check"
          title={
            pendingCount > 0
              ? `Review ${pendingCount} pending ${pendingCount === 1 ? "decision" : "decisions"}`
              : "You're all caught up"
          }
          help={
            pendingCount > 0
              ? `The agents have prepared work in ${pendingCount} ${pendingCount === 1 ? "place" : "places"} that need your call before they can continue.`
              : "Nothing is waiting on your approval right now. Keep building your catalog and collection."
          }
          action={heroAction}
        />

        {!data.configured ? (
          <SetupCard
            service="Supabase"
            message="Supabase isn't connected yet, so counts, decisions and activity are empty. Add the credentials and run the migration to bring the dashboard to life — the rest of LabelOS still runs in demo mode."
          />
        ) : null}

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
          {/* Decision queue */}
          <Card className="px-2 pb-2.5 pt-2">
            <div className="flex items-center gap-2.5 px-3.5 pb-2.5 pt-3">
              <CardTitle>Your decision queue</CardTitle>
              {pendingCount > 0 ? (
                <Pill fg="#B25000" bg="rgba(255,149,0,0.14)">
                  {pendingCount} awaiting you
                </Pill>
              ) : null}
            </div>
            {queue.length === 0 ? (
              <EmptyState
                icon="check"
                title="You're all caught up"
                description="Decisions from the agents — analyses to review, outfits to approve, drafts to publish — will appear here."
              />
            ) : (
              <div>
                {queue.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    className="flex items-center gap-[13px] border-t border-[rgba(0,0,0,0.05)] px-3.5 py-3 transition hover:bg-[rgba(0,0,0,0.025)]"
                  >
                    <span
                      className="flex size-[34px] flex-none items-center justify-center rounded-[10px]"
                      style={{ background: item.bg, color: item.fg }}
                    >
                      <Icon name={item.icon} size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold text-ink">
                        {item.label}
                      </span>
                      <span className="mt-px block text-[12px] text-muted">
                        {item.detail}
                      </span>
                    </span>
                    <span className="flex flex-none items-center gap-1 text-[12.5px] font-semibold text-accent">
                      {item.cta}
                      <Icon name="chevron-right" size={14} strokeWidth={2.2} />
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {/* Right column: catalog analysis + collection tracker */}
          <div className="flex flex-col gap-4">
            <Card className="px-[18px] py-4">
              <div className="mb-3 text-[15px] font-[650] tracking-[-0.01em] text-ink">
                Catalog analysis
              </div>
              <div className="grid grid-cols-2 gap-[9px]">
                {statTiles.map((tile) => (
                  <Link key={tile.key} href="/app/catalog">
                    <StatCell
                      n={tile.n}
                      label={tile.label}
                      color={tile.color}
                      bg={tile.bg}
                    />
                  </Link>
                ))}
              </div>
            </Card>

            <Card className="px-[18px] py-4">
              <div className="mb-1.5 flex items-center gap-2">
                <div className="flex-1 text-[15px] font-[650] tracking-[-0.01em] text-ink">
                  Collection
                </div>
                {data.activeCollection ? (
                  <Pill fg="#0863C4" bg="rgba(10,132,255,0.1)">
                    Stage {stage} of 6
                  </Pill>
                ) : null}
              </div>

              {data.activeCollection ? (
                <>
                  <div className="text-[13.5px] font-semibold text-ink">
                    {data.activeCollection.name}
                  </div>
                  <div className="mt-px text-[12px] text-muted">
                    {data.activeCollection.brief.market} ·{" "}
                    {data.activeCollection.brief.season}
                  </div>
                  <div className="my-3.5 flex gap-[5px]">
                    {STUDIO_STAGES.map((name, i) => (
                      <div
                        key={name}
                        title={name}
                        className="h-1.5 flex-1 rounded-[3px]"
                        style={{
                          background:
                            i < stage ? "#0A84FF" : "rgba(0,0,0,0.1)",
                        }}
                      />
                    ))}
                  </div>
                  <Link
                    href={`/app/collections/${data.activeCollection.id}`}
                    className="flex h-[38px] w-full items-center justify-center gap-1.5 rounded-[10px] bg-accent text-[13.5px] font-semibold text-white transition hover:brightness-[0.96]"
                  >
                    Continue in Collections
                    <Icon name="arrow-right" size={15} strokeWidth={2} />
                  </Link>
                </>
              ) : (
                <div className="py-2">
                  <div className="text-[13px] text-muted">
                    No collection in progress yet.
                  </div>
                  <Link
                    href="/app/collections/new"
                    className="mt-3 flex h-[38px] w-full items-center justify-center gap-1.5 rounded-[10px] bg-accent text-[13.5px] font-semibold text-white transition hover:brightness-[0.96]"
                  >
                    Start a collection
                    <Icon name="arrow-right" size={15} strokeWidth={2} />
                  </Link>
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* Recent agent activity */}
        <Card className="px-[18px] pb-1.5 pt-1">
          <div className="flex items-center gap-2.5 px-1.5 pb-1 pt-3">
            <CardTitle>Recent agent activity</CardTitle>
            <Link
              href="/app/activity"
              className="flex-none text-[12.5px] font-semibold text-accent transition hover:brightness-90"
            >
              View all
            </Link>
          </div>
          <AgentTrace entries={data.activity.map(toTraceEntry)} />
        </Card>

        {/* Demo-mode explainer */}
        {status.demoMode ? (
          <div className="flex items-start gap-3 rounded-[14px] border border-[rgba(0,0,0,0.05)] bg-[rgba(120,120,128,0.06)] px-4 py-3.5">
            <span className="mt-px flex-none text-muted">
              <Icon name="info" size={17} strokeWidth={1.8} />
            </span>
            <div className="text-[12px] leading-relaxed text-ink3">
              <b className="font-[650] text-ink2">You&rsquo;re in demo mode.</b>{" "}
              Agents draft, score and recommend — but nothing is published,
              ordered, or sent to a supplier until you approve it. Trend and
              supplier data shown here is illustrative, not live.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
