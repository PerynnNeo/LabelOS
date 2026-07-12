import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
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
import {
  newDesignSchema,
  trendReportSchema,
  type CurationLabel,
  type TrendReport,
} from "@/lib/domain/schemas";
import { formatCurrency } from "@/lib/utils";

/**
 * Public, read-only lookbook (spec section 22).
 *
 * Renders ONLY when the collection exists and is_public. Everything on this
 * page is derived from small **public DTOs** defined in this file
 * (PublicProduct / PublicOutfit / PublicDesign): inventory levels, garment
 * analysis, SKUs, private image paths, supplier data, costs, margins, agent
 * prompts, and API metadata are stripped and never reach the browser.
 *
 * Server component reading data directly via the repository layer. Renders on
 * the Node runtime because it uses the service-role Supabase client.
 */
export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Public DTOs — the ONLY shapes that reach the browser
// ---------------------------------------------------------------------------

interface PublicProduct {
  id: string;
  title: string;
  price: number;
  currency: string;
  /** Public image URL only — the private catalog path is never exposed. */
  imageUrl: string | null;
}

interface PublicOutfit {
  id: string;
  name: string;
  occasion: string;
  label: CurationLabel | null;
  /** Composer styling description — public-safe editorial copy. */
  description: string;
  products: PublicProduct[];
}

interface PublicTrendSignal {
  name: string;
  summary: string;
  adoptionStage: TrendReport["signals"][number]["adoptionStage"];
}

interface PublicDesign {
  name: string;
  description: string;
  imageUrl: string | null;
  price: number | null;
  currency: string;
  shopifyUrl: string | null;
}

interface LookbookView {
  title: string;
  story: string;
  brandName: string;
  currency: string;
  trend: {
    signals: PublicTrendSignal[];
    limitations: string[];
    isDemo: boolean;
  } | null;
  outfits: PublicOutfit[];
  design: PublicDesign | null;
}

// ---------------------------------------------------------------------------
// Mapping helpers — strip every internal field
// ---------------------------------------------------------------------------

function toPublicProduct(row: ProductRow, currency: string): PublicProduct {
  return {
    id: row.id,
    title: row.title,
    price: row.price,
    currency,
    // Only ever the public URL; image_path (private bucket) is withheld.
    imageUrl: row.public_image_url ?? null,
  };
}

/** Extract the composer's public-safe styling description from an outfit. */
function composerDescription(outfit: OutfitRow): string {
  const generation = outfit.generation;
  if (!generation || typeof generation !== "object") return "";
  const composer = (generation as Record<string, unknown>).composer;
  if (!composer || typeof composer !== "object") return "";
  const description = (composer as Record<string, unknown>).description;
  return typeof description === "string" ? description : "";
}

/**
 * Build a storefront link for the new design's Shopify product.
 *
 * Honest gating: we only link when a genuine public handle or storefront URL
 * is available. A bare draft-product GID is NOT publicly viewable, so we never
 * fabricate a storefront URL from it (that would 404 on a public page).
 */
