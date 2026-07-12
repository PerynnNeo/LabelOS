"use client";

import { ANALYSIS_TONE, toneFor } from "@/lib/ui/tokens";
import { cn } from "@/lib/utils";
import { Pill } from "./pill";
import { Swatch } from "./swatch";

/**
 * Catalog grid card. Purely presentational — it does not fetch; the screen maps
 * a product row to this plain summary and handles `onOpen` (drawer / route).
 */
export interface ProductSummary {
  id: string;
  title: string;
  /** Garment type, e.g. "Outerwear". */
  type: string;
  /** Pre-formatted price string, e.g. "S$189". */
  price: string;
  /** Pre-formatted stock string, e.g. "42 in stock". */
  stock: string;
  /** products.analysis_status — keyed into ANALYSIS_TONE. */
  analysisStatus: string;
  imageUrl?: string;
  /** Mono file-name chip for the swatch. */
  file?: string;
}

export interface ProductCardProps {
  product: ProductSummary;
  onOpen?: (id: string) => void;
  className?: string;
}

export function ProductCard({ product, onOpen, className }: ProductCardProps) {
  const running = product.analysisStatus === "running";
  const tone = toneFor(ANALYSIS_TONE, product.analysisStatus);
  return (
    <button
      type="button"
      onClick={() => onOpen?.(product.id)}
      className={cn(
        "group block rounded-[15px] border border-[rgba(0,0,0,0.07)] bg-surface p-[9px] text-left transition duration-150 hover:-translate-y-0.5 hover:shadow-raise",
        className,
      )}
    >
      <Swatch
        seed={product.id || product.title}
        file={product.file}
        imageUrl={product.imageUrl}
        running={running}
        aspect="4/5"
      />
      <div className="px-1.5 pt-[11px] pb-[5px]">
        <div className="truncate text-[13.5px] font-semibold tracking-[-0.01em] text-ink">
          {product.title}
        </div>
        <div className="mt-0.5 text-[12px] text-muted">
          {product.type} · {product.price}
        </div>
        <div className="mt-[11px] flex items-center justify-between gap-2">
          <span className="text-[11.5px] text-muted">{product.stock}</span>
          <Pill tone={tone} dot pulse={running} />
        </div>
      </div>
    </button>
  );
}
