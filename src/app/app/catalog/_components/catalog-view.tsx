"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import type { ProductRow } from "@/lib/supabase/repositories";
import { money } from "@/lib/ui/tokens";
import {
  Button,
  ConfirmModal,
  EmptyState,
  Icon,
  PageHeader,
  ProductCard,
  type ProductSummary,
} from "@/components/lo";
import { apiRequest, errorMessage } from "@/app/app/_lib/api-client";
import { cn } from "@/lib/utils";
import {
  ProductDrawer,
  deriveAnalysisView,
  fileLabel,
  type AnalysisView,
} from "./product-drawer";

/**
 * Interactive catalog: the frosted header (Import + Add product), filter tabs
 * with counts, the 4-up product grid, "Analyse all", the product detail drawer,
 * and the upload dialog. All data comes from the server page; every mutation
 * unwraps the ApiResult envelope, toasts the result, and refreshes the route.
 */

type FilterKey = "all" | AnalysisView;

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "queued", label: "Needs analysis" },
  { key: "running", label: "Analysing" },
  { key: "needs_review", label: "Needs review" },
  { key: "complete", label: "Completed" },
  { key: "failed", label: "Failed" },
];

/** Ids the batch route should target — capped to the request-body maximum. */
const BATCH_CAP = 200;

export interface CatalogViewProps {
  products: ProductRow[];
  currency: string;
  demoMode: boolean;
  shopifyLive: boolean;
}

