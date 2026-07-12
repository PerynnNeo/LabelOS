"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { GarmentAnalysis } from "@/lib/domain/schemas";
import type { ProductRow } from "@/lib/supabase/repositories";
import { ANALYSIS_TONE, money, pct, toneFor } from "@/lib/ui/tokens";
import {
  AgentAvatar,
  Button,
  Chip,
  Drawer,
  Icon,
  Pill,
  ScoreBar,
  Swatch,
} from "@/components/lo";
import { apiRequest, errorMessage } from "@/app/app/_lib/api-client";

/**
 * Product detail drawer + the shared, presentational analysis panel.
 *
 * The catalog grid derives a five-way display status from the real product row
 * (analysis_status + owner review status) and opens this drawer. It shows the
 * fabric swatch and, per status, the queued / running / failed states or the
 * Garment Librarian analysis (attributes with confidence bars, colour read,
 * unverified-material caveat, and a source-of-each-fact table). The analysis
 * body is exported so the full product page can reuse it verbatim.
 *
 * Honesty labels from the mockup are preserved: material is always flagged as an
 * unverified visual estimate, and every attribute is attributed to catalog
 * metadata (verified) or AI vision (estimate).
 */

// ---------------------------------------------------------------------------
// Display-status derivation (shared with the catalog grid)
// ---------------------------------------------------------------------------

/** The five visible states, all keyed into ANALYSIS_TONE. */
export type AnalysisView =
  | "queued"
  | "running"
  | "failed"
  | "needs_review"
  | "complete";

/**
 * Map the persisted product state to a display status. The database only tracks
 * pending/running/complete/failed on `analysis_status`; a completed analysis is
 * "needs review" until the owner approves it (which sets status = "reviewed").
 */
export function deriveAnalysisView(
  product: Pick<ProductRow, "analysis_status" | "status">,
): AnalysisView {
  if (product.analysis_status === "running") return "running";
  if (product.analysis_status === "failed") return "failed";
  if (product.analysis_status === "pending") return "queued";
  return product.status === "reviewed" ? "complete" : "needs_review";
}

