import Link from "next/link";
import { Icon, PageHeader } from "@/components/lo";
import { NewCollectionForm } from "./new-collection-form";

/**
 * New collection — the brief form. A thin server wrapper: the form is a Client
 * Component that fetches hero-product options itself and creates the collection
 * via POST /api/collections before opening the Collection Studio.
 */
export const dynamic = "force-dynamic";

export default function NewCollectionPage() {
  return (
    <div>
      <PageHeader
        title="New collection"
        subtitle="The brief grounds every agent — trends, styling, product development, and pricing all work against it."
        actions={
          <Link
            href="/app/collections"
            className="inline-flex h-[34px] items-center gap-1.5 rounded-[9px] border border-[rgba(0,0,0,0.12)] bg-surface px-3 text-[13px] font-semibold text-ink transition hover:bg-[#FAFAFA]"
          >
            <Icon name="chevron-left" size={15} strokeWidth={2} />
            Back to collections
          </Link>
        }
      />

      <div className="px-[30px] py-6">
        <div className="mx-auto w-full max-w-3xl">
          <NewCollectionForm />
        </div>
      </div>
    </div>
  );
}
