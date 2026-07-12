"use client";

import { useState } from "react";
import Link from "next/link";
import { ScanLine, Package } from "lucide-react";
import { toast } from "sonner";
import type { ProductRow } from "@/lib/supabase/repositories";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { formatCurrency } from "@/lib/utils";
import { apiRequest, errorMessage } from "@/app/app/_lib/api-client";
import { AnalysisPanel } from "@/app/app/_components/analysis-panel";

/**
 * Product detail drawer: image, metadata, and the garment analysis rendered as
 * an editorial panel. Offers an Analyse / Re-analyse action that runs the
 * Garment Librarian and refreshes the catalog on completion.
 */
export function ProductDrawer({
  product,
  currency,
  open,
  onClose,
  onChanged,
}: {
  product: ProductRow | null;
  currency: string;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [analysing, setAnalysing] = useState(false);

  async function handleAnalyse() {
    if (!product || analysing) return;
    setAnalysing(true);
    try {
      const result = await apiRequest<{ reused: boolean }>(
        `/api/products/${product.id}/analyse`,
        { method: "POST" },
      );
      toast.success(
        result.reused
          ? "Loaded the existing analysis for this product."
          : `Analysed "${product.title}".`,
      );
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setAnalysing(false);
    }
  }

  if (!product) return null;

  const analysed = product.analysis_status === "complete" && product.analysis;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={product.title}
      className="max-w-2xl"
      footer={
        <>
          <Link href={`/app/catalog/${product.id}`}>
            <Button variant="ghost">Open full page</Button>
          </Link>
          <Button onClick={handleAnalyse} loading={analysing}>
            <ScanLine aria-hidden className="size-4" />
            {analysed ? "Re-analyse" : "Analyse"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex gap-4">
          {product.public_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.public_image_url}
              alt={product.title}
              className="size-28 shrink-0 border border-line object-cover"
            />
          ) : (
            <div className="flex size-28 shrink-0 items-center justify-center border border-line bg-paper text-line">
              <Package aria-hidden className="size-8" />
            </div>
          )}
          <div className="flex min-w-0 flex-col gap-1.5">
            {product.sku ? (
              <span className="font-mono text-xs text-muted">{product.sku}</span>
            ) : null}
            <span className="font-medium text-ink">
              {formatCurrency(product.price, currency)}
            </span>
            <span className="text-sm text-muted">
              {product.inventory_quantity > 0
                ? `${product.inventory_quantity} in stock`
                : "Out of stock"}
            </span>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <StatusBadge kind="analysis" status={product.analysis_status} />
              <span className="text-xs capitalize text-muted">
                {product.source}
              </span>
            </div>
          </div>
        </div>

        {product.description ? (
          <p className="text-sm leading-relaxed text-muted">
            {product.description}
          </p>
        ) : null}

        {analysed && product.analysis ? (
          <div className="border-t border-line pt-5">
            <AnalysisPanel analysis={product.analysis} />
          </div>
        ) : (
          <div className="border-t border-line pt-5 text-sm leading-relaxed text-muted">
            {product.analysis_status === "failed"
              ? "The last analysis failed. Try running it again."
              : "This product hasn't been analysed yet. Run the Garment Librarian to enrich it with category, colours, and styling metadata."}
          </div>
        )}
      </div>
    </Dialog>
  );
}