function buildShopifyUrl(design: DesignRow): string | null {
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

function designImageUrl(design: DesignRow): string | null {
  const brief =
    design.design_brief && typeof design.design_brief === "object"
      ? (design.design_brief as Record<string, unknown>)
      : {};
  const manual = brief.manualImageUrl;
  if (typeof manual === "string" && /^https?:\/\//i.test(manual)) return manual;
  // rendered_image_path stores a full public URL from the publish bucket.
  return design.rendered_image_path ?? null;
}

function toPublicDesign(design: DesignRow, currency: string): PublicDesign {
  const parsed = newDesignSchema.safeParse(design.design_brief);
  const brief = parsed.success ? parsed.data : null;

  const descriptionParts = brief
    ? [brief.problemSolved, brief.constructionDirection].filter(
        (part): part is string => Boolean(part && part.trim()),
      )
    : [];

  return {
    name: brief?.name ?? design.name,
    description: descriptionParts.join(" "),
    imageUrl: designImageUrl(design),
    price: brief?.targetRetailPrice ?? null,
    currency,
    shopifyUrl: buildShopifyUrl(design),
  };
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
  const labels: Record<string, CurationLabel> = summary?.labels ?? {};
  const orderIndex = new Map(order.map((id, index) => [id, index]));
  const orderedOutfits = [...finalOutfits].sort((a, b) => {
    const ai = orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bi = orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });

  const outfits: PublicOutfit[] = orderedOutfits.map((outfit) => ({
    id: outfit.id,
    name: outfit.name,
    occasion: outfit.occasion,
    label: (labels[outfit.id] as CurationLabel | undefined) ?? null,
    description: composerDescription(outfit),
    products: outfit.product_ids
      .map((productId) => productsById.get(productId))
      .filter((row): row is ProductRow => Boolean(row))
      .map((row) => toPublicProduct(row, currency)),
  }));

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

  // Trend directions — public-safe: signal names + summaries + limitations only.
  const trendParsed = trendReportSchema.safeParse(collection.trend_report);
  const trend = trendParsed.success
    ? {
        signals: trendParsed.data.signals.map((signal) => ({
          name: signal.name,
          summary: signal.summary,
          adoptionStage: signal.adoptionStage,
        })),
        limitations: trendParsed.data.limitations,
        isDemo: trendParsed.data.sourceMode !== "live_web_search",
      }
    : null;

  const primaryDesign = designs[0] ?? null;
  const design = primaryDesign
    ? toPublicDesign(primaryDesign, currency)
    : null;

  return { title, story, brandName, currency, trend, outfits, design };
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
    view.outfits.flatMap((outfit) => outfit.products)[0]?.imageUrl ??
    view.design?.imageUrl ??
    null;

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
// Presentation
// ---------------------------------------------------------------------------

const ADOPTION_LABELS: Record<
  PublicTrendSignal["adoptionStage"],
  string
> = {
  emerging: "Emerging",
  growing: "Growing",
  established: "Established",
  declining: "Declining",
  uncertain: "Uncertain",
};

const LABEL_COPY: Record<CurationLabel, string> = {
  Core: "Core look",
  Directional: "Directional look",
  Statement: "Statement look",
};

function ProductThumb({ product }: { product: PublicProduct }) {
  return (
    <figure className="flex flex-col gap-2">
      <div className="aspect-[4/5] w-full overflow-hidden border border-line bg-paper">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.title}
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center px-3 text-center font-display text-sm text-line">
            {product.title}
          </div>
        )}
      </div>
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm text-ink">
          {product.title}
        </span>
        <span className="shrink-0 text-sm tabular-nums text-muted">
          {formatCurrency(product.price, product.currency)}
        </span>
      </figcaption>
    </figure>
  );
}

