import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, SetupCard, StudioTracker, Icon } from "@/components/lo";
import type { StudioStep } from "@/components/lo";
import {
  getAppSettings,
  getCollection,
  listDesignsByCollection,
  listOutfitsByCollection,
  listProducts,
  type CollectionRow,
  type OutfitRow,
} from "@/lib/supabase/repositories";
import { isSetupError } from "@/app/app/_lib/server";
import { BriefStage } from "./_components/brief-stage";
import { TrendsStage } from "./_components/trends-stage";
import { OutfitsStage } from "./_components/outfits-stage";
import { StudioFooterBar } from "./_components/studio-footer-bar";
import type { StudioStageKey, StudioStageProps } from "./_components/types";

/**
 * Collection Studio shell for stages 1–3 (Brief · Trends · Outfits).
 *
 * Loads the assembled studio state from the repository layer, resolves the
 * active stage from `?stage=` (falling back to the collection's own progress),
 * and renders the frosted header, the 6-step tracker, the stage body, and the
 * sticky footer. Stages 4–6 (product / sourcing / publish) are separate routes
 * owned by other agents; the tracker links out to them.
 *
 * A Supabase/migration setup error degrades to a friendly card — it never
 * crashes the page.
 */
export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<StudioStageKey, string> = {
  brief: "Collection Brief",
  trends: "Trend Direction",
  outfits: "Outfit Plan",
};
const STAGE_ID: Record<StudioStageKey, number> = {
  brief: 1,
  trends: 2,
  outfits: 3,
};

function asStage(value: string | undefined): StudioStageKey | null {
  return value === "brief" || value === "trends" || value === "outfits"
    ? value
    : null;
}

/**
 * Prefer an explicit `?stage=`, then the collection's own status when it names
 * a stage, then infer from the progress that actually exists.
 */
function resolveStage(
  stageParam: string | undefined,
  collection: CollectionRow,
  outfits: OutfitRow[],
): StudioStageKey {
  return (
    asStage(stageParam) ??
    asStage(collection.status) ??
    (outfits.length > 0 ? "outfits" : collection.trend_report ? "trends" : "brief")
  );
}

export default async function CollectionStudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ stage?: string }>;
}) {
  const { id } = await params;
  const { stage: stageParam } = await searchParams;

  let loaded: {
    collection: CollectionRow;
    props: StudioStageProps;
    stage: StudioStageKey;
  } | null = null;

  try {
    const collection = await getCollection(id);
    if (!collection) notFound();

    const [outfits, designs, products, settings] = await Promise.all([
      listOutfitsByCollection(id),
      listDesignsByCollection(id),
      listProducts(),
      getAppSettings(),
    ]);

    const stage = resolveStage(stageParam, collection, outfits);
    loaded = {
      collection,
      stage,
      props: {
        collection,
        brandProfile: settings?.brand_profile ?? null,
        outfits,
        designs,
        products,
        context: {
          collectionId: collection.id,
          slug: collection.slug,
          status: collection.status,
          stage,
        },
      },
    };
  } catch (error) {
    if (isSetupError(error)) {
      return (
        <div className="flex min-h-full flex-col">
          <PageHeader
            title="Collection studio"
            subtitle="Six stages from brief to storefront."
          />
          <div className="px-[30px] py-6">
            <SetupCard
              service="Supabase"
              message="Connect Supabase and run the database migration to open the collection studio."
            />
          </div>
        </div>
      );
    }
    throw error;
  }

  if (!loaded) notFound();

  const { collection, props, stage } = loaded;
  const currentId = STAGE_ID[stage];

  const stepDefs: Array<{ id: number; name: string; href: string }> = [
    { id: 1, name: "Collection Brief", href: `/app/collections/${id}?stage=brief` },
    { id: 2, name: "Trend Direction", href: `/app/collections/${id}?stage=trends` },
    { id: 3, name: "Outfit Plan", href: `/app/collections/${id}?stage=outfits` },
    { id: 4, name: "New Product Design", href: `/app/collections/${id}/product` },
    { id: 5, name: "Source & Sample", href: `/app/collections/${id}/sourcing` },
    { id: 6, name: "Store Draft & Publish", href: `/app/collections/${id}/publish` },
  ];
  const steps: StudioStep[] = stepDefs.map((d) => ({
    id: d.id,
    name: d.name,
    href: d.href,
    state: d.id < currentId ? "done" : d.id === currentId ? "current" : "todo",
  }));

  const prev = stepDefs.find((d) => d.id === currentId - 1);
  const next = stepDefs.find((d) => d.id === currentId + 1);

  const body =
    stage === "brief" ? (
      <BriefStage {...props} />
    ) : stage === "trends" ? (
      <TrendsStage {...props} />
    ) : (
      <OutfitsStage {...props} />
    );

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Collections"
        subtitle={`${collection.name} · ${collection.brief.market} · ${prettifyStatus(collection.status)}`}
        actions={
          <Link
            href="/app/activity"
            className="inline-flex h-[34px] items-center gap-1.5 rounded-[9px] border border-[rgba(0,0,0,0.12)] bg-surface px-3 text-[13px] font-semibold text-ink transition hover:bg-[#FAFAFA]"
          >
            <Icon name="activity" size={15} strokeWidth={1.9} />
            Activity
          </Link>
        }
      />

      <div className="flex-1 px-[30px] pb-10 pt-[18px]">
        <StudioTracker steps={steps} className="mb-4" />
        {body}
      </div>

      <StudioFooterBar
        currentId={currentId}
        stageLabel={STAGE_LABEL[stage]}
        backHref={prev?.href}
        backLabel={prev?.name}
        nextHref={next?.href}
        nextLabel="Continue"
      />
    </div>
  );
}

function prettifyStatus(status: string): string {
  const spaced = status.replace(/[_-]+/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : status;
}
