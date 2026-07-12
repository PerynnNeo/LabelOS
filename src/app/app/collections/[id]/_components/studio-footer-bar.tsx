"use client";

import { toast } from "sonner";
import { StudioFooter } from "@/components/lo";

/**
 * Thin client wrapper around the shared `<StudioFooter>` so the studio page can
 * stay a Server Component while still wiring the "Save draft" handler (a
 * function can't be passed from a Server Component to a Client one). Navigation
 * (Back / Continue) is href-based and handled by the footer itself.
 */
export interface StudioFooterBarProps {
  currentId: number;
  stageLabel: string;
  backHref?: string;
  backLabel?: string;
  nextHref?: string;
  nextLabel?: string;
}

export function StudioFooterBar({
  currentId,
  stageLabel,
  backHref,
  backLabel,
  nextHref,
  nextLabel = "Continue",
}: StudioFooterBarProps) {
  return (
    <StudioFooter
      currentId={currentId}
      stageLabel={stageLabel}
      back={backHref ? { label: backLabel ?? "Back", href: backHref } : undefined}
      next={nextHref ? { label: nextLabel, href: nextHref } : undefined}
      onSave={() => toast.success("Draft saved.")}
    />
  );
}