export function CatalogView({
  products,
  currency,
  shopifyLive,
}: CatalogViewProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [analyseAllOpen, setAnalyseAllOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [analysingAll, setAnalysingAll] = useState(false);

  // Derive the display status once per product.
  const views = useMemo(() => {
    const map = new Map<string, AnalysisView>();
    for (const product of products) map.set(product.id, deriveAnalysisView(product));
    return map;
  }, [products]);

  const counts = useMemo(() => {
    const base: Record<AnalysisView, number> = {
      queued: 0,
      running: 0,
      failed: 0,
      needs_review: 0,
      complete: 0,
    };
    for (const view of views.values()) base[view] += 1;
    return base;
  }, [views]);

  const needAttention = counts.queued + counts.needs_review + counts.failed;
  const subtitle = `${products.length} product${products.length === 1 ? "" : "s"} · ${counts.complete} completed · ${needAttention} need attention`;

  const filtered = useMemo(
    () =>
      filter === "all"
        ? products
        : products.filter((p) => views.get(p.id) === filter),
    [products, views, filter],
  );

  const pendingIds = useMemo(
    () =>
      products
        .filter((p) => {
          const view = views.get(p.id);
          return view === "queued" || view === "failed";
        })
        .map((p) => p.id)
        .slice(0, BATCH_CAP),
    [products, views],
  );

  const selected = selectedId
    ? products.find((p) => p.id === selectedId) ?? null
    : null;

  const importLabel = shopifyLive ? "Import from Shopify" : "Import demo catalog";

  function summary(product: ProductRow): ProductSummary {
    return {
      id: product.id,
      title: product.title,
      type: product.product_type || product.analysis?.category || "Garment",
      price: money(product.price, currency),
      stock:
        product.inventory_quantity > 0
          ? `${product.inventory_quantity} in stock`
          : "Out of stock",
      analysisStatus: views.get(product.id) ?? "queued",
      imageUrl: product.public_image_url ?? undefined,
      file: fileLabel(product),
    };
  }

  async function runImport() {
    setImporting(true);
    try {
      const result = await apiRequest<{
        imported: number;
        updated: number;
        skipped: number;
      }>("/api/shopify/import", { method: "POST" });
      const parts = [
        `${result.imported} imported`,
        `${result.updated} updated`,
      ];
      if (result.skipped) parts.push(`${result.skipped} skipped`);
      toast.success(`Catalog import complete — ${parts.join(", ")}.`);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setImporting(false);
    }
  }

  async function runAnalyseAll() {
    setAnalysingAll(true);
    try {
      const result = await apiRequest<{
        summary: {
          succeeded: number;
          failed: number;
          skipped: number;
          limitReached: boolean;
        };
      }>("/api/products/analyse-batch", {
        method: "POST",
        body: { productIds: pendingIds },
      });
      const s = result.summary;
      let message = `${s.succeeded} product${s.succeeded === 1 ? "" : "s"} analysed`;
      if (s.failed) message += `, ${s.failed} failed`;
      if (s.limitReached) {
        message += " — per-run limit reached, run again to continue";
      }
      if (s.succeeded > 0) toast.success(message);
      else toast.error(s.failed ? message : "No products were analysed.");
      setAnalyseAllOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setAnalysingAll(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Catalog"
        subtitle={subtitle}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              loading={importing}
              onClick={runImport}
            >
              {importLabel}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setUploadOpen(true)}
            >
              <Icon name="plus" size={16} strokeWidth={2.2} />
              Add product
            </Button>
          </>
        }
      />

      <div className="px-[30px] pt-4 pb-11">
        {/* Filter tabs + Analyse all */}
        <div className="mb-[18px] flex items-start gap-3">
          <div className="flex flex-1 flex-wrap gap-[7px]">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              const count =
                f.key === "all" ? products.length : counts[f.key];
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-[13px] py-1.5 text-[12.5px] transition",
                    active
                      ? "bg-accent font-semibold text-white"
                      : "border border-[rgba(0,0,0,0.1)] bg-surface font-medium text-ink2 hover:bg-[#FAFAFA]",
                  )}
                >
                  {f.label}
                  <span className="text-[11px] opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={pendingIds.length === 0}
            title={
              pendingIds.length === 0
                ? "Nothing to analyse"
                : `Analyse ${pendingIds.length} product(s)`
            }
            onClick={() => setAnalyseAllOpen(true)}
          >
            <Icon name="refresh-cw" size={15} />
            Analyse all
          </Button>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon="tag"
            title="Nothing here yet"
            description={
              products.length === 0
                ? "Import the demo catalog or add a product to get started."
                : "No products match this filter."
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {filtered.map((product) => (
              <ProductCard
                key={product.id}
                product={summary(product)}
                onOpen={setSelectedId}
              />
            ))}
          </div>
        )}
      </div>

      <ProductDrawer
        product={selected}
        currency={currency}
        open={selectedId !== null}
        onClose={() => setSelectedId(null)}
        onChanged={() => router.refresh()}
      />

      <ConfirmModal
        open={analyseAllOpen}
        onClose={() => setAnalyseAllOpen(false)}
        tone="warning"
        title={`Analyse ${pendingIds.length} product${pendingIds.length === 1 ? "" : "s"}?`}
        body={
          <>
            This runs the Garment Librarian on each product that still needs
            analysis or previously failed. It calls the Claude API and may incur
            usage costs. Analyses run one at a time and are capped per run.
          </>
        }
        confirmLabel={`Analyse ${pendingIds.length}`}
        loading={analysingAll}
        onConfirm={runAnalyseAll}
      />

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onCreated={() => {
          setUploadOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// UploadDialog — sign → PUT → create product
// ---------------------------------------------------------------------------

const uploadSchema = z.object({
  title: z.string().min(1, "Enter a product title.").max(300),
  sku: z.string().max(120),
  productType: z.string().max(120),
  price: z.number({ error: "Enter a price." }).nonnegative("Price can’t be negative."),
  stock: z
    .number({ error: "Enter a stock quantity." })
    .int("Stock must be a whole number.")
    .nonnegative("Stock can’t be negative."),
  description: z.string().max(5000),
});
type UploadValues = z.infer<typeof uploadSchema>;

interface SignedUpload {
  path: string;
  signedUrl: string;
  token: string;
}

function UploadDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UploadValues>({
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      title: "",
      sku: "",
      productType: "",
      price: 0,
      stock: 0,
      description: "",
    },
  });

  // Reset the form and file whenever the dialog closes.
  useEffect(() => {
    if (!open) {
      reset();
      setFile(null);
    }
  }, [open, reset]);

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const onSubmit = handleSubmit(async (values) => {
    if (file && !file.type.startsWith("image/")) {
      toast.error("Choose a JPEG, PNG, GIF, or WebP image.");
      return;
    }
    setSubmitting(true);
    try {
      let imagePath: string | null = null;

      if (file) {
        const signed = await apiRequest<SignedUpload>("/api/uploads/sign", {
          method: "POST",
          body: {
            filename: file.name,
            contentType: file.type || "application/octet-stream",
            sizeBytes: file.size,
          },
        });

        const put = await fetch(signed.signedUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        });
        if (!put.ok) {
          throw new Error(
            `The image upload failed (HTTP ${put.status}). Try a smaller JPEG or PNG.`,
          );
        }
        imagePath = signed.path;
      }

      await apiRequest("/api/products", {
        method: "POST",
        body: {
          title: values.title,
          sku: values.sku,
          productType: values.productType,
          price: values.price,
          inventoryQuantity: values.stock,
          description: values.description,
          imagePath,
        },
      });

      toast.success("Product added. Analyse it to enrich its attributes.");
      onCreated();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <>
      <div
        className="fixed inset-0 z-[60] animate-[lo-fade_0.18s_ease] bg-black/[0.34]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add product"
        className="fixed left-1/2 top-1/2 z-[61] w-[480px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 animate-[lo-toast_0.24s_ease] rounded-[18px] bg-surface p-[26px] shadow-modal"
      >
        <div className="text-[19px] font-bold tracking-[-0.01em] text-ink">
          Add product
        </div>
        <div className="mt-1 text-[13px] leading-relaxed text-ink3">
          Add a garment to your catalog. Include an image so the Garment
          Librarian can read its colour and material after it&rsquo;s added.
        </div>

        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3.5">
          <Field label="Title" error={errors.title?.message}>
            <input
              {...register("title")}
              autoFocus
              placeholder="Wide-Leg Linen Trousers"
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3.5">
            <Field label="SKU" error={errors.sku?.message}>
              <input
                {...register("sku")}
                placeholder="MA-BOT-001"
                className={inputCls}
              />
            </Field>
            <Field label="Type" error={errors.productType?.message}>
              <input
                {...register("productType")}
                placeholder="Trousers"
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Price (SGD)" error={errors.price?.message}>
              <input
                {...register("price", { valueAsNumber: true })}
                type="number"
                min={0}
                step="1"
                placeholder="119"
                className={inputCls}
              />
            </Field>
            <Field label="Stock" error={errors.stock?.message}>
              <input
                {...register("stock", { valueAsNumber: true })}
                type="number"
                min={0}
                step="1"
                placeholder="24"
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Description" error={errors.description?.message}>
            <textarea
              {...register("description")}
              rows={3}
              placeholder="A short garment description…"
              className={cn(inputCls, "h-auto resize-none py-2")}
            />
          </Field>

          <Field label="Image (optional)">
            <input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-[12.5px] text-ink3 file:mr-3 file:rounded-[8px] file:border file:border-[rgba(0,0,0,0.12)] file:bg-surface file:px-3 file:py-1.5 file:text-[12.5px] file:font-semibold file:text-ink hover:file:bg-[#FAFAFA]"
            />
          </Field>

          <div className="mt-2 flex gap-2.5">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="flex-1"
              loading={submitting}
            >
              Add product
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}

const inputCls =
  "h-10 w-full rounded-[10px] border border-[rgba(0,0,0,0.12)] bg-surface px-3 text-[13.5px] text-ink placeholder:text-faint outline-none focus:border-accent";

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-ink2">{label}</span>
      {children}
      {error ? (
        <span className="text-[11.5px] text-[#C4271B]">{error}</span>
      ) : null}
    </label>
  );
}
