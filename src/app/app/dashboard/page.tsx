import Link from "next/link";
import { ArrowRight, ClipboardCheck, Layers, Plus } from "lucide-react";
import { integrationStatus } from "@/lib/env";
import {
  countProducts,
  listApprovals,
  listCollections,
  listRecentActivity,
  type ApprovalRow,
  type CollectionRow,
} from "@/lib/supabase/repositories";
import { formatDate } from "@/lib/utils";
import { AgentTrace } from "@/components/agent-trace";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isSetupError } from "@/app/app/_lib/server";
import { toAgentTraceEntry } from "@/app/app/_lib/mappers";
import { PageHeader } from "@/app/app/_components/page-header";
import { StatCard } from "@/app/app/_components/stat-card";
import { SeedButton } from "@/app/app/_components/seed-button";
import { IntegrationChips } from "@/app/app/_components/integration-chips";
import { SetupCard } from "@/app/app/_components/setup-card";
import type { ActivityLogRow } from "@/lib/supabase/repositories";

/**
 * Dashboard (spec 23): integration status, catalog counts, the active
 * collection with a "Continue collection" CTA, pending approvals, and the
 * recent agent activity trace. A Supabase/setup error degrades to a friendly
 * card rather than a crash.
 */
export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = new Set([
  "draft",
  "briefed",
  "active",
  "curated",
  "ready",
]);

interface DashboardData {
  configured: boolean;
  products: number;
  analysed: number;
  collections: CollectionRow[];
  approvals: ApprovalRow[];
  activity: ActivityLogRow[];
}

async function loadDashboard(): Promise<DashboardData> {
  try {
    const [products, analysed, collections, approvals, activity] =
      await Promise.all([
        countProducts(),
        countProducts({ analysisStatus: "complete" }),
        listCollections(),
        listApprovals({ status: "pending" }),
        listRecentActivity(10),
      ]);
    return {
      configured: true,
      products,
      analysed,
      collections,
      approvals,
      activity,
    };
  } catch (error) {
    if (isSetupError(error)) {
      return {
        configured: false,
        products: 0,
        analysed: 0,
        collections: [],
        approvals: [],
        activity: [],
      };
    }
    throw error;
  }
}

const APPROVAL_ACTION_LABELS: Record<string, string> = {
  CREATE_SHOPIFY_DRAFT: "Create Shopify draft",
  PUBLISH_SHOPIFY: "Publish to Shopify",
  APPROVE_DESIGN: "Approve design",
};

export default async function DashboardPage() {
  const status = integrationStatus();
  const data = await loadDashboard();

  const activeCollection =
    data.collections.find((c) => ACTIVE_STATUSES.has(c.status)) ??
    data.collections[0] ??
    null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Your studio at a glance — catalog readiness, the collection in progress, and everything waiting on your approval."
        actions={
          <>
            {status.demoMode ? <SeedButton variant="secondary" /> : null}
            <Link href="/app/collections/new">
              <Button>
                <Plus aria-hidden className="size-4" />
                New collection
              </Button>
            </Link>
          </>
        }
      />

      <section aria-label="Integration status" className="flex flex-col gap-3">
        <IntegrationChips status={status} />
      </section>

      {!data.configured ? (
        <SetupCard description="Supabase is not connected yet, so counts and history are empty. Add credentials and run the migration to bring the dashboard to life." />
      ) : null}

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard
          label="Products"
          value={data.products}
          hint="in your catalog"
        />
        <StatCard
          label="Analysed"
          value={data.analysed}
          hint={
            data.products > 0
              ? `${Math.round((data.analysed / data.products) * 100)}% of catalog`
              : "run analysis to enrich"
          }
        />
        <StatCard
          label="Collections"
          value={data.collections.length}
          hint="in the studio"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>Active collection</CardTitle>
            <Link
              href="/app/collections"
              className="text-sm text-muted transition-colors hover:text-ink"
            >
              All collections
            </Link>
          </CardHeader>
          <CardContent>
            {activeCollection ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-xl tracking-tight text-ink">
                      {activeCollection.name}
                    </h3>
                    <StatusBadge
                      kind="collection"
                      status={activeCollection.status}
                    />
                  </div>
                  <p className="max-w-md text-sm leading-relaxed text-muted">
                    {activeCollection.brief.market} ·{" "}
                    {activeCollection.brief.season} ·{" "}
                    {activeCollection.brief.audience}
                  </p>
                  <p className="text-xs text-muted">
                    Started {formatDate(activeCollection.created_at)}
                  </p>
                </div>
                <Link href={`/app/collections/${activeCollection.id}`}>
                  <Button>
                    Continue collection
                    <ArrowRight aria-hidden className="size-4" />
                  </Button>
                </Link>
              </div>
            ) : (
              <EmptyState
                icon={Layers}
                title="No collection yet"
                description="Start a seasonal collection to run trends, styling, product development, and publishing."
                action={
                  <Link href="/app/collections/new">
                    <Button size="sm">Start a collection</Button>
                  </Link>
                }
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pending approvals</CardTitle>
          </CardHeader>
          <CardContent>
            {data.approvals.length === 0 ? (
              <EmptyState
                icon={ClipboardCheck}
                title="Nothing to approve"
                description="Approval requests for public or financial actions appear here."
              />
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {data.approvals.map((approval) => (
                  <li
                    key={approval.id}
                    className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-sm font-medium text-ink">
                        {APPROVAL_ACTION_LABELS[approval.action] ??
                          approval.action}
                      </span>
                      <span className="text-xs text-muted">
                        {approval.entity_type} · {formatDate(approval.created_at)}
                      </span>
                    </div>
                    <Badge variant="warning" dot>
                      Pending
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent agent activity</CardTitle>
        </CardHeader>
        <CardContent>
          <AgentTrace
            entries={data.activity.map(toAgentTraceEntry)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
