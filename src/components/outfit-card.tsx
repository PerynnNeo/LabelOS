"use client";

import { useId, useState } from "react";
import {
  Check,
  ChevronDown,
  Shirt,
  TriangleAlert,
} from "lucide-react";
import type { CurationLabel } from "@/lib/domain/schemas";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { ScoreBar } from "@/components/score-bar";
import { cn } from "@/lib/utils";

/**
 * Outfit summary card. The page resolves each product id to a lightweight
 * summary and passes them in — this component never fetches. The strengths /
 * issues section is collapsible, which is why this is a Client Component.
 */

export type OutfitVerdict = "approve" | "revise" | "reject";

export interface OutfitCardProductSummary {
  id: string;
  title: string;
  imageUrl?: string | null;
}

export interface OutfitCardData {
  id: string;
  name: string;
  occasion?: string;
  /** Curation label (Core / Directional / Statement), when curated. */
  label?: CurationLabel | null;
  products: OutfitCardProductSummary[];
  /** Weighted overall score in 0–1. */
  overallScore?: number | null;
  verdict?: OutfitVerdict | null;
  strengths?: string[];
  issues?: string[];
}

const VERDICT_META: Record<OutfitVerdict, { variant: BadgeVariant; label: string }> = {
  approve: { variant: "success", label: "Approve" },
  revise: { variant: "warning", label: "Revise" },
  reject: { variant: "danger", label: "Reject" },
};

const LABEL_VARIANT: Record<CurationLabel, BadgeVariant> = {
  Core: "neutral",
  Directional: "accent",
  Statement: "warning",
};

function Thumb({ product }: { product: OutfitCardProductSummary }) {
  if (product.imageUrl) {
    return (
      <img
        src={product.imageUrl}
        alt={product.title}
        title={product.title}
        loading="lazy"
        className="size-12 shrink-0 border border-line object-cover"
      />
    );
  }
  return (
    <span
      title={product.title}
      className="flex size-12 shrink-0 items-center justify-center border border-line bg-paper text-line"
    >
      <Shirt aria-hidden className="size-5" />
    </span>
  );
}

export interface OutfitCardProps {
  outfit: OutfitCardData;
  defaultExpanded?: boolean;
  className?: string;
}

export function OutfitCard({
  outfit,
  defaultExpanded = false,
  className,
}: OutfitCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const detailsId = useId();

  const strengths = outfit.strengths ?? [];
  const issues = outfit.issues ?? [];
  const hasDetails = strengths.length > 0 || issues.length > 0;
  const verdict = outfit.verdict ? VERDICT_META[outfit.verdict] : null;

  return (
    <div className={cn("flex flex-col border border-line bg-surface", className)}>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            {outfit.occasion ? (
              <span className="text-xs font-medium uppercase tracking-[0.15em] text-accent">
                {outfit.occasion}
              </span>
            ) : null}
            <h3 className="font-display text-lg leading-tight tracking-tight text-ink">
              {outfit.name}
            </h3>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {outfit.label ? (
              <Badge variant={LABEL_VARIANT[outfit.label]}>{outfit.label}</Badge>
            ) : null}
            {verdict ? (
              <Badge variant={verdict.variant}>{verdict.label}</Badge>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {outfit.products.map((product) => (
            <Thumb key={product.id} product={product} />
          ))}
        </div>

        {typeof outfit.overallScore === "number" ? (
          <ScoreBar
            value={outfit.overallScore}
            label="Overall score"
            tone="accent"
          />
        ) : null}
      </div>

      {hasDetails ? (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={detailsId}
            className="flex items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span>
              {strengths.length} strength{strengths.length === 1 ? "" : "s"} ·{" "}
              {issues.length} issue{issues.length === 1 ? "" : "s"}
            </span>
            <ChevronDown
              aria-hidden
              className={cn(
                "size-4 transition-transform",
                expanded && "rotate-180",
              )}
            />
          </button>
          {expanded ? (
            <div id={detailsId} className="flex flex-col gap-4 border-t border-line px-4 py-4">
              {strengths.length > 0 ? (
                <ul className="flex flex-col gap-1.5">
                  {strengths.map((item, index) => (
                    <li key={index} className="flex gap-2 text-sm text-ink">
                      <Check
                        aria-hidden
                        className="mt-0.5 size-4 shrink-0 text-success"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {issues.length > 0 ? (
                <ul className="flex flex-col gap-1.5">
                  {issues.map((item, index) => (
                    <li key={index} className="flex gap-2 text-sm text-ink">
                      <TriangleAlert
                        aria-hidden
                        className="mt-0.5 size-4 shrink-0 text-warning"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
