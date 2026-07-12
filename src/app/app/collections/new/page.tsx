import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listProducts } from "@/lib/supabase/repositories";
import { isSetupError } from "@/app/app/_lib/server";
import { PageHeader } from "@/app/app/_components/page-header";
import { SetupCard } from "@/app/app/_components/setup-card";
import {
  CollectionBriefForm,
  type HeroOption,
} from "@/app/app/_components/collection-brief-form";

/**
 * New collection (spec 23): the brief form. Hero-product options come from the
 * catalog; on submit the collection is created and the studio opens.
 */
export const dynamic = "force-dynamic";

async function loadHeroOptions(): Promise<{
  configured: boolean;
  products: HeroOption[];
}> {
  try {
    const products = await listProducts();
    return {
      configured: true,
      products: products.map((p) => ({
        id: p.id,
        title: p.title,
        category: p.analysis?.category ?? null,
      })),
    };
  } catch (error) {
    if (isSetupError(error)) return { configured: false, products: [] };
    throw error;
  }
}

export default async function NewCollectionPage() {
  const { configured, products } = await loadHeroOptions();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <Link
        href="/app/collections"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Back to collections
      </Link>

      <PageHeader
        eyebrow="New collection"
        title="Write the brief"
        description="The brief grounds every agent — trend research, styling, product development, and pricing all work against it."
      />

      {!configured ? (
        <SetupCard description="Connect Supabase to create a collection." />
      ) : (
        <CollectionBriefForm products={products} />
      )}
    </div>
  );
}
