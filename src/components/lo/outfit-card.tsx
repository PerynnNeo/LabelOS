"use client";

import {
  CURATION_TONE,
  OUTFIT_TONE,
  VERDICT_TONE,
  money,
  toneFor,
} from "@/lib/ui/tokens";
import { cn } from "@/lib/utils";
import { Button, IconButton } from "./button";
import { Icon } from "./icon";
import { Pill } from "./pill";
import { Swatch } from "./swatch";

/** One resolved garment inside an outfit (already summarised by the screen). */
export interface OutfitItemSummary {
  title: string;
  /** Swatch seed (defaults to title). */
  seed?: string;
  imageUrl?: string;
}

export interface OutfitSummary {
  id: string;
  name: string;
  /** Occasion / use, e.g. "Weekday · office". */
  occasion: string;
  /** Outfit total (numeric) — formatted with `money`. */
  total: number;
  currency?: string;
  /** AI style score, shown 0–100. */
  score: number;
  /** Curation label ("Core" | "Directional" | "Statement"). */
  curationLabel?: string;
  /** outfits.status — resolved via OUTFIT_TONE for the status chip. */
  status?: string;
  /** Critic verdict ("approve" | "revise" | "reject") — takes chip priority. */
  verdict?: string;
  items: OutfitItemSummary[];
}

export interface OutfitCardActions {
  onApprove?: () => void;
  approveLabel?: string;
  approveVariant?: "primary" | "success" | "secondary";
  onRevise?: () => void;
  onRemove?: () => void;
  /** Disable/spin the approve button. */
  loading?: boolean;
}

export interface OutfitCardProps {
  outfit: OutfitSummary;
  actions?: OutfitCardActions;
  className?: string;
}

export function OutfitCard({ outfit, actions, className }: OutfitCardProps) {
  const chipTone = outfit.verdict
    ? toneFor(VERDICT_TONE, outfit.verdict)
    : outfit.status
      ? toneFor(OUTFIT_TONE, outfit.status)
      : null;
  const curationTone = outfit.curationLabel
    ? toneFor(CURATION_TONE, outfit.curationLabel)
    : null;

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-[16px] border border-[rgba(0,0,0,0.06)] bg-surface shadow-card",
        className,
      )}
    >
      <div className="flex gap-1.5 px-2.5 pt-2.5">
        {outfit.items.map((item, i) => (
          <Swatch
            key={`${item.title}-${i}`}
            className="flex-1"
            seed={item.seed ?? item.title}
            imageUrl={item.imageUrl}
            label={item.title}
            aspect="3/4"
            rounded={9}
          />
        ))}
      </div>

      <div className="flex flex-1 flex-col px-[15px] pt-[13px] pb-[15px]">
        <div className="mb-[7px] flex items-center gap-[7px]">
          {curationTone ? (
            <Pill
              tone={curationTone}
              className="text-[10.5px] font-bold"
              label={outfit.curationLabel}
            />
          ) : null}
          <span className="ml-auto text-[11px] text-muted" title="AI style score">
            Score
          </span>
          <span className="text-[16px] font-bold text-ink">{outfit.score}</span>
        </div>

        <div className="text-[14.5px] font-[650] tracking-[-0.01em] text-ink">
          {outfit.name}
        </div>
        <div className="mt-[3px] text-[12px] text-muted">
          {outfit.occasion} · {money(outfit.total, outfit.currency)}
        </div>

        {chipTone ? (
          <div className="mt-[9px]">
            <Pill tone={chipTone} className="text-[10.5px] font-semibold" />
          </div>
        ) : null}

        {actions &&
        (actions.onApprove || actions.onRevise || actions.onRemove) ? (
          <div className="mt-3 flex gap-[7px]">
            {actions.onApprove ? (
              <Button
                size="sm"
                variant={actions.approveVariant ?? "primary"}
                className="flex-1"
                onClick={actions.onApprove}
                loading={actions.loading}
              >
                {actions.approveLabel ?? "Approve"}
              </Button>
            ) : null}
            {actions.onRevise ? (
              <IconButton label="Request another revision" onClick={actions.onRevise}>
                <Icon name="refresh-cw" size={15} />
              </IconButton>
            ) : null}
            {actions.onRemove ? (
              <IconButton
                label="Remove from collection"
                variant="danger"
                onClick={actions.onRemove}
              >
                <Icon name="trash" size={15} />
              </IconButton>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
