"use client";

import { Toggle } from "@/components/lo";

/**
 * "Model & safety" card. Every control here is display-only: the values are set
 * by server-side environment configuration, so the switches are locked. This is
 * a deliberate safety posture — Shopify is draft-only and approval gates are
 * always on. The card never renders any secret value.
 */
export function ModelSafetyCard({
  webSearchEnabled,
}: {
  webSearchEnabled: boolean;
}) {
  const noop = () => {};

  return (
    <div className="lo-card overflow-hidden">
      {/* Live trend research (reflects ENABLE_CLAUDE_WEB_SEARCH) */}
      <div className="flex items-center gap-3.5 border-b border-[rgba(0,0,0,0.05)] px-[18px] py-[15px]">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-[600] text-ink">
            Live trend research
          </div>
          <div className="mt-0.5 text-[12px] leading-snug text-muted">
            Let Trend Scout use Claude web search for cited, dated sources. Set
            via <span className="font-mono text-[11px]">ENABLE_CLAUDE_WEB_SEARCH</span>{" "}
            — restart to change.
          </div>
        </div>
        <Toggle
          checked={webSearchEnabled}
          disabled
          onChange={noop}
          label="Live trend research (set via environment)"
        />
      </div>

      {/* Shopify write mode — locked segmented control */}
      <div className="flex items-center gap-3.5 border-b border-[rgba(0,0,0,0.05)] px-[18px] py-[15px]">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-[600] text-ink">
            Shopify write mode
          </div>
          <div className="mt-0.5 text-[12px] leading-snug text-muted">
            Locked to draft-only. Products never go live without your approval.
          </div>
        </div>
        <div
          role="radiogroup"
          aria-label="Shopify write mode (locked to draft-only)"
          className="flex flex-none rounded-[9px] bg-[rgba(120,120,128,0.12)] p-[2px]"
        >
          <span
            role="radio"
            aria-checked="true"
            className="rounded-[7px] bg-surface px-3 py-[5px] text-[12px] font-[600] text-ink shadow-[0_1px_3px_rgba(0,0,0,0.15)]"
          >
            Draft-only
          </span>
          <span
            role="radio"
            aria-checked="false"
            aria-disabled="true"
            className="px-3 py-[5px] text-[12px] font-medium text-faint"
          >
            Live
          </span>
        </div>
      </div>

      {/* Approval gates — locked on */}
      <div className="flex items-center gap-3.5 px-[18px] py-[15px]">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-[600] text-ink">Approval gates</div>
          <div className="mt-0.5 text-[12px] leading-snug text-muted">
            Require your tap before publishing, ordering or emailing a supplier.
            Always on.
          </div>
        </div>
        <Toggle
          checked
          disabled
          onChange={noop}
          label="Approval gates (locked on)"
        />
      </div>
    </div>
  );
}
