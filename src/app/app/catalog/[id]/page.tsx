import Link from "next/link";
import { ArrowLeft, Package } from "lucide-react";
import {
  getAppSettings,
  getProduct,
  listRecentActivity,
  type ActivityLogRow,
  type ProductRow,
} from "@/lib/supabase/repositories";
import { formatCurrency } from "@/lib/utils";
import { AgentTrace } from "@/components/agent-trace";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isSetupError } from "@/app/app/_lib/server";
import { toAgentTraceEntry } from "@/app/app/_lib/mappers";
import { PageHeader } from "@/app/app/_components/page-header";
import { SetupCard } from "@/app/app/_components/setup-card";
import { AnalysisPanel } from "@/app/app/_components/analysis-panel";
import { AnalyseButton } from "@/app/app/_components/analyse-button";

/**
 * Full product detail page (spec 23): image, metadata, the analysis panel,
 * this product's activity history, and a re-analyse action.
 */
export const dynamic = "force-dynamic";

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

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadDetail(id);

  const backLink = (
    <Link
      href="/app/catalog"
      className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
    >
      <ArrowLeft aria-hidden className="size-4" />
      Back to catalog
    </Link>
  );

  if (!data.configured) {
    return (
      <div className="flex flex-col gap-6">
        {backLink}
        <SetupCard />
      </div>
    );
  }

  if (!data.product) {
    return (
      <div className="flex flex-col gap-6">
        {backLink}
        <Card className="px-6 py-12 text-center">
          <h1 className="font-display text-xl text-ink">Product not found</h1>
          <p className="mt-2 text-sm text-muted">
            This product may have been removed. Return to the catalog to browse
            the rest.
          </p>
        </Card>
      </div>
    );
  }

  const product = data.product;
  const analysed = product.analysis_status === "complete" && product.analysis;

  return (
    <div className="flex flex-col gap-8">
      {backLink}
      <PageHeader
        eyebrow="Product"
        title={product.title}
        description={product.sku ? `SKU ${product.sku}` : undefined}
        actions={
          <AnalyseButton
            productId={product.id}
            label={analysed ? "Re-analyse" : "Analyse"}
          />
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col gap-4">
            {product.public_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.public_image_url}
                alt={product.title}
                className="aspect-square w-full border border-line object-cover"
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center border border-line bg-paper text-line">
                <Package aria-hidden className="size-10" />
              </div>
            )}
            <dl className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <dt className="text-sm text-muted">Price</dt>
                <dd className="font-medium text-ink">
                  {formatCurrency(product.price, data.currency)}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-sm text-muted">Stock</dt>
                <dd className="text-sm text-ink">
                  {product.inventory_quantity > 0
                    ? `${product.inventory_quantity} in stock`
                    : "Out of stock"}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-sm text-muted">Source</dt>
                <dd className="text-sm capitalize text-ink">{product.source}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-sm text-muted">Analysis</dt>
                <dd>
                  <StatusBadge kind="analysis" status={product.analysis_status} />
                </dd>
              </div>
              {product.product_type ? (
                <div className="flex items-center justify-between">
                  <dt className="text-sm text-muted">Type</dt>
                  <dd>
                    <Badge variant="neutral">{product.product_type}</Badge>
                  </dd>
                </div>
              ) : null}
            </dl>
            {product.description ? (
              <p className="border-t border-line pt-4 text-sm leading-relaxed text-muted">
                {product.description}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Garment analysis</CardTitle>
          </CardHeader>
          <CardContent>
            {analysed && product.analysis ? (
              <AnalysisPanel analysis={product.analysis} />
            ) : (
              <p className="text-sm leading-relaxed text-muted">
                {product.analysis_status === "failed"
                  ? "The last analysis failed. Run it again to enrich this product."
                  : "This product hasn't been analysed yet. Run the Garment Librarian to add category, colours, and styling metadata."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <AgentTrace entries={data.activity.map(toAgentTraceEntry)} />
        </CardContent>
      </Card>
    </div>
  );
}
