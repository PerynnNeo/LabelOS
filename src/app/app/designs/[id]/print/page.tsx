import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileWarning } from "lucide-react";
import { getSessionFromCookies } from "@/lib/auth/require-session";
import { SupabaseNotConfiguredError } from "@/lib/supabase/admin";
import { getDesign, type DesignRow } from "@/lib/supabase/repositories";
import {
  techPackSchema,
  TECH_PACK_DRAFT_STATUS,
  type TechPack,
} from "@/lib/domain/schemas";
import { EmptyState } from "@/components/empty-state";
import { formatDate } from "@/lib/utils";
import { PrintButton } from "./print-button";

/**
 * Tech-pack PRINT view (spec sections 18 & 24).
 *
 * Session-protected server component that renders the design's DRAFT tech pack
 * as a print-optimised HTML document. Print styling is inlined via a <style>
 * block (no PDF library): the app chrome and toolbar are hidden with @media
 * print, leaving only the document, which the owner prints or saves as a PDF.
 *
 * Reads the design directly from the service-role repository layer → Node.
 */
export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Print + screen styles for the document. Scoped by #techpack-print. */
const PRINT_STYLES = `
  @media print {
    @page { margin: 14mm; }
    html, body { background: #ffffff !important; }
    .no-print { display: none !important; }
    /* Remove the authenticated app chrome (sidebar / nav) when printing. */
    aside, nav { display: none !important; }
    #techpack-print { border: 0 !important; box-shadow: none !important; }
    #techpack-print table { page-break-inside: auto; }
    #techpack-print tr { page-break-inside: avoid; }
    #techpack-print thead { display: table-header-group; }
    #techpack-print h2, #techpack-print h3 { break-after: avoid; }
  }
`;

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-[0.15em] text-muted">
        {label}
      </span>
      <span className="text-sm text-ink">{value}</span>
    </div>
  );
}

function DetailList({
  title,
  items,
  empty = "None recorded.",
}: {
  title: string;
  items: string[];
  empty?: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-display text-base leading-tight text-ink">{title}</h3>
      {items.length > 0 ? (
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-ink marker:text-line">
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{empty}</p>
      )}
    </section>
  );
}

