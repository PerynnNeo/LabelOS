"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutGrid,
  List,
  Upload,
  Store,
  ScanLine,
  PackageSearch,
} from "lucide-react";
import { toast } from "sonner";
import type { ProductRow } from "@/lib/supabase/repositories";
import {
  analysisStatusSchema,
  garmentCategorySchema,
  type AnalysisStatus,
} from "@/lib/domain/schemas";
import { normalizeCategory } from "@/lib/domain/category-normalizer";
import { ProductCard } from "@/components/product-card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { apiRequest, errorMessage } from "@/app/app/_lib/api-client";
import { toProductCard } from "@/app/app/_lib/mappers";
import { UploadProductDialog } from "@/app/app/_components/upload-product-dialog";
import { ProductDrawer } from "@/app/app/_components/product-drawer";
import { SeedButton } from "@/app/app/_components/seed-button";

type StockFilter = "all" | "in" | "out";
type StatusFilter = "all" | AnalysisStatus;

interface BatchSummary {
  requested: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  limitReached: boolean;
  note?: string;
}

export function CatalogView({
  products,
  currency,
  demoMode,
  shopifyLive,
}: {
  products: ProductRow[];
  currency: string;
  demoMode: boolean;
  shopifyLive: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [category, setCategory] = useState<string>("all");
  const [stock, setStock] = useState<StockFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [analysingId, setAnalysingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);

  const filtered = useMemo(() => {
    return products.filter((product) => {
      if (category !== "all") {
        const resolved = normalizeCategory({
          productType: product.product_type,
          analysisCategory: product.analysis?.category ?? null,
        });
        if (resolved !== category) return false;
      }
      if (stock === "in" && product.inventory_quantity <= 0) return false;
      if (stock === "out" && product.inventory_quantity > 0) return false;
      if (statusFilter !== "all" && product.analysis_status !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [products, category, stock, statusFilter]);

  const analysableIds = useMemo(
    () =>
      filtered
        .filter((p) => p.analysis_status !== "complete")
        .map((p) => p.id),
    [filtered],
  );

  const drawerProduct = drawerId
    ? products.find((p) => p.id === drawerId) ?? null
    : null;

  async function analyseOne(product: ProductRow) {
    if (analysingId) return;
    setAnalysingId(product.id);
    try {
      const result = await apiRequest<{ reused: boolean }>(
        `/api/products/${product.id}/analyse`,
        { method: "POST" },
      );
      toast.success(
        result.reused
          ? "Loaded the existing analysis."
          : `Analysed "${product.title}".`,
      );
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setAnalysingId(null);
    }
  }

  async function importFromShopify() {
    if (importing) return;
    setImporting(true);
    try {
      const result = await apiRequest<{
        imported: number;
        updated: number;
        skipped: number;
      }>("/api/shopify/import", { method: "POST" });
      toast.success(
        `Imported ${result.imported} new, updated ${result.updated}${
          result.skipped ? `, skipped ${result.skipped}` : ""
        }.`,
      );
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setImporting(false);
    }
  }

  async function runBatchAnalyse() {
    if (batchRunning || analysableIds.length === 0) return;
    setBatchRunning(true);
    try {
      const { summary } = await apiRequest<{ summary: BatchSummary }>(
        "/api/products/analyse-batch",
        { method: "POST", body: { productIds: analysableIds } },
      );
      toast.success(
        `Analysed ${summary.succeeded} of ${summary.processed}` +
          (summary.failed ? `, ${summary.failed} failed` : "") +
          (summary.limitReached ? ` (per-run limit reached)` : "") +
          ".",
      );
      if (summary.note) toast.message(summary.note);
      setBatchOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBatchRunning(false);
    }
  }

  const importButton = (
    <Button
      variant="secondary"
      onClick={importFromShopify}
      loading={importing}
    >
      <Store aria-hidden className="size-4" />
      Import from Shopify
      {!shopifyLive ? (
        <span className="text-xs font-normal text-muted">(mock)</span>
      ) : null}
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Filter by category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            wrapperClassName="w-40"
          >
            <option value="all">All categories</option>
            {garmentCategorySchema.options.map((c) => (
              <option key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filter by stock"
            value={stock}
            onChange={(e) => setStock(e.target.value as StockFilter)}
            wrapperClassName="w-36"
          >
            <option value="all">Any stock</option>
            <option value="in">In stock</option>
            <option value="out">Out of stock</option>
          </Select>
          <Select
            aria-label="Filter by analysis status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            wrapperClassName="w-40"
          >
            <option value="all">Any analysis</option>
            {analysisStatusSchema.options.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex border border-line" role="group" aria-label="View mode">
            <button
              type="button"
              onClick={() => setView("grid")}
              aria-pressed={view === "grid"}
              aria-label="Grid view"
              className={cn(
                "inline-flex size-9 items-center justify-center transition-colors",
                view === "grid"
                  ? "bg-ink text-paper"
                  : "text-muted hover:text-ink",
              )}
            >
              <LayoutGrid aria-hidden className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              aria-pressed={view === "list"}
              aria-label="List view"
              className={cn(
                "inline-flex size-9 items-center justify-center border-l border-line transition-colors",
                view === "list"
                  ? "bg-ink text-paper"
                  : "text-muted hover:text-ink",
              )}
            >
              <List aria-hidden className="size-4" />
            </button>
          </div>
          {importButton}
          <Button
            variant="secondary"
            onClick={() => setBatchOpen(true)}
            disabled={analysableIds.length === 0}
          >
            <ScanLine aria-hidden className="size-4" />
            Analyse all ({analysableIds.length})
          </Button>
          <Button onClick={() => setUploadOpen(true)}>
            <Upload aria-hidden className="size-4" />
            Upload product
          </Button>
        </div>
      </div>

      {/* Content */}
      {products.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="Your catalog is empty"
          description="Upload a garment, import from Shopify, or load the demo dataset to begin."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button size="sm" onClick={() => setUploadOpen(true)}>
                Upload product
              </Button>
              {demoMode ? <SeedButton variant="secondary" size="sm" /> : null}
            </div>
          }
        />
      ) : filtered.length === 0 ? (
        <Card className="px-6 py-12 text-center text-sm text-muted">
          No products match these filters.
        </Card>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((product) => (
            <div key={product.id} className="flex flex-col gap-2">
              <ProductCard
                product={toProductCard(product, currency)}
                variant="grid"
                onClick={() => setDrawerId(product.id)}
              />
              <Button
                size="sm"
                variant="ghost"
                className="self-start"
                loading={analysingId === product.id}
                onClick={() => analyseOne(product)}
              >
                <ScanLine aria-hidden className="size-4" />
                {product.analysis_status === "complete"
                  ? "Re-analyse"
                  : "Analyse"}
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((product) => (
            <div key={product.id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <ProductCard
                  product={toProductCard(product, currency)}
                  variant="list"
                  onClick={() => setDrawerId(product.id)}
                />
              </div>
              <Button
                size="sm"
                variant="ghost"
                loading={analysingId === product.id}
                onClick={() => analyseOne(product)}
              >
                <ScanLine aria-hidden className="size-4" />
                {product.analysis_status === "complete" ? "Re-analyse" : "Analyse"}
              </Button>
            </div>
          ))}
        </div>
      )}

      <UploadProductDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onCreated={() => router.refresh()}
      />

      <ProductDrawer
        product={drawerProduct}
        currency={currency}
        open={drawerId !== null}
        onClose={() => setDrawerId(null)}
        onChanged={() => router.refresh()}
      />

      <Dialog
        open={batchOpen}
        onClose={() => (batchRunning ? undefined : setBatchOpen(false))}
        title="Analyse all filtered products"
        description="Each analysis is one Claude vision call and consumes tokens. Products already analysed are skipped."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setBatchOpen(false)}
              disabled={batchRunning}
            >
              Cancel
            </Button>
            <Button onClick={runBatchAnalyse} loading={batchRunning}>
              Analyse {analysableIds.length} product
              {analysableIds.length === 1 ? "" : "s"}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-muted">
          This will run the Garment Librarian over{" "}
          <span className="font-medium text-ink">{analysableIds.length}</span>{" "}
          un-analysed product{analysableIds.length === 1 ? "" : "s"} one at a
          time. Runs are capped per request; if the cap is reached, run it again
          to continue.
        </p>
      </Dialog>
    </div>
  );
}
