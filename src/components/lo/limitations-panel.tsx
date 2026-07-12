"use client";

import { useId, useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Collapsible "MVP limitations" panel (iOS card styling). The list is the
 * honest-limitations disclosure from the master spec (Part X) and is
 * intentionally verbatim — these are product requirements, not decoration, and
 * must stay visible wherever agent outputs are shown.
 */

export const MVP_LIMITATIONS: readonly string[] = [
  "Trend outputs are directional, not guaranteed predictions.",
  "Visual fabric analysis is not verification.",
  "The flat sketch is not a production pattern.",
  "The technical pack is a draft requiring professional review.",
  "Supplier records may be demo data or unverified leads.",
  "Quote comparison does not replace due diligence.",
  "The application does not place manufacturing orders or payments.",
  "Shopify publishing is limited to the configured owner-controlled store.",
  "“Shop the Look” inside a Shopify theme requires a later theme extension; the MVP publishes products and collections and provides a LabelOS-hosted lookbook.",
];

export interface LimitationsPanelProps {
  defaultOpen?: boolean;
  className?: string;
}

export function LimitationsPanel({
  defaultOpen = false,
  className,
}: LimitationsPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <section
      className={cn("lo-card overflow-hidden", className)}
      aria-label="MVP limitations"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-center justify-between gap-3 px-[18px] py-[15px] text-left transition-colors hover:bg-[rgba(0,0,0,0.02)]"
      >
        <span className="flex items-center gap-2.5">
          <Info aria-hidden className="size-[18px] shrink-0 text-accent" />
          <span className="text-[14.5px] font-[650] tracking-[-0.01em] text-ink">
            MVP limitations
          </span>
          <span className="rounded-full bg-[rgba(255,149,0,0.14)] px-[9px] py-[3px] text-[11px] font-semibold leading-none text-[#B25000]">
            Honest disclosure
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <ul
          id={bodyId}
          className="flex list-disc flex-col gap-2 border-t border-[rgba(0,0,0,0.06)] py-4 pl-[38px] pr-[18px] text-[12.5px] leading-relaxed text-ink3 marker:text-faint"
        >
          {MVP_LIMITATIONS.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
