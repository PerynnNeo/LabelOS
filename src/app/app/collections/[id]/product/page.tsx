import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth/require-session";
import {
  getCollection,
  listDesignsByCollection,
  type CollectionRow,
  type DesignRow,
} from "@/lib/supabase/repositories";
import { isSetupError } from "@/app/app/_lib/server";
import {
  PageHeader,
  StudioTracker,
  StudioFooter,
  SetupCard,
  EmptyState,
  type StudioStep,
} from "@/components/lo";
import {
  ProductDevView,
  PdTabToggle,
  type ProductTab,
} from "./_components/product-dev-view";

/**
 * Collection Studio · stage 4 — Product Development.
 *
 * Server component: loads the collection and its (single, MVP) design straight
 * from the service-role repository layer, degrading to a friendly setup card
 * when Supabase is not configured. The Concepts ↔ Specification toggle is a
 * client control that drives the tab via the `?tab=` search param, so the
 * server owns the frosted header, the studio tracker and the sticky footer
 * while the interactive body lives in {@link ProductDevView}.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function studioSteps(collectionId: string): StudioStep[] {
  const base = `/app/collections/${collectionId}`;
  const defs: Array<{ id: number; name: string; href: string }> = [
    { id: 1, name: "Collection Brief", href: `${base}?stage=brief` },
    { id: 2, name: "Trend Direction", href: `${base}?stage=trends` },
    { id: 3, name: "Outfit Plan", href: `${base}?stage=outfits` },
    { id: 4, name: "New Product Design", href: `${base}/product` },
    { id: 5, name: "Source & Sample", href: `${base}/sourcing` },
    { id: 6, name: "Store Draft & Publish", href: `${base}/publish` },
  ];
  return defs.map((d) => ({
    ...d,
    state: d.id < 4 ? "done" : d.id === 4 ? "current" : "todo",
  }));
}

export default async function ProductDevelopmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionFromCookies();
  if (!session.ok) {
    redirect("/login?next=/app/collections");
  }

  const { id } = await params;
  const sp = await searchParams;
  const tab: ProductTab = sp.tab === "spec" ? "spec" : "concepts";

  let collection: CollectionRow | null = null;
  let designs: DesignRow[] = [];
  let setupFailed = false;
  try {
    if (UUID_RE.test(id)) {
      collection = await getCollection(id);
      if (collection) {
        designs = await listDesignsByCollection(id);
      }
    }
  } catch (error) {
    if (isSetupError(error)) {
      setupFailed = true;
    } else {
      throw error;
    }
  }

  const header = (
    <PageHeader
      title="Product Development"
      subtitle="Design a new product for the gap the collection revealed"
      actions={<PdTabToggle collectionId={id} tab={tab} />}
    />
  );

  if (setupFailed) {
    return (
      <div>
        {header}
        <div className="px-[30px] py-[18px]">
          <SetupCard service="Supabase" />
        </div>
      </div>
    );
  }

  if (!collection) {
    return (
      <div>
        <PageHeader
          title="Product Development"
          subtitle="Design a new product for the gap the collection revealed"
        />
        <div className="px-[30px] py-6">
          <EmptyState
            icon="alert-triangle"
            title="Collection not found"
            description="This collection may have been removed. Head back to your collections to continue."
            action={
              <a
                href="/app/collections"
                className="inline-flex h-9 items-center rounded-[9px] border border-[rgba(0,0,0,0.12)] bg-surface px-4 text-[13px] font-semibold text-ink transition hover:bg-[#FAFAFA]"
              >
                Back to collections
              </a>
            }
          />
        </div>
      </div>
    );
  }

  // MVP: exactly one new garment per collection — take the most recent design.
  const design = designs.length > 0 ? designs[designs.length - 1] : null;

  return (
    <div className="pb-2">
      {header}

      <div className="px-[30px] pt-[18px] pb-2">
        <StudioTracker steps={studioSteps(id)} />
      </div>

      <ProductDevView
        tab={tab}
        collectionId={id}
        collectionName={collection.name}
        climate={collection.brief.climate}
        design={design}
      />

      <StudioFooter
        currentId={4}
        stageLabel="New Product Design"
        back={{ label: "Outfit Plan", href: `/app/collections/${id}?stage=outfits` }}
        next={{
          label: "Source & Sample",
          href: `/app/collections/${id}/sourcing`,
        }}
      />
    </div>
  );
}
