import Link from "next/link";
import {
  getAppSettings,
  getProduct,
  listRecentActivity,
  type ActivityLogRow,
  type ProductRow,
} from "@/lib/supabase/repositories";
import { ANALYSIS_TONE, money, toneFor } from "@/lib/ui/tokens";
import { formatDate } from "@/lib/utils";
import {
  AgentTrace,
  Card,
  CardRow,
  Icon,
  PageHeader,
  Pill,
  SetupCard,
  Swatch,
  type AgentTraceEntry,
} from "@/components/lo";
import { isSetupError } from "@/app/app/_lib/server";
import {
  AnalysisPanelBody,
  ReanalyseButton,
} from "../_components/product-drawer";

/**
 * Full product detail (spec 23): a larger fabric swatch, catalog metadata, the
 * same Garment Librarian analysis panel used in the drawer, this product's
 * activity history, and a re-analyse action. Degrades to a setup card when
 * Supabase is unconfigured and to a not-found card when the id is unknown.
 */
export const dynamic = "force-dynamic";

type AnalysisView =
  | "queued"
  | "running"
  | "failed"
  | "needs_review"
  | "complete";

function analysisView(
  product: Pick<ProductRow, "analysis_status" | "status">,
): AnalysisView {
  if (product.analysis_status === "running") return "running";
  if (product.analysis_status === "failed") return "failed";
  if (product.analysis_status === "pending") return "queued";
  return product.status === "reviewed" ? "complete" : "needs_review";
}

interface DetailData {
  configured: boolean;
  product: ProductRow | null;
  currency: string;
  activity: ActivityLogRow[];
}

async function loadDetail(id: string): Promise<DetailData> {
  try {
    const [product, settings, recent] = await Promise.all([
      getProduct(id),
      getAppSettings(),
      listRecentActivity(200),
    ]);
    return {
      configured: true,
      product,
      currency: settings?.currency ?? "SGD",
      activity: recent.filter((row) => row.entity_id === id),
    };
  } catch (error) {
    if (isSetupError(error)) {
      return { configured: false, product: null, currency: "SGD", activity: [] };
    }
    throw error;
  }
}

function toTraceEntry(row: ActivityLogRow): AgentTraceEntry {
  const inTok = Number(row.usage?.inputTokens ?? 0);
  const outTok = Number(row.usage?.outputTokens ?? 0);
  const total = inTok + outTok;
  const meta = [row.provider, row.model].filter(Boolean).join(" · ");
  const tokens =
    total > 0
      ? `${meta ? `${meta} · ` : ""}${total.toLocaleString("en-SG")} tokens`
      : meta || undefined;
  const failed = /fail|error/i.test(row.output_summary) || /fail|error/i.test(row.action);
  return {
    id: row.id,
    actor: row.actor,
    action: row.action,
    detail: row.output_summary || row.input_summary || undefined,
    tokens,
    error: failed,
    time: formatDate(row.created_at),
  };
}

const BackLink = (
  <Link
    href="/app/catalog"
    className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-ink"
  >
    <Icon name="chevron-left" size={16} />
    Back to catalog
  </Link>
);

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadDetail(id);

  if (!data.configured) {
    return (
      <div>
        <PageHeader title="Product" />
        <div className="px-[30px] pt-4 pb-11">
          {BackLink}
          <SetupCard service="Supabase" />
        </div>
      </div>
    );
  }

  if (!data.product) {
    return (
      <div>
        <PageHeader title="Product not found" />
        <div className="px-[30px] pt-4 pb-11">
          {BackLink}
          <Card padding={28} className="text-center">
            <div className="text-[15px] font-[650] text-ink">
              This product could not be found
            </div>
            <div className="mt-1.5 text-[13px] text-muted">
              It may have been removed. Return to the catalog to browse the rest.
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const product = data.product;
  const view = analysisView(product);
  const tone = toneFor(ANALYSIS_TONE, view);
  const hasAnalysis =
    (view === "complete" || view === "needs_review") && !!product.analysis;
  const subtitleParts = [
    product.sku ? `SKU ${product.sku}` : null,
    product.product_type || null,
  ].filter(Boolean);

  return (
    <div>
      <PageHeader
        title={product.title}
        subtitle={subtitleParts.join(" · ") || undefined}
        actions={
          <ReanalyseButton productId={product.id} analysed={hasAnalysis} />
        }
      />

      <div className="px-[30px] pt-4 pb-11">
        {BackLink}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          {/* Swatch + metadata */}
          <div className="flex flex-col gap-4">
            <Swatch
              seed={product.id}
              file={
                product.image_path
                  ? product.image_path.split("/").pop()
                  : undefined
              }
              imageUrl={product.public_image_url ?? undefined}
              running={view === "running"}
              aspect="3/4"
              rounded={16}
            />
            <Card padding="4px 0">
              <div className="px-4 pb-1 pt-3 text-[15px] font-[650] text-ink">
                Details
              </div>
              <CardRow
                label="Price"
                value={money(product.price, data.currency)}
              />
              <CardRow
                label="Stock"
                value={
                  product.inventory_quantity > 0
                    ? `${product.inventory_quantity} in stock`
                    : "Out of stock"
                }
              />
              <CardRow
                label="Source"
                value={
                  <span className="capitalize">{product.source}</span>
                }
              />
              {product.product_type ? (
                <CardRow label="Type" value={product.product_type} />
              ) : null}
              <CardRow
                label="Analysis"
                value={<Pill tone={tone} />}
              />
            </Card>
            {product.description ? (
              <Card padding={16}>
                <div className="text-[13px] leading-relaxed text-ink2">
                  {product.description}
                </div>
              </Card>
            ) : null}
          </div>

          {/* Analysis panel */}
          <Card padding={18}>
            <div className="mb-4 text-[15px] font-[650] text-ink">
              Garment analysis
            </div>
            {hasAnalysis && product.analysis ? (
              <AnalysisPanelBody analysis={product.analysis} />
            ) : (
              <div className="rounded-[12px] border border-[rgba(0,0,0,0.06)] bg-[rgba(120,120,128,0.05)] px-4 py-8 text-center">
                <div className="text-[13.5px] font-semibold text-ink2">
                  {view === "running"
                    ? "Analysis in progress"
                    : view === "failed"
                      ? "The last analysis failed"
                      : "Not analysed yet"}
                </div>
                <div className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted">
                  {view === "running"
                    ? "The Garment Librarian is reading this garment. Refresh in a moment."
                    : view === "failed"
                      ? "Re-upload the image or run the analysis again to enrich this product."
                      : "Run the Garment Librarian to add category, colour, and styling metadata the agents rely on."}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Activity */}
        <Card padding={18} className="mt-5">
          <div className="mb-1 text-[15px] font-[650] text-ink">Activity</div>
          <AgentTrace entries={data.activity.map(toTraceEntry)} />
        </Card>
      </div>
    </div>
  );
}
