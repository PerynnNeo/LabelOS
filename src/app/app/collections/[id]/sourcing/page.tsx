import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth/require-session";
import {
  getCollection,
  listDesignsByCollection,
  listSuppliers,
  type CollectionRow,
  type DesignRow,
  type SupplierRow,
} from "@/lib/supabase/repositories";
import { newDesignSchema } from "@/lib/domain/schemas";
import { isSetupError } from "@/app/app/_lib/server";
import {
  PageHeader,
  StudioTracker,
  StudioFooter,
  SetupCard,
  EmptyState,
  Pill,
  type StudioStep,
} from "@/components/lo";
import { SUPPLIER_TONE } from "@/lib/ui/tokens";
import { SourcingView } from "./_components/sourcing-view";

/**
 * Collection Studio · stage 5 — Production & Sourcing.
 *
 * Server component: resolves the collection's (single) design plus the supplier
 * board straight from the repository layer, degrading to a setup card when
 * Supabase is unconfigured. The whole sourcing flow runs in MOCK MODE — no
 * supplier is ever contacted and nothing is ordered. RFQ comparison and
 * recommendations are fetched client-side from the design's RFQ route.
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
    state: d.id < 5 ? "done" : d.id === 5 ? "current" : "todo",
  }));
}

const MOCK_PILL = (
  <Pill fg={SUPPLIER_TONE.demo.fg} bg={SUPPLIER_TONE.demo.bg}>
    MOCK MODE
  </Pill>
);

export default async function SourcingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionFromCookies();
  if (!session.ok) {
    redirect("/login?next=/app/collections");
  }

  const { id } = await params;

  let collection: CollectionRow | null = null;
  let design: DesignRow | null = null;
  let suppliers: SupplierRow[] = [];
  let setupFailed = false;
  try {
    if (UUID_RE.test(id)) {
      collection = await getCollection(id);
      if (collection) {
        const designs = await listDesignsByCollection(id);
        design = designs.length > 0 ? designs[designs.length - 1] : null;
        suppliers = await listSuppliers();
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
      title="Production & Sourcing"
      subtitle="Draft RFQs and simulate sampling — nothing is sent to a supplier"
      actions={MOCK_PILL}
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
        {header}
        <div className="px-[30px] py-6">
          <EmptyState
            icon="alert-triangle"
            title="Collection not found"
            description="This collection may have been removed. Return to your collections to continue."
          />
        </div>
      </div>
    );
  }

  if (!design) {
    return (
      <div>
        {header}
        <div className="px-[30px] pt-[18px] pb-2">
          <StudioTracker steps={studioSteps(id)} />
        </div>
        <div className="px-[30px] py-6">
          <EmptyState
            icon="box"
            title="No product to source yet"
            description="Design the new product in Product Development first — sourcing needs an approved concept and its costing before drafting RFQs."
            action={
              <a
                href={`/app/collections/${id}/product`}
                className="inline-flex h-9 items-center rounded-[9px] bg-accent px-4 text-[13px] font-semibold text-white transition hover:brightness-[0.96]"
              >
                Go to Product Development
              </a>
            }
          />
        </div>
        <StudioFooter
          currentId={5}
          stageLabel="Source & Sample"
          back={{ label: "Back", href: `/app/collections/${id}/product` }}
        />
      </div>
    );
  }

  const briefResult = newDesignSchema.safeParse(design.design_brief);
  const designName = briefResult.success ? briefResult.data.name : design.name;
  const currency = design.costing?.currency ?? "SGD";

  return (
    <div className="pb-2">
      <PageHeader
        title="Production & Sourcing"
        subtitle={`${designName} · first run 150 units · quotes in ${currency}`}
        actions={MOCK_PILL}
      />

      <div className="px-[30px] pt-[18px] pb-2">
        <StudioTracker steps={studioSteps(id)} />
      </div>

      <SourcingView
        designId={design.id}
        currency={currency}
        suppliers={suppliers}
      />

      <StudioFooter
        currentId={5}
        stageLabel="Source & Sample"
        back={{ label: "Back", href: `/app/collections/${id}/product` }}
        next={{
          label: "Store & Publish",
          href: `/app/collections/${id}/publish`,
        }}
      />
    </div>
  );
}
