import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEnv } from "@/lib/env";
import { SupabaseNotConfiguredError } from "@/lib/supabase/admin";
import {
  getAppSettings,
  getCollectionBySlug,
  isMissingMigrationError,
  listDesignsByCollection,
  listOutfitsByCollection,
  listProducts,
  type CollectionRow,
  type DesignRow,
  type OutfitRow,
  type ProductRow,
} from "@/lib/supabase/repositories";
import { money } from "@/lib/ui/tokens";
import { Swatch } from "@/components/lo";

/**
 * Public, read-only lookbook.
 *
 * Renders ONLY when the collection exists and is_public. Every value on this
 * page comes from small **public DTOs** defined in this file (PublicItem /
 * PublicLook): inventory levels, garment analysis, SKUs, private image paths,
 * supplier data, costs, margins, agent prompts, trend internals and API
 * metadata are stripped and never reach the browser.
 *
 * Reproduces the editorial lookbook from the design mockup: a frosted brand
 * header, a centered Instrument-Serif hero, a 3-column grid of the six curated
 * final looks (fabric-swatch items, availability badge, "Shop the look" when a
 * live storefront exists, else "Coming soon · notify me"), and a footer line.
 *
 * Server component reading data directly via the service-role repository layer
 * → Node runtime.
 */
export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Public DTOs — the ONLY shapes that reach the browser
// ---------------------------------------------------------------------------

interface PublicItem {
  id: string;
  title: string;
  /** Public image URL only — the private catalog path is never exposed. */
  imageUrl: string | null;
}

interface PublicLook {
  id: string;
  name: string;
  occasion: string;
  /** Sum of the look's product prices, in the brand currency. */
  total: number;
  currency: string;
  items: PublicItem[];
}

interface LookbookView {
  eyebrow: string;
  title: string;
  story: string;
  brandName: string;
  market: string;
  currency: string;
  /** Live storefront URL for "Shop the look", or null → "Coming soon". */
  shopUrl: string | null;
  looks: PublicLook[];
}

// ---------------------------------------------------------------------------
// Mapping helpers — strip every internal field
// ---------------------------------------------------------------------------

function toPublicItem(row: ProductRow): PublicItem {
  return {
    id: row.id,
    title: row.title,
    // Only ever the public URL; image_path (private bucket) is withheld.
    imageUrl: row.public_image_url ?? null,
  };
}

/**
 * Build a storefront link for the capsule.
 *
 * Honest gating: we only link when a genuine public handle or storefront URL is
 * available. A bare draft-product GID is NOT publicly viewable, so we never
 * fabricate a storefront URL from it (that would 404 on a public page).
 */
