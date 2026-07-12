import { integrationStatus } from "@/lib/env";
import {
  countProducts,
  getAppSettings,
  listApprovals,
  listCollections,
  type CollectionRow,
} from "@/lib/supabase/repositories";
import { AppShell } from "@/app/app/_shell";

/**
 * Authenticated app frame. The proxy already gates /app/* on a valid session;
 * this server layout resolves the brand identity, the active collection (to scope
 * studio nav), and the sidebar badge counts, then renders the persistent shell.
 *
 * Reading the database must never crash the shell: a Supabase/setup error (or any
 * unexpected read failure) degrades to safe defaults so every child page still
 * renders its own setup card.
 */
export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = new Set([
  "draft",
  "briefed",
  "active",
  "curated",
  "ready",
]);

interface ShellData {
  brandName: string;
  subtitle: string;
  activeCollectionId: string | null;
  pendingCount: number;
  needsAttentionCount: number;
}

function pickActiveCollection(
  collections: CollectionRow[],
): CollectionRow | null {
  return (
    collections.find((c) => ACTIVE_STATUSES.has(c.status)) ??
    collections[0] ??
    null
  );
}

async function loadShell(): Promise<ShellData> {
  const fallback: ShellData = {
    brandName: "LabelOS",
    subtitle: "Studio",
    activeCollectionId: null,
    pendingCount: 0,
    needsAttentionCount: 0,
  };

  try {
    const [settings, collections, approvals, failed, queued] =
      await Promise.all([
        getAppSettings(),
        listCollections(),
        listApprovals({ status: "pending" }),
        countProducts({ analysisStatus: "failed" }),
        countProducts({ analysisStatus: "pending" }),
      ]);

    const brandName = settings?.brand_name?.trim() || "LabelOS";
    const currency = settings?.currency?.trim() || "SGD";
    const market = settings?.market?.trim();
    const subtitle = market ? `${market} · ${currency}` : `Contemporary · ${currency}`;
    const active = pickActiveCollection(collections);

    return {
      brandName,
      subtitle,
      activeCollectionId: active?.id ?? null,
      pendingCount: approvals.length,
      needsAttentionCount: failed + queued,
    };
  } catch {
    // A missing / unmigrated Supabase (or any read failure) must never take
    // down the whole shell — every child page renders its own setup card.
    return fallback;
  }
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const status = integrationStatus();
  const data = await loadShell();

  return (
    <AppShell
      brandName={data.brandName}
      subtitle={data.subtitle}
      activeCollectionId={data.activeCollectionId}
      demoMode={status.demoMode}
      pendingCount={data.pendingCount}
      needsAttentionCount={data.needsAttentionCount}
    >
      {children}
    </AppShell>
  );
}