function BomTable({ rows }: { rows: TechPack["billOfMaterials"] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted">No bill of materials recorded.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink text-left">
            <th className="py-2 pr-4 font-medium text-ink">Item</th>
            <th className="py-2 pr-4 font-medium text-ink">Placement</th>
            <th className="py-2 pr-4 font-medium text-ink">Composition</th>
            <th className="py-2 pr-4 font-medium text-ink">Supplier ref.</th>
            <th className="py-2 font-medium text-ink">Verified</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-line align-top">
              <td className="py-2 pr-4 text-ink">{row.item}</td>
              <td className="py-2 pr-4 text-ink">{row.placement}</td>
              <td className="py-2 pr-4 text-ink">{row.composition}</td>
              <td className="py-2 pr-4 text-muted">
                {row.supplierReference || "—"}
              </td>
              <td className="py-2">
                {row.verified ? (
                  <span className="text-success">Verified</span>
                ) : (
                  <span className="text-muted">Unverified</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MeasurementTable({ techPack }: { techPack: TechPack }) {
  const { measurementTable, sizeRange } = techPack;
  if (measurementTable.length === 0) {
    return (
      <p className="text-sm text-muted">
        No measurement points recorded. All values TBD pending a technical
        designer.
      </p>
    );
  }
  const columns = sizeRange.length > 0 ? sizeRange : ["Spec"];
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink text-left">
            <th className="py-2 pr-4 font-medium text-ink">Point of measure</th>
            {columns.map((size) => (
              <th key={size} className="py-2 pr-4 font-medium text-ink">
                {size}
              </th>
            ))}
            <th className="py-2 font-medium text-ink">Tol. (cm)</th>
          </tr>
        </thead>
        <tbody>
          {measurementTable.map((row, index) => (
            <tr key={index} className="border-b border-line align-top">
              <td className="py-2 pr-4 text-ink">{row.pointOfMeasure}</td>
              {columns.map((size) => {
                const value = row.sizes[size];
                const isTbd = !value || value.trim().toUpperCase() === "TBD";
                return (
                  <td
                    key={size}
                    className={
                      isTbd
                        ? "py-2 pr-4 text-muted"
                        : "py-2 pr-4 tabular-nums text-ink"
                    }
                  >
                    {isTbd ? "TBD" : value}
                  </td>
                );
              })}
              <td className="py-2 tabular-nums text-muted">
                {row.toleranceCm || "TBD"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TechPackDocument({
  design,
  techPack,
}: {
  design: DesignRow;
  techPack: TechPack;
}) {
  const isDraft = techPack.status === TECH_PACK_DRAFT_STATUS;
  return (
    <article
      id="techpack-print"
      className="mx-auto w-full max-w-4xl border border-line bg-surface px-8 py-10 md:px-12 md:py-12"
    >
      {/* Header */}
      <header className="flex flex-col gap-6 border-b border-line pb-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-accent">
              Technical package — Draft
            </span>
            <h1 className="font-display text-3xl leading-tight text-ink">
              {techPack.garmentName}
            </h1>
          </div>
          <div className="text-right text-sm text-muted">
            Generated {formatDate(design.updated_at)}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Style code" value={techPack.styleCode} />
          <Field label="Version" value={`v${techPack.version}`} />
          <Field
            label="Size range"
            value={techPack.sizeRange.join(", ") || "TBD"}
          />
          <Field label="Status" value="Draft" />
        </div>
      </header>

      {/* Draft warning banner */}
      {isDraft ? (
        <div className="mt-8 flex items-start gap-3 border border-warning/40 bg-warning/10 px-5 py-4">
          <FileWarning
            aria-hidden
            className="mt-0.5 size-5 shrink-0 text-warning"
          />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-ink">
              {TECH_PACK_DRAFT_STATUS.replace(/_/g, " ")}
            </p>
            <p className="text-sm leading-relaxed text-muted">
              This is a draft outline for review by a qualified technical
              designer and manufacturer. It is not production-authorised and
              measurements, tolerances, materials, and care claims must be
              verified before sampling.
            </p>
          </div>
        </div>
      ) : null}

      {/* Front & back details */}
      <div className="mt-10 grid gap-10 sm:grid-cols-2">
        <DetailList title="Front details" items={techPack.frontDetails} />
        <DetailList title="Back details" items={techPack.backDetails} />
      </div>

      {/* Construction */}
      <div className="mt-10">
        <DetailList
          title="Construction notes"
          items={techPack.constructionNotes}
        />
      </div>

      {/* Bill of materials */}
      <section className="mt-10 flex flex-col gap-3">
        <h2 className="font-display text-xl leading-tight text-ink">
          Bill of materials
        </h2>
        <BomTable rows={techPack.billOfMaterials} />
      </section>

      {/* Trims */}
      <div className="mt-10">
        <DetailList title="Trims" items={techPack.trims} />
      </div>

      {/* Measurements */}
      <section className="mt-10 flex flex-col gap-3">
        <h2 className="font-display text-xl leading-tight text-ink">
          Measurement table
        </h2>
        <p className="text-sm text-muted">
          Cells marked TBD require confirmation by a technical designer.
        </p>
        <MeasurementTable techPack={techPack} />
      </section>

      {/* Artwork, labelling, packaging */}
      <div className="mt-10 grid gap-10 sm:grid-cols-2">
        <DetailList
          title="Artwork placement"
          items={techPack.artworkPlacement}
        />
        <DetailList title="Labelling" items={techPack.labelling} />
      </div>
      <div className="mt-10 grid gap-10 sm:grid-cols-2">
        <DetailList title="Packaging" items={techPack.packaging} />
        <DetailList title="Quality checklist" items={techPack.qualityChecks} />
      </div>

      {/* Questions & assumptions */}
      <div className="mt-10 grid gap-10 sm:grid-cols-2">
        <DetailList
          title="Unresolved questions"
          items={techPack.unresolvedQuestions}
          empty="No open questions recorded."
        />
        <DetailList
          title="Assumptions"
          items={techPack.assumptions}
          empty="No assumptions recorded."
        />
      </div>

      {/* Disclaimer footer */}
      <footer className="mt-12 border-t border-line pt-6">
        <p className="text-xs leading-relaxed text-muted">
          {techPack.disclaimer ||
            "This technical package is a draft communication aid generated by LabelOS. It is not a production-ready specification and must be reviewed and confirmed by a qualified technical designer and manufacturer before sampling or production."}
        </p>
      </footer>
    </article>
  );
}

export default async function TechPackPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Defence in depth — the proxy already gates /app/*, but re-verify here.
  const session = await getSessionFromCookies();
  if (!session.ok) {
    redirect("/login?next=/app/designs");
  }

  const { id } = await params;

  const backToDesign = (
    <Link
      href={UUID_RE.test(id) ? `/app/designs/${id}` : "/app/dashboard"}
      className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink"
    >
      <ArrowLeft aria-hidden className="size-4" />
      Back to design
    </Link>
  );

  let design: DesignRow | null;
  try {
    design = UUID_RE.test(id) ? await getDesign(id) : null;
  } catch (error) {
    if (error instanceof SupabaseNotConfiguredError) {
      return (
        <div className="mx-auto w-full max-w-2xl px-6 py-12">
          <EmptyState
            icon={FileWarning}
            title="Backend not configured"
            description="Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, run the migration, then reload to view the tech pack."
          />
        </div>
      );
    }
    throw error;
  }

  if (!design) {
    return (
      <div className="mx-auto w-full max-w-2xl px-6 py-12">
        <div className="mb-6 no-print">{backToDesign}</div>
        <EmptyState
          icon={FileWarning}
          title="Design not found"
          description="This design may have been removed. Return to the studio to continue."
        />
      </div>
    );
  }

  const parsed = techPackSchema.safeParse(design.tech_pack);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <style>{PRINT_STYLES}</style>

      {/* Toolbar (hidden when printing) */}
      <div className="no-print mb-8 flex flex-wrap items-center justify-between gap-4">
        {backToDesign}
        {parsed.success ? <PrintButton /> : null}
      </div>

      {parsed.success ? (
        <TechPackDocument design={design} techPack={parsed.data} />
      ) : (
        <EmptyState
          icon={FileWarning}
          title="No tech pack yet"
          description="Generate the draft technical package for this design first, then return here to print or save it as a PDF."
        />
      )}
    </div>
  );
}