function buildShopUrl(design: DesignRow | null): string | null {
  if (!design) return null;
  const brief =
    design.design_brief && typeof design.design_brief === "object"
      ? (design.design_brief as Record<string, unknown>)
      : {};

  const publicUrl = brief.shopifyPublicUrl;
  if (typeof publicUrl === "string" && /^https?:\/\//i.test(publicUrl)) {
    return publicUrl;
  }

  const handle = brief.shopifyHandle;
  const shop = getEnv().SHOPIFY_SHOP;
  if (
    typeof handle === "string" &&
    handle.trim().length > 0 &&
    typeof shop === "string" &&
    shop.trim().length > 0
  ) {
    return `https://${shop.trim()}.myshopify.com/products/${handle.trim()}`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

/**
 * Load and shape the public view for a slug. Returns null when the collection
 * does not exist, is not public, or Supabase is not configured — the caller
 * turns that into a 404 (a public page must not leak setup hints).
 */
const loadLookbook = cache(async function loadLookbook(
  slug: string,
): Promise<LookbookView | null> {
  let collection: CollectionRow | null;
  try {
    collection = await getCollectionBySlug(slug);
  } catch (error) {
    // A public page must not leak setup hints — treat an unconfigured or
    // un-migrated backend as "not available" (404) rather than a 500.
    if (
      error instanceof SupabaseNotConfiguredError ||
      isMissingMigrationError(error)
    ) {
      return null;
    }
    throw error;
  }

  if (!collection || !collection.is_public) return null;

  const settings = await getAppSettings();
  const currency = settings?.currency ?? "SGD";
  const brandName = settings?.brand_name ?? "LabelOS";

  const [finalOutfits, allProducts, designs] = await Promise.all([
    listOutfitsByCollection(collection.id, { status: "final" }),
    listProducts(),
    listDesignsByCollection(collection.id),
  ]);

  const productsById = new Map(allProducts.map((row) => [row.id, row]));

  // Order the final looks by the curator's selection order when available.
  const summary = collection.curation_summary;
  const order = summary?.selectedOutfitIds ?? [];
  const orderIndex = new Map(order.map((id, index) => [id, index]));
  const orderedOutfits = [...finalOutfits].sort((a, b) => {
    const ai = orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bi = orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });

  const looks: PublicLook[] = orderedOutfits.map((outfit: OutfitRow) => {
    const items = outfit.product_ids
      .map((productId) => productsById.get(productId))
      .filter((row): row is ProductRow => Boolean(row));
    const total = items.reduce((sum, row) => sum + (row.price ?? 0), 0);
    return {
      id: outfit.id,
      name: outfit.name,
      occasion: outfit.occasion,
      total,
      currency,
      items: items.map(toPublicItem),
    };
  });

  // Story + title prefer the curator's editorial copy (stored alongside the
  // curation summary), then the summary notes, then the brief objective.
  const summaryExtra = (summary ?? null) as unknown as
    | { title?: unknown; story?: unknown }
    | null;
  const storyTitle = summaryExtra?.title;
  const storyText = summaryExtra?.story;

  const title =
    typeof storyTitle === "string" && storyTitle.trim()
      ? storyTitle.trim()
      : collection.name;
  const story =
    typeof storyText === "string" && storyText.trim()
      ? storyText.trim()
      : summary?.notes?.trim() || collection.brief.commercialObjective || "";

  const shopUrl = buildShopUrl(designs[0] ?? null);

  return {
    eyebrow: collection.name,
    title,
    story,
    brandName,
    market: collection.brief.market || "",
    currency,
    shopUrl,
    looks,
  };
});

// ---------------------------------------------------------------------------
// Metadata (Open Graph)
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  let view: LookbookView | null = null;
  try {
    view = await loadLookbook(slug);
  } catch {
    view = null;
  }

  if (!view) {
    return {
      title: "Lookbook not found · LabelOS",
      robots: { index: false, follow: false },
    };
  }

  const description =
    view.story.length > 0
      ? view.story.slice(0, 200)
      : `A capsule collection by ${view.brandName}.`;

  const firstImage =
    view.looks.flatMap((look) => look.items)[0]?.imageUrl ?? null;

  const appUrl = getEnv().APP_URL;
  const metadataBase = (() => {
    try {
      return new URL(appUrl);
    } catch {
      return undefined;
    }
  })();

  return {
    title: `${view.title} · ${view.brandName}`,
    description,
    metadataBase,
    alternates: { canonical: `/lookbook/${slug}` },
    openGraph: {
      type: "website",
      title: `${view.title} · ${view.brandName}`,
      description,
      url: `/lookbook/${slug}`,
      images: firstImage ? [{ url: firstImage }] : undefined,
    },
    twitter: {
      card: firstImage ? "summary_large_image" : "summary",
      title: `${view.title} · ${view.brandName}`,
      description,
      images: firstImage ? [firstImage] : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Presentation (warm editorial palette from the mockup — intentionally
// distinct from the app canvas, so its tones live inline here)
// ---------------------------------------------------------------------------

function LookCard({ look, shopUrl }: { look: PublicLook; shopUrl: string | null }) {
  const shoppable = shopUrl !== null;
  return (
    <div>
      <div className="relative flex gap-[7px] rounded-[7px] bg-white p-[9px] shadow-[0_1px_4px_rgba(0,0,0,0.07)]">
        <span
          className="absolute left-[15px] top-[15px] z-[2] rounded-full bg-white/85 px-[9px] py-[3px] text-[10.5px] font-bold backdrop-blur-[4px]"
          style={{ color: shoppable ? "#248A3D" : "#B25000" }}
        >
          {shoppable ? "In stock" : "Coming soon"}
        </span>
        {look.items.length > 0 ? (
          look.items.map((item) => (
            <Swatch
              key={item.id}
              seed={item.id}
              label={item.title}
              imageUrl={item.imageUrl ?? undefined}
              aspect="3/4"
              rounded={3}
              className="flex-1"
            />
          ))
        ) : (
          <div className="flex aspect-[3/4] flex-1 items-center justify-center rounded-[3px] bg-[#EDE7DE] px-3 text-center text-[10px] text-black/40">
            Imagery coming soon
          </div>
        )}
      </div>

      <div className="px-1 pb-1 pt-[15px] text-center">
        <div className="font-display text-[23px] leading-tight tracking-[0.01em] text-[#1D1D1F]">
          {look.name}
        </div>
        <div className="mt-1 text-[13px] text-[#8E8E93]">
          Outfit {money(look.total, look.currency)}
        </div>
        <div className="mt-3 flex justify-center">
          {shoppable ? (
            <a
              href={shopUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 border-b border-[#1D1D1F] pb-0.5 text-[12px] font-semibold text-[#1D1D1F] transition-opacity hover:opacity-80"
            >
              Shop the look
            </a>
          ) : (
            <span className="inline-flex items-center gap-1.5 border-b border-[#C7C7CC] pb-0.5 text-[12px] font-semibold text-[#8E8E93]">
              Coming soon · notify me
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default async function LookbookPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const view = await loadLookbook(slug);

  if (!view) {
    notFound();
  }

  const looks = view.looks;

  const footerParts = [view.brandName, view.market, `prices in ${view.currency}`]
    .map((part) => part.trim())
    .filter(Boolean);

  return (
    <div className="min-h-dvh bg-[#F7F5F1]">
      {/* Frosted brand header */}
      <header className="sticky top-0 z-[5] flex items-center gap-3.5 border-b border-black/[0.07] bg-[#F7F5F1]/[0.86] px-6 py-4 backdrop-blur-[20px] backdrop-saturate-[180%] sm:px-10">
        <div className="flex-1 truncate font-display text-[24px] leading-none tracking-[0.01em] text-[#1D1D1F]">
          {view.brandName}
        </div>
        <span className="shrink-0 text-[12px] text-[#8E8E93]">{view.eyebrow}</span>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-[760px] px-6 pb-11 pt-[52px] text-center sm:px-10 sm:pt-[66px]">
        {view.eyebrow && view.eyebrow !== view.title ? (
          <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-[#A08D74]">
            {view.eyebrow}
          </p>
        ) : null}
        <h1 className="mx-auto mt-4 font-display text-[40px] leading-[1.03] tracking-[-0.01em] text-[#1D1D1F] sm:text-[54px] md:text-[66px]">
          {view.title}
        </h1>
        {view.story ? (
          <p className="mx-auto mt-[18px] max-w-[520px] text-[15px] leading-relaxed text-[#6E6E73]">
            {view.story}
          </p>
        ) : null}
      </section>

      {/* The looks */}
      {looks.length > 0 ? (
        <section className="mx-auto grid max-w-[1200px] grid-cols-1 gap-[22px] px-6 pb-16 sm:grid-cols-2 sm:px-9 lg:grid-cols-3">
          {looks.map((look) => (
            <LookCard key={look.id} look={look} shopUrl={view.shopUrl} />
          ))}
        </section>
      ) : (
        <section className="mx-auto max-w-[760px] px-6 pb-16 text-center">
          <p className="text-[14px] text-[#8E8E93]">
            The looks for this capsule are being finalised.
          </p>
        </section>
      )}

      {/* Footer */}
      <footer className="px-6 pb-[60px] text-center text-[11.5px] text-[#B8AE9E] sm:px-10">
        {footerParts.join(" · ")}
      </footer>
    </div>
  );
}
