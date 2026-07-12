import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Check } from "lucide-react";
import { getSessionFromCookies } from "@/lib/auth/require-session";
import { SupabaseNotConfiguredError } from "@/lib/supabase/admin";
import { getDesign, type DesignRow } from "@/lib/supabase/repositories";
import {
  techPackSchema,
  TECH_PACK_DRAFT_STATUS,
  type TechPack,
} from "@/lib/domain/schemas";
import { EmptyState, SetupCard } from "@/components/lo";
import { formatDate } from "@/lib/utils";
import { PrintButton } from "./print-button";

/**
 * Tech-pack PRINT view.
 *
 * Session-protected server component that renders a design's DRAFT tech pack as
 * a print-optimised HTML document (no PDF library). Print styling is inlined in
 * a <style> block: the authenticated app chrome (sidebar + top bar) and the
 * toolbar are hidden with @media print, leaving only the document, which the
 * owner prints or saves as a PDF via the browser's own dialog.
 *
 * Reads the design directly from the service-role repository layer → Node.
 */
export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Print + screen styles for the document. Scoped under #techpack-print. */
const PRINT_STYLES = `
  @media print {
    @page { margin: 14mm; }
    html, body { background: #ffffff !important; }
    .no-print { display: none !important; }
    /* Remove the authenticated app chrome (sidebar / nav / sticky top bar).
       The tech-pack document below uses no <aside>/<nav>/<header> of its own. */
    aside, nav, header { display: none !important; }
    #techpack-print { border: 0 !important; box-shadow: none !important; padding: 0 !important; }
    #techpack-print table { page-break-inside: auto; }
    #techpack-print tr { page-break-inside: avoid; }
    #techpack-print thead { display: table-header-group; }
    #techpack-print h2, #techpack-print h3 { break-after: avoid; }
    .tp-tint { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
        {label}
      </span>
      <span className="text-[13.5px] font-semibold text-ink">{value}</span>
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
    <section className="flex flex-col gap-2.5">
      <h3 className="text-[13px] font-bold uppercase tracking-[0.04em] text-ink3">
        {title}
      </h3>
      {items.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {items.map((item, index) => (
            <li key={index} className="flex items-start gap-2.5">
              <span
                aria-hidden
                className="mt-[7px] size-[5px] flex-none rounded-full bg-[#C7C7CC]"
              />
              <span className="text-[12.5px] leading-[1.45] text-ink2">
                {item}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-muted">{empty}</p>
      )}
    </section>
  );
}

function BomTable({ rows }: { rows: TechPack["billOfMaterials"] }) {
  if (rows.length === 0) {
    return <p className="text-[12.5px] text-muted">No bill of materials recorded.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-ink text-left">
            <th className="py-2 pr-4 font-semibold text-ink">Item</th>
            <th className="py-2 pr-4 font-semibold text-ink">Placement</th>
            <th className="py-2 pr-4 font-semibold text-ink">Composition</th>
            <th className="py-2 pr-4 font-semibold text-ink">Supplier ref.</th>
            <th className="py-2 font-semibold text-ink">Verified</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-line align-top">
              <td className="py-2 pr-4 text-ink">{row.item}</td>
              <td className="py-2 pr-4 text-ink2">{row.placement}</td>
              <td className="py-2 pr-4 text-ink2">{row.composition}</td>
              <td className="py-2 pr-4 font-mono text-[11.5px] text-muted">
                {row.supplierReference || "—"}
              </td>
              <td className="py-2">
                {row.verified ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-[#248A3D]">
                    <Check aria-hidden className="size-3.5" strokeWidth={2.6} />
                    Verified
                  </span>
                ) : (
                  <span className="font-semibold text-[#B25000]">Unverified</span>
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
      <p className="text-[12.5px] text-muted">
        No measurement points recorded. All values TBD pending a technical
        designer.
      </p>
    );
  }
  const columns = sizeRange.length > 0 ? sizeRange : ["Spec"];
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-ink text-left">
            <th className="py-2 pr-4 font-semibold text-ink">Point of measure</th>
            {columns.map((size) => (
              <th key={size} className="py-2 pr-4 font-semibold text-ink">
                {size}
              </th>
            ))}
            <th className="py-2 font-semibold text-ink">Tol. (cm)</th>
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
                        : "py-2 pr-4 font-mono tabular-nums text-ink"
                    }
                  >
                    {isTbd ? "TBD" : value}
                  </td>
                );
              })}
              <td className="py-2 font-mono tabular-nums text-muted">
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
      className="lo-card mx-auto w-full max-w-4xl px-7 py-8 md:px-10 md:py-10 print:max-w-none"
    >
      {/* Header */}
      <div className="flex flex-col gap-6 border-b border-line pb-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
              Technical package — Draft
            </span>
            <h1 className="font-display text-[30px] leading-tight text-ink">
              {techPack.garmentName}
            </h1>
          </div>
          <div className="text-right text-[12.5px] text-muted">
            Generated {formatDate(design.updated_at)}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field
            label="Style code"
            value={<span className="font-mono">{techPack.styleCode}</span>}
          />
          <Field label="Version" value={`v${techPack.version}`} />
          <Field
            label="Size range"
            value={techPack.sizeRange.join(", ") || "TBD"}
          />
          <Field label="Status" value="Draft" />
        </div>
      </div>

      {/* Draft warning banner */}
      {isDraft ? (
        <div className="tp-tint mt-8 flex items-start gap-3 rounded-[12px] border border-[rgba(255,149,0,0.28)] bg-[rgba(255,149,0,0.1)] px-4 py-3.5">
          <AlertTriangle
            aria-hidden
            className="mt-0.5 size-[18px] shrink-0 text-[#B25000]"
            strokeWidth={1.9}
          />
          <div className="flex flex-col gap-1">
            <p className="font-mono text-[12px] font-semibold text-[#7A4A00]">
              {TECH_PACK_DRAFT_STATUS}
            </p>
            <p className="text-[12.5px] leading-[1.5] text-[#7A4A00]">
              This is a draft outline for review by a qualified technical
              designer and manufacturer. It is not production-authorised —
              measurements, tolerances, materials, and care claims must be
              verified before sampling.
            </p>
          </div>
        </div>
      ) : null}

      {/* Front & back details */}
      <div className="mt-9 grid gap-8 sm:grid-cols-2">
        <DetailList title="Front details" items={techPack.frontDetails} />
        <DetailList title="Back details" items={techPack.backDetails} />
      </div>

      {/* Construction */}
      <div className="mt-9">
        <DetailList
          title="Construction notes"
          items={techPack.constructionNotes}
        />
      </div>

      {/* Bill of materials */}
      <section className="mt-9 flex flex-col gap-3">
        <h2 className="font-display text-[20px] leading-tight text-ink">
          Bill of materials
        </h2>
        <BomTable rows={techPack.billOfMaterials} />
      </section>

      {/* Trims */}
      <div className="mt-9">
        <DetailList title="Trims" items={techPack.trims} />
      </div>

      {/* Measurements */}
      <section className="mt-9 flex flex-col gap-3">
        <h2 className="font-display text-[20px] leading-tight text-ink">
          Measurement table
        </h2>
        <p className="text-[12.5px] text-muted">
          Cells marked TBD require confirmation by a technical designer.
        </p>
        <MeasurementTable techPack={techPack} />
      </section>

      {/* Artwork, labelling, packaging, quality */}
      <div className="mt-9 grid gap-8 sm:grid-cols-2">
        <DetailList
          title="Artwork placement"
          items={techPack.artworkPlacement}
        />
        <DetailList title="Labelling" items={techPack.labelling} />
      </div>
      <div className="mt-9 grid gap-8 sm:grid-cols-2">
        <DetailList title="Packaging" items={techPack.packaging} />
        <DetailList title="Quality checklist" items={techPack.qualityChecks} />
      </div>

      {/* Questions & assumptions */}
      <div className="mt-9 grid gap-8 sm:grid-cols-2">
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
      <div className="mt-11 border-t border-line pt-6">
        <p className="text-[11.5px] leading-[1.55] text-muted">
          {techPack.disclaimer ||
            "This technical package is a draft communication aid generated by LabelOS. It is not a production-ready specification and must be reviewed and confirmed by a qualified technical designer and manufacturer before sampling or production."}
        </p>
      </div>
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
    redirect("/login?next=/app/dashboard");
  }

  const { id } = await params;

  const backToDesign = (
    <Link
      href={UUID_RE.test(id) ? `/app/designs/${id}` : "/app/dashboard"}
      className="inline-flex items-center gap-2 text-[13px] text-muted transition-colors hover:text-ink"
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
        <div className="mx-auto w-full max-w-2xl">
          <SetupCard
            service="Supabase"
            message="Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, run the migration, then reload to view the tech pack."
          />
        </div>
      );
    }
    throw error;
  }

  if (!design) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <div className="no-print mb-6">{backToDesign}</div>
        <EmptyState
          icon="alert-triangle"
          title="Design not found"
          description="This design may have been removed. Return to the studio to continue."
        />
      </div>
    );
  }

  const parsed = techPackSchema.safeParse(design.tech_pack);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <style>{PRINT_STYLES}</style>

      {/* Toolbar (hidden when printing) */}
      <div className="no-print mb-7 flex flex-wrap items-center justify-between gap-4">
        {backToDesign}
        {parsed.success ? <PrintButton /> : null}
      </div>

      {parsed.success ? (
        <TechPackDocument design={design} techPack={parsed.data} />
      ) : (
        <EmptyState
          icon="alert-triangle"
          title="No tech pack yet"
          description="Generate the draft technical package for this design first, then return here to print or save it as a PDF."
        />
      )}
    </div>
  );
}
