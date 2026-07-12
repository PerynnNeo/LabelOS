import Link from "next/link";
import { ArrowRight, Layers, Plus } from "lucide-react";
import {
  listCollections,
  type CollectionRow,
} from "@/lib/supabase/repositories";
import { formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isSetupError } from "@/app/app/_lib/server";
import { PageHeader } from "@/app/app/_components/page-header";
import { SetupCard } from "@/app/app/_components/setup-card";

/**
 * Collections index (spec 23): every collection with its status and a link into
 * the Collection Studio.
 */
export const dynamic = "force-dynamic";

async function loadCollections(): Promise<{
  configured: boolean;
  collections: CollectionRow[];
}> {
  try {
    return { configured: true, collections: await listCollections() };
  } catch (error) {
    if (isSetupError(error)) return { configured: false, collections: [] };
    throw error;
  }
}

export default async function CollectionsPage() {
  const { configured, collections } = await loadCollections();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Studio"
        title="Collections"
        description="Seasonal collections move through five stages — brief, trends, outfits, product & production, and publish."
        actions={
          <Link href="/app/collections/new">
            <Button>
              <Plus aria-hidden className="size-4" />
              New collection
            </Button>
          </Link>
        }
      />

      {!configured ? (
        <SetupCard description="Connect Supabase to create and run collections." />
      ) : collections.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No collections yet"
          description="Start a collection to run trend research, styling, product development, and Shopify publishing."
          action={
            <Link href="/app/collections/new">
              <Button size="sm">Start a collection</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {collections.map((collection) => (
            <Link
              key={collection.id}
              href={`/app/collections/${collection.id}`}
              className="group block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Card className="flex h-full flex-col gap-3 p-5 transition-colors group-hover:border-ink">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-display text-xl leading-tight tracking-tight text-ink">
                    {collection.name}
                  </h2>
                  <StatusBadge kind="collection" status={collection.status} />
                </div>
                <p className="text-sm leading-relaxed text-muted">
                  {collection.brief.market} · {collection.brief.season} ·{" "}
                  {collection.brief.audience}
                </p>
                <div className="mt-auto flex items-center justify-between pt-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {collection.is_public ? (
                      <Badge variant="accent">Public lookbook</Badge>
                    ) : null}
                    <span className="text-xs text-muted">
                      {formatDate(collection.created_at)}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-accent">
                    Open
                    <ArrowRight aria-hidden className="size-4" />
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
