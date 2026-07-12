import Link from "next/link";
import { Card, EmptyState, Icon, PageHeader, Pill, SetupCard } from "@/components/lo";
import type { Tone } from "@/lib/ui/tokens";
import {
  listCollections,
  type CollectionRow,
} from "@/lib/supabase/repositories";
import { isSetupError } from "@/app/app/_lib/server";
import { formatDate } from "@/lib/utils";

/**
 * Collections index — every collection with its status and current stage, and
 * an entry point into the Collection Studio. A Supabase/migration setup error
 * degrades to a friendly card instead of crashing.
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

const STATUS_TONE: Record<string, Tone> = {
  draft: { label: "Draft", fg: "#6E6E73", bg: "rgba(120,120,128,0.14)" },
  published: { label: "Published", fg: "#248A3D", bg: "rgba(52,199,89,0.14)" },
  archived: { label: "Archived", fg: "#6E6E73", bg: "rgba(120,120,128,0.14)" },
};

function statusTone(status: string): Tone {
  return (
    STATUS_TONE[status] ?? {
      label: status,
      fg: "#0863C4",
      bg: "rgba(10,132,255,0.13)",
    }
  );
}

function prettify(value: string): string {
  const spaced = value.replace(/[_-]+/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : value;
}

/** Coarse progress hint derivable from the collection row alone. */
function stageHint(c: CollectionRow): string {
  if (c.curation_summary) return "Outfit plan curated";
  if (c.trend_report) return "Trends compiled";
  return "Brief";
}

const NEW_BUTTON_CLASS =
  "inline-flex h-9 items-center gap-1.5 rounded-[9px] bg-accent px-[15px] text-[13.5px] font-[650] text-white shadow-[0_4px_12px_-3px_rgba(10,132,255,0.6)] transition hover:brightness-[0.96]";

export default async function CollectionsPage() {
  const { configured, collections } = await loadCollections();

  return (
    <div>
      <PageHeader
        title="Collections"
        subtitle="Seasonal collections move from brief to storefront in six stages."
        actions={
          <Link href="/app/collections/new" className={NEW_BUTTON_CLASS}>
            <Icon name="plus" size={16} strokeWidth={2.2} />
            New collection
          </Link>
        }
      />

      <div className="px-[30px] py-6">
        {!configured ? (
          <SetupCard
            service="Supabase"
            message="Connect Supabase and run the database migration to create and run collections."
          />
        ) : collections.length === 0 ? (
          <Card>
            <EmptyState
              icon="layers"
              title="No collections yet"
              description="Start a collection to run trend research, styling, product development, and Shopify publishing."
              action={
                <Link href="/app/collections/new" className={NEW_BUTTON_CLASS}>
                  <Icon name="plus" size={16} strokeWidth={2.2} />
                  New collection
                </Link>
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {collections.map((c) => (
              <Link
                key={c.id}
                href={`/app/collections/${c.id}`}
                className="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <Card className="flex h-full flex-col gap-3 p-5 transition-shadow group-hover:shadow-raise">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-display text-[22px] leading-tight tracking-[-0.01em] text-ink">
                      {c.name}
                    </h2>
                    <Pill tone={statusTone(c.status)}>{prettify(c.status)}</Pill>
                  </div>
                  <p className="text-[13px] text-muted">
                    {c.brief.market} · {c.brief.season} · {c.brief.audience}
                  </p>
                  <div className="mt-auto flex items-center justify-between gap-3 pt-2">
                    <div className="flex flex-wrap items-center gap-2 text-[12px] text-faint">
                      {c.is_public ? (
                        <Pill fg="#0863C4" bg="rgba(10,132,255,0.13)">
                          Public lookbook
                        </Pill>
                      ) : null}
                      <span>{stageHint(c)}</span>
                      <span aria-hidden>·</span>
                      <span>{formatDate(c.created_at)}</span>
                    </div>
                    <span className="inline-flex flex-none items-center gap-1 text-[13px] font-semibold text-accent">
                      Open
                      <Icon name="arrow-right" size={15} strokeWidth={2} />
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