/** A mono file-name chip for the swatch (real object basename, else a slug). */
export function fileLabel(product: Pick<ProductRow, "image_path" | "title">): string {
  if (product.image_path) {
    const base = product.image_path.split("/").pop();
    if (base) return base;
  }
  const slug = product.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "garment"}.jpg`;
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

const COLOR_HEX: Record<string, string> = {
  ivory: "#EFE7D8",
  bone: "#E7E0D2",
  sand: "#D9C9A6",
  stone: "#D6CFC2",
  clay: "#B8A48C",
  charcoal: "#565B60",
  ink: "#2B2B2E",
  black: "#1D1D1F",
  white: "#F5F5F7",
  olive: "#6B7A4F",
  "palm green": "#6E8B5D",
  navy: "#2B3A55",
  "sea-salt blue": "#A9C4CE",
  neutral: "#D8D4CC",
};

/** Best-effort swatch dot colour for a colour name or hex string. */
function colorDot(name: string): string {
  const raw = name.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return raw;
  return COLOR_HEX[raw.toLowerCase()] ?? "#C7C7CC";
}

function formalityLabel(value: number): string {
  if (value < 0.34) return "Casual";
  if (value < 0.67) return "Smart-casual";
  return "Formal";
}

function titleCase(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

// ---------------------------------------------------------------------------
// AnalysisPanelBody — the shared analysis render (drawer + detail page)
// ---------------------------------------------------------------------------

export interface AnalysisPanelBodyProps {
  analysis: GarmentAnalysis;
}

export function AnalysisPanelBody({ analysis }: AnalysisPanelBodyProps) {
  const material = analysis.materialObservation;
  const colours = [...analysis.primaryColors, ...analysis.secondaryColors];

  const attrs: Array<{ k: string; v: string; bar: number }> = [
    { k: "Category", v: titleCase(analysis.category), bar: analysis.confidence },
    {
      k: "Subcategory",
      v: analysis.subcategory || "—",
      bar: analysis.confidence,
    },
    { k: "Silhouette", v: analysis.silhouette || "—", bar: analysis.confidence },
    { k: "Pattern", v: analysis.pattern || "—", bar: analysis.confidence },
    { k: "Formality", v: formalityLabel(analysis.formality), bar: analysis.formality },
    {
      k: "Layering role",
      v: titleCase(analysis.layeringRole) || "—",
      bar: analysis.confidence,
    },
  ];

  const uncertain = [
    ...(material.verified ? [] : ["Exact fibre / material blend"]),
    ...analysis.warnings,
  ];

  return (
    <div>
      {/* Agent header + overall confidence */}
      <div className="mb-3.5 flex items-center gap-2.5">
        <AgentAvatar actor="Garment Librarian" size={32} />
        <div className="flex-1">
          <div className="text-[13.5px] font-[650] text-ink">
            Garment Librarian
          </div>
          <div className="text-[11.5px] text-muted">
            Overall confidence {pct(analysis.confidence)}
          </div>
        </div>
      </div>

      {/* Unverified-material caveat */}
      <div className="mb-4 flex gap-2.5 rounded-[11px] border border-[rgba(255,149,0,0.22)] bg-[rgba(255,149,0,0.09)] p-[11px_13px]">
        <Icon
          name="alert-triangle"
          size={15}
          className="mt-px flex-none text-[#B25000]"
        />
        <div className="text-[11.5px] leading-[1.45] text-[#7A4A00]">
          <b className="font-[650]">Material is a visual guess, not verified.</b>{" "}
          {material.value} — {pct(material.confidence)} confidence.{" "}
          {material.caveat || "Confirm the exact fibre against supplier docs."}
        </div>
      </div>

      {/* Attributes + confidence bars */}
      <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.03em] text-muted">
        AI attributes &amp; confidence
      </div>
      {attrs.map((a) => (
        <div key={a.k} className="mb-[11px]">
          <div className="mb-1 flex items-center justify-between gap-2 text-[12.5px]">
            <span className="text-muted">{a.k}</span>
            <span className="font-semibold text-ink">
              {a.v}{" "}
              <span className="font-medium text-faint">{pct(a.bar)}</span>
            </span>
          </div>
          <ScoreBar value01={a.bar} showValue={false} />
        </div>
      ))}

      {/* Colour read */}
      {colours.length > 0 ? (
        <>
          <div className="mb-2.5 mt-4 text-[11px] font-semibold uppercase tracking-[0.03em] text-muted">
            Colour read
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            {colours.map((name, i) => (
              <span
                key={`${name}-${i}`}
                className="inline-flex items-center gap-[7px] rounded-full border border-[rgba(0,0,0,0.08)] bg-surface py-1 pl-[5px] pr-[11px]"
              >
                <span
                  aria-hidden
                  className="size-[18px] rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)]"
                  style={{ background: colorDot(name) }}
                />
                <span className="text-[12px] font-semibold text-ink">
                  {titleCase(name)}
                </span>
              </span>
            ))}
          </div>
        </>
      ) : null}

      {/* Style & context tags */}
      <TagRow label="Style & occasion" tags={[...analysis.styleTags, ...analysis.occasionTags]} />
      <TagRow label="Season & climate" tags={[...analysis.seasonTags, ...analysis.climateTags]} />

      {/* Uncertain / unverified */}
      {uncertain.length > 0 ? (
        <>
          <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.03em] text-muted">
            Uncertain / unverified
          </div>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {uncertain.map((u, i) => (
              <span
                key={`${u}-${i}`}
                className="rounded-full bg-[rgba(255,149,0,0.13)] px-2.5 py-1 text-[11.5px] font-medium text-[#B25000]"
              >
                {u}
              </span>
            ))}
          </div>
        </>
      ) : null}

      {/* Source of each fact */}
      <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.03em] text-muted">
        Source of each fact
      </div>
      <div className="overflow-hidden rounded-[12px] border border-[rgba(0,0,0,0.07)] bg-surface">
        <SourceRow
          label="Title, price, stock, SKU"
          value="Catalog metadata"
          fg="#248A3D"
          bg="rgba(52,199,89,0.13)"
        />
        <SourceRow
          label="Category, colour, material, silhouette, pattern"
          value="AI vision estimate"
          fg="#B25000"
          bg="rgba(255,149,0,0.14)"
          last
        />
      </div>
    </div>
  );
}

function SourceRow({
  label,
  value,
  fg,
  bg,
  last,
}: {
  label: string;
  value: string;
  fg: string;
  bg: string;
  last?: boolean;
}) {
  return (
    <div
      className={
        "flex items-center gap-2.5 px-[13px] py-2.5" +
        (last ? "" : " border-b border-[rgba(0,0,0,0.05)]")
      }
    >
      <span className="flex-1 text-[12px] text-ink2">{label}</span>
      <Pill fg={fg} bg={bg} label={value} />
    </div>
  );
}

function TagRow({ label, tags }: { label: string; tags: string[] }) {
  const unique = Array.from(new Set(tags.filter(Boolean)));
  if (unique.length === 0) return null;
  return (
    <>
      <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.03em] text-muted">
        {label}
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {unique.map((tag) => (
          <Chip key={tag}>{titleCase(tag)}</Chip>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Non-analysis states
// ---------------------------------------------------------------------------

function RunningState() {
  return (
    <div className="px-5 py-[34px] text-center">
      <span className="mx-auto mb-3.5 block size-[34px] animate-[lo-spin_0.8s_linear_infinite] rounded-full border-[3px] border-[rgba(10,132,255,0.22)] border-t-accent" />
      <div className="text-[14px] font-semibold text-ink">Analysing…</div>
      <div className="mt-[3px] text-[12.5px] text-muted">
        Garment Librarian · analysing
      </div>
    </div>
  );
}

function QueuedState({ onAnalyse, busy }: { onAnalyse: () => void; busy: boolean }) {
  return (
    <div className="px-5 py-[34px] text-center">
      <svg
        aria-hidden
        width="34"
        height="34"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#C7C7CC"
        strokeWidth="1.6"
        className="mx-auto mb-3 block"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="text-[14px] font-semibold text-ink">Queued for analysis</div>
      <div className="mb-4 mt-[3px] text-[12.5px] text-muted">
        No AI attributes yet.
      </div>
      <Button variant="primary" size="sm" loading={busy} onClick={onAnalyse}>
        Analyse now
      </Button>
    </div>
  );
}

function FailedState({ onRetry, busy }: { onRetry: () => void; busy: boolean }) {
  return (
    <div className="px-5 py-[30px] text-center">
      <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-[12px] bg-[rgba(255,59,48,0.12)] text-[#C4271B]">
        <Icon name="alert-triangle" size={24} />
      </div>
      <div className="text-[14px] font-semibold text-ink">Analysis failed</div>
      <div className="mb-4 mt-[3px] text-[12.5px] leading-[1.45] text-muted">
        The last analysis could not complete. Re-upload the image or retry.
      </div>
      <Button variant="primary" size="sm" loading={busy} onClick={onRetry}>
        <Icon name="refresh-cw" size={15} />
        Retry analysis
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProductDrawer
// ---------------------------------------------------------------------------

export interface ProductDrawerProps {
  product: ProductRow | null;
  currency: string;
  open: boolean;
  onClose: () => void;
  /** Called after a successful analyse / approve so the caller can refresh. */
  onChanged: () => void;
}

export function ProductDrawer({
  product,
  currency,
  open,
  onClose,
  onChanged,
}: ProductDrawerProps) {
  const [busy, setBusy] = useState<null | "analyse" | "approve">(null);

  if (!product) return null;

  const view = deriveAnalysisView(product);
  const tone = toneFor(ANALYSIS_TONE, view);
  const type = product.product_type || product.analysis?.category || "Garment";
  const price = money(product.price, currency);
  const stock =
    product.inventory_quantity > 0
      ? `${product.inventory_quantity} in stock`
      : "Out of stock";
  const hasAnalysis =
    (view === "complete" || view === "needs_review") && !!product.analysis;

  async function runAnalyse() {
    if (!product) return;
    setBusy("analyse");
    try {
      const result = await apiRequest<{ reused: boolean }>(
        `/api/products/${product.id}/analyse`,
        { method: "POST" },
      );
      toast.success(
        result.reused
          ? "Analysis already complete — showing the saved result."
          : "Analysis complete.",
      );
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    if (!product) return;
    setBusy("approve");
    try {
      await apiRequest(`/api/products/${product.id}`, {
        method: "PATCH",
        body: { status: "reviewed" },
      });
      toast.success("Analysis approved.");
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  const footer = hasAnalysis ? (
    <>
      <Button
        variant="secondary"
        disabled
        title="Editing attributes is coming soon"
      >
        Edit attributes
      </Button>
      <Button
        variant="secondary"
        loading={busy === "analyse"}
        onClick={runAnalyse}
      >
        Re-run
      </Button>
      <Button
        variant="primary"
        className="flex-1"
        loading={view === "needs_review" ? busy === "approve" : busy === "analyse"}
        onClick={view === "needs_review" ? approve : runAnalyse}
      >
        <Icon name="check" size={16} strokeWidth={2.2} />
        {view === "needs_review" ? "Approve analysis" : "Re-run analysis"}
      </Button>
    </>
  ) : undefined;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={product.title}
      subtitle={`${type} · ${price} · ${stock}`}
      headerRight={<Pill tone={tone} />}
      footer={footer}
    >
      <Swatch
        seed={product.id}
        file={fileLabel(product)}
        imageUrl={product.public_image_url ?? undefined}
        running={view === "running"}
        aspect="16/9"
        rounded={13}
        className="mb-4"
      />

      {view === "running" ? <RunningState /> : null}
      {view === "queued" ? (
        <QueuedState onAnalyse={runAnalyse} busy={busy === "analyse"} />
      ) : null}
      {view === "failed" ? (
        <FailedState onRetry={runAnalyse} busy={busy === "analyse"} />
      ) : null}
      {hasAnalysis && product.analysis ? (
        <AnalysisPanelBody analysis={product.analysis} />
      ) : null}
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// ReanalyseButton — header action for the full product page
// ---------------------------------------------------------------------------

export interface ReanalyseButtonProps {
  productId: string;
  /** True when an analysis already exists (changes the label to "Re-analyse"). */
  analysed: boolean;
}

export function ReanalyseButton({ productId, analysed }: ReanalyseButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const result = await apiRequest<{ reused: boolean }>(
        `/api/products/${productId}/analyse`,
        { method: "POST" },
      );
      toast.success(
        result.reused
          ? "Analysis already complete — showing the saved result."
          : "Analysis complete.",
      );
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="secondary" size="sm" loading={busy} onClick={run}>
      <Icon name="refresh-cw" size={15} />
      {analysed ? "Re-analyse" : "Analyse"}
    </Button>
  );
}
