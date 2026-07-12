import Link from "next/link";
import { integrationStatus } from "@/lib/env";
import { isSetupError } from "@/app/app/_lib/server";
import {
  getCollection,
  listDesignsByCollection,
  listProducts,
  type CollectionRow,
  type DesignRow,
} from "@/lib/supabase/repositories";
import type { ListingPayload } from "@/lib/domain/schemas";
import {
  PageHeader,
  StudioTracker,
  StudioFooter,
  SetupCard,
  EmptyState,
  Icon,
  type StudioStep,
} from "@/components/lo";
import { PublishView } from "./_components/publish-view";

/**
 * Store & Publish (Collection Studio stage 6). Server component: loads the
 * collection, its (single) new design and listing, and existing catalog counts,
 * degrading to a friendly setup card if Supabase is not configured. The
 * approval-gated draft/publish flow itself lives in the client PublishView.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PublishData {
  configured: boolean;
  collection: CollectionRow | null;
  design: DesignRow | null;
  existingProducts: number;
}

async function loadPublish(collectionId: string): Promise<PublishData> {
  try {
    const collection = await getCollection(collectionId);
    if (!collection) {
      return { configured: true, collection: null, design: null, existingProducts: 0 };
    }
    const [designs, products] = await Promise.all([
      listDesignsByCollection(collectionId),
      listProducts(),
    ]);
    // The MVP proposes exactly one new garment; prefer the one furthest along.
    const design =
      designs.find((d) => d.listing_payload) ??
      designs.find((d) => d.tech_pack) ??
      designs[0] ??
      null;
    return {
      configured: true,
      collection,
      design,
      existingProducts: products.length,
    };
  } catch (error) {
    if (isSetupError(error)) {
      return { configured: false, collection: null, design: null, existingProducts: 0 };
    }
    throw error;
  }
}

function buildTracker(collectionId: string): StudioStep[] {
  const base = `/app/collections/${collectionId}`;
  return [
    { id: 1, name: "Collection Brief", state: "done", href: base },
    { id: 2, name: "Trend Direction", state: "done", href: base },
    { id: 3, name: "Outfit Plan", state: "done", href: base },
    {
      id: 4,
      name: "New Product Design",
      state: "done",
      href: `${base}/product`,
    },
    { id: 5, name: "Source & Sample", state: "done", href: `${base}/sourcing` },
    { id: 6, name: "Store Draft & Publish", state: "current" },
  ];
}

export default async function PublishPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const status = integrationStatus();
  const data = await loadPublish(id);

  if (!data.configured) {
    return (
      <div>
        <PageHeader
          title="Store & Publish"
          subtitle="Create hidden Shopify drafts, then publish with your approval"
        />
        <div className="px-[30px] py-6">
          <SetupCard
            service="Supabase"
            message="Connect Supabase and run the migration to load this collection's listing and manage its Shopify drafts. The rest of LabelOS still runs in demo mode."
          />
        </div>
      </div>
    );
  }

  if (!data.collection) {
    return (
      <div>
        <PageHeader
          title="Store & Publish"
          subtitle="Create hidden Shopify drafts, then publish with your approval"
        />
        <div className="px-[30px] py-6">
          <div className="lo-card">
            <EmptyState
              icon="cart"
              title="Collection not found"
              description="This collection no longer exists. Pick another from the Collections list."
              action={
                <Link
                  href="/app/collections"
                  className="inline-flex h-9 items-center gap-1.5 rounded-[9px] bg-accent px-4 text-[13.5px] font-semibold text-white transition hover:brightness-[0.96]"
                >
                  All collections
                </Link>
              }
            />
          </div>
        </div>
      </div>
    );
  }

  const collection = data.collection;
  const design = data.design;
  const newProducts = design ? 1 : 0;
  const draftsCreated = Boolean(design?.shopify_product_gid);

  // Initial mode chip from persisted state + env (LIVE is reached client-side
  // only after a confirmed publish, so the header shows MOCK/DRAFT here).
  const mode = draftsCreated
    ? { label: "DRAFT", fg: "#48484A", bg: "rgba(120,120,128,0.14)" }
    : status.shopifyMode === "client_credentials" && status.shopifyConfigured
      ? { label: "READY", fg: "#0863C4", bg: "rgba(10,132,255,0.13)" }
      : { label: "MOCK MODE", fg: "#B25000", bg: "rgba(255,149,0,0.14)" };

  const lookbookHref = `/lookbook/${collection.slug}`;

  return (
    <div>
      <PageHeader
        title="Store & Publish"
        subtitle={`${collection.name} · ${data.existingProducts} existing + ${newProducts} new · Shopify draft`}
        actions={
          <>
            <a
              href={lookbookHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-[7px] rounded-[9px] border border-[rgba(0,0,0,0.12)] bg-surface px-[14px] text-[13px] font-semibold text-ink transition hover:bg-[#FAFAFA]"
            >
              <Icon name="eye" size={15} strokeWidth={1.8} />
              Preview public lookbook
            </a>
            <span
              className="rounded-full px-[11px] py-[5px] text-[11px] font-bold leading-none"
              style={{ color: mode.fg, background: mode.bg }}
            >
              {mode.label}
            </span>
          </>
        }
      />

      <div className="px-[30px] pt-[18px]">
        <StudioTracker steps={buildTracker(id)} />
      </div>

      <div className="px-[30px] pt-3 pb-10">
        {design ? (
          <PublishView
            collectionId={collection.id}
            collectionName={collection.name}
            collectionSlug={collection.slug}
            isPublic={collection.is_public}
            shopifyMode={status.shopifyMode}
            design={{
              id: design.id,
              name: design.name,
              shopifyProductGid: design.shopify_product_gid,
              listing: (design.listing_payload as ListingPayload | null) ?? null,
            }}
          />
        ) : (
          <div className="lo-card">
            <EmptyState
              icon="package"
              title="No product to publish yet"
              description="Finish Product Development for this collection — LabelOS needs a design with a draft tech pack before it can write a Shopify listing."
              action={
                <Link
                  href={`/app/collections/${collection.id}/product`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-[9px] bg-accent px-4 text-[13.5px] font-semibold text-white transition hover:brightness-[0.96]"
                >
                  Go to Product Development
                </Link>
              }
            />
          </div>
        )}
      </div>

      <StudioFooter
        currentId={6}
        stageLabel="Store Draft & Publish"
        back={{
          label: "Source & Sample",
          href: `/app/collections/${collection.id}/sourcing`,
        }}
        next={{ label: "Finish", href: "/app/dashboard" }}
      />
    </div>
  );
}
