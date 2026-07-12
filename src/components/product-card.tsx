import {
  Footprints,
  Layers2,
  PanelBottom,
  Package,
  Shirt,
  Watch,
  type LucideIcon,
} from "lucide-react";
import type { AnalysisStatus, GarmentCategory } from "@/lib/domain/schemas";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { cn, formatCurrency } from "@/lib/utils";

/**
 * Catalog product tile in grid or list form. Presentational only — the page
 * maps a ProductRow into ProductCardData (this component never fetches or
 * imports server modules). When `onClick` is provided the whole card becomes a
 * button; pass it from a Client Component.
 */

export interface ProductCardData {
  id: string;
  title: string;
  sku?: string;
  price: number;
  currency?: string;
  inventoryQuantity: number;
  /** Public image URL, or null/undefined to show the category placeholder. */
  imageUrl?: string | null;
  /** Normalised garment category from analysis, when available. */
  category?: GarmentCategory | null;
  analysisStatus: AnalysisStatus;
}

const GARMENT_GLYPH: Record<GarmentCategory, LucideIcon> = {
  top: Shirt,
  bottom: PanelBottom,
  dress: Shirt,
  outerwear: Layers2,
  footwear: Footprints,
  accessory: Watch,
  other: Package,
};

function glyphFor(category: GarmentCategory | null | undefined): LucideIcon {
  return category ? GARMENT_GLYPH[category] : Package;
}

export interface ProductCardProps {
  product: ProductCardData;
  variant?: "grid" | "list";
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

function Placeholder({
  category,
  className,
}: {
  category: GarmentCategory | null | undefined;
  className?: string;
}) {
  const Glyph = glyphFor(category);
  return (
    <div
      className={cn(
        "flex items-center justify-center bg-paper text-line",
        className,
      )}
    >
      <Glyph aria-hidden className="size-8" />
    </div>
  );
}

function CategoryBadge({ category }: { category: GarmentCategory }) {
  const label = category.charAt(0).toUpperCase() + category.slice(1);
  return <Badge variant="neutral">{label}</Badge>;
}

function StockLine({ quantity }: { quantity: number }) {
  if (quantity <= 0) {
    return <span className="text-xs font-medium text-danger">Out of stock</span>;
  }
  return (
    <span className="text-xs text-muted">
      {quantity} in stock
    </span>
  );
}

export function ProductCard({
  product,
  variant = "grid",
  selected = false,
  onClick,
  className,
}: ProductCardProps) {
  const interactive = Boolean(onClick);
  // Loosely typed so a single JSX element can be either <button> or <div>
  // without a union-of-intrinsic-elements prop error.
  const Root: React.ElementType = interactive ? "button" : "div";
  const rootProps: Record<string, unknown> = interactive
    ? { type: "button", onClick, "aria-pressed": selected }
    : {};

  const frame = cn(
    "group border bg-surface text-left transition-colors",
    selected ? "border-accent ring-1 ring-accent" : "border-line",
    interactive &&
      "cursor-pointer hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    className,
  );

  const price = formatCurrency(product.price, product.currency);

  if (variant === "list") {
    return (
      <Root {...rootProps} className={cn(frame, "flex w-full items-center gap-4 p-3")}>
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.title}
            loading="lazy"
            className="size-16 shrink-0 border border-line object-cover"
          />
        ) : (
          <Placeholder
            category={product.category}
            className="size-16 shrink-0 border border-line"
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium text-ink">{product.title}</span>
          {product.sku ? (
            <span className="truncate font-mono text-xs text-muted">
              {product.sku}
            </span>
          ) : null}
          <StockLine quantity={product.inventoryQuantity} />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="font-medium tabular-nums text-ink">{price}</span>
          <div className="flex items-center gap-1.5">
            {product.category ? (
              <CategoryBadge category={product.category} />
            ) : null}
            <StatusBadge kind="analysis" status={product.analysisStatus} />
          </div>
        </div>
      </Root>
    );
  }

  return (
    <Root {...rootProps} className={cn(frame, "flex w-full flex-col")}>
      {product.imageUrl ? (
        <img
          src={product.imageUrl}
          alt={product.title}
          loading="lazy"
          className="aspect-square w-full object-cover"
        />
      ) : (
        <Placeholder category={product.category} className="aspect-square w-full" />
      )}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="line-clamp-2 font-medium leading-snug text-ink">
            {product.title}
          </span>
          <span className="shrink-0 font-medium tabular-nums text-ink">
            {price}
          </span>
        </div>
        {product.sku ? (
          <span className="font-mono text-xs text-muted">{product.sku}</span>
        ) : null}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
          <StockLine quantity={product.inventoryQuantity} />
          <div className="flex items-center gap-1.5">
            {product.category ? (
              <CategoryBadge category={product.category} />
            ) : null}
            <StatusBadge kind="analysis" status={product.analysisStatus} />
          </div>
        </div>
      </div>
    </Root>
  );
}