function LookSection({ outfit, index }: { outfit: PublicOutfit; index: number }) {
  const number = String(index + 1).padStart(2, "0");
  return (
    <article className="border-t border-line pt-10">
      <div className="flex flex-col gap-8 md:flex-row md:gap-12">
        <div className="md:w-64 md:shrink-0">
          <div className="flex items-center gap-4">
            <span
              aria-hidden
              className="font-display text-5xl leading-none text-line"
            >
              {number}
            </span>
            <div className="flex flex-col gap-1">
              {outfit.occasion ? (
                <span className="eyebrow">{outfit.occasion}</span>
              ) : null}
              {outfit.label ? (
                <span className="text-xs font-medium uppercase tracking-[0.15em] text-muted">
                  {LABEL_COPY[outfit.label]}
                </span>
              ) : null}
            </div>
          </div>
          <h3 className="mt-4 font-display text-2xl leading-tight text-ink">
            {outfit.name}
          </h3>
          {outfit.description ? (
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {outfit.description}
            </p>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          {outfit.products.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {outfit.products.map((product) => (
                <ProductThumb key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">
              Product imagery for this look is not yet available.
            </p>
          )}
        </div>
      </div>
    </article>
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

  return (
    <div className="flex flex-1 flex-col bg-paper">
      <main className="mx-auto w-full max-w-5xl px-6 py-16 md:py-24">
        {/* Masthead */}
        <header className="border-b border-line pb-12">
          <p className="eyebrow">{view.brandName} · Lookbook</p>
          <h1 className="mt-5 max-w-3xl font-display text-4xl leading-[1.05] text-ink sm:text-5xl md:text-6xl">
            {view.title}
          </h1>
          {view.story ? (
            <p className="mt-8 max-w-2xl text-lg leading-relaxed text-muted">
              {view.story}
            </p>
          ) : null}
        </header>

        {/* Trend directions */}
        {view.trend && view.trend.signals.length > 0 ? (
          <section className="mt-16" aria-labelledby="trend-heading">
            <h2
              id="trend-heading"
              className="font-display text-2xl leading-tight text-ink"
            >
              Trend directions
            </h2>
            {view.trend.isDemo ? (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
                These directions are demonstration hypotheses, not current
                market evidence.
              </p>
            ) : null}
            <div className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {view.trend.signals.map((signal, index) => (
                <div key={`${signal.name}-${index}`} className="flex flex-col gap-2">
                  <span className="text-xs font-medium uppercase tracking-[0.15em] text-accent">
                    {ADOPTION_LABELS[signal.adoptionStage]}
                  </span>
                  <h3 className="font-display text-lg leading-tight text-ink">
                    {signal.name}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted">
                    {signal.summary}
                  </p>
                </div>
              ))}
            </div>
            {view.trend.limitations.length > 0 ? (
              <div className="mt-8 border-t border-line pt-6">
                <p className="text-xs font-medium uppercase tracking-[0.15em] text-muted">
                  Limitations
                </p>
                <ul className="mt-3 flex flex-col gap-1.5 text-sm leading-relaxed text-muted">
                  {view.trend.limitations.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* The looks */}
        {view.outfits.length > 0 ? (
          <section className="mt-20" aria-labelledby="looks-heading">
            <h2
              id="looks-heading"
              className="font-display text-2xl leading-tight text-ink"
            >
              The looks
            </h2>
            <div className="mt-10 flex flex-col gap-10">
              {view.outfits.map((outfit, index) => (
                <LookSection key={outfit.id} outfit={outfit} index={index} />
              ))}
            </div>
          </section>
        ) : null}

        {/* New design */}
        {view.design ? (
          <section className="mt-20" aria-labelledby="design-heading">
            <h2
              id="design-heading"
              className="font-display text-2xl leading-tight text-ink"
            >
              A new piece for this capsule
            </h2>
            <div className="mt-10 flex flex-col gap-10 border-t border-line pt-10 md:flex-row md:gap-14">
              <div className="md:w-2/5 md:shrink-0">
                <div className="aspect-[4/5] w-full overflow-hidden border border-line bg-surface">
                  {view.design.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={view.design.imageUrl}
                      alt={view.design.name}
                      className="size-full object-contain"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center px-6 text-center font-display text-base text-line">
                      {view.design.name}
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted">
                  Flat sketch — a communication aid, not a technical drawing.
                </p>
              </div>

              <div className="min-w-0 flex-1">
                <h3 className="font-display text-3xl leading-tight text-ink">
                  {view.design.name}
                </h3>
                {view.design.price !== null ? (
                  <p className="mt-3 text-lg tabular-nums text-muted">
                    {formatCurrency(view.design.price, view.design.currency)}
                  </p>
                ) : null}
                {view.design.description ? (
                  <p className="mt-6 max-w-xl text-base leading-relaxed text-muted">
                    {view.design.description}
                  </p>
                ) : null}
                {view.design.shopifyUrl ? (
                  <a
                    href={view.design.shopifyUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-8 inline-flex items-center gap-2 bg-ink px-6 py-3 text-sm font-medium tracking-wide text-paper transition-colors hover:bg-accent"
                  >
                    View on Shopify
                    <ExternalLink aria-hidden className="size-4" />
                  </a>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {/* Footer */}
        <footer className="mt-24 border-t border-line pt-8">
          <p className="text-sm text-muted">
            {view.brandName} — a capsule collection.
          </p>
          <p className="mt-1 text-xs text-muted">
            Public lookbook. Trend directions are directional, not guaranteed
            predictions.
          </p>
        </footer>
      </main>
    </div>
  );
}
