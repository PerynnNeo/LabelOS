"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { RfqRow, SupplierRow } from "@/lib/supabase/repositories";
import {
  productionStageSchema,
  quotePayloadSchema,
  type ProductionStage,
  type QuoteComparison,
  type QuotePayload,
} from "@/lib/domain/schemas";
import {
  Card,
  Pill,
  Chip,
  Button,
  Toggle,
  ConfirmModal,
  Drawer,
  SourcingSequence,
  EmptyState,
  Icon,
} from "@/components/lo";
import { SUPPLIER_TONE, toneFor, money } from "@/lib/ui/tokens";
import { cn } from "@/lib/utils";
import { apiRequest, errorMessage } from "@/app/app/_lib/api-client";

// ---------------------------------------------------------------------------
// Response shapes (mirror /api/designs/[id]/rfq GET)
// ---------------------------------------------------------------------------
interface RfqWithSupplier extends RfqRow {
  supplierName: string;
}
interface Recommendation {
  rfqId: string;
  supplierName: string;
  totalScore: number;
  withinMaxLandedCost: boolean;
  rationale: string;
}
interface RfqGetResponse {
  rfqs: RfqWithSupplier[];
  comparison: QuoteComparison[];
  recommendation: Recommendation | null;
  weights: Record<string, number>;
  maximumLandedCost: number | null;
}

// ---------------------------------------------------------------------------
// Sourcing sequence — capped at Production Approval Pending.
// ---------------------------------------------------------------------------
const SOURCING_STEPS = [
  "Generate RFQ",
  "Review RFQ",
  "Record quotes",
  "Select sampling supplier",
  "Prepare sample",
  "Review sample",
  "Approve sample",
  "Draft production PO",
  "Approve production commitment",
];

const STAGE_STEP: Record<ProductionStage, number> = {
  RFQ_DRAFT: 2,
  QUOTE_RECEIVED: 3,
  SUPPLIER_SHORTLISTED: 4,
  SAMPLE_REQUESTED: 5,
  SAMPLE_REVIEW: 5,
  REVISION_REQUIRED: 5,
  SAMPLE_APPROVED: 7,
  PRODUCTION_APPROVAL_PENDING: 8,
};

/** Stages at or beyond "selected for sampling". */
const SAMPLING_OR_BEYOND: ReadonlySet<ProductionStage> = new Set([
  "SUPPLIER_SHORTLISTED",
  "SAMPLE_REQUESTED",
  "SAMPLE_REVIEW",
  "REVISION_REQUIRED",
  "SAMPLE_APPROVED",
  "PRODUCTION_APPROVAL_PENDING",
]);

function stageOf(rfq: RfqRow | undefined): ProductionStage | null {
  if (!rfq) return null;
  const parsed = productionStageSchema.safeParse(rfq.status);
  return parsed.success ? parsed.data : "RFQ_DRAFT";
}

function scoreColor(v01: number): string {
  if (v01 >= 0.9) return "#248A3D";
  if (v01 >= 0.75) return "#0A84FF";
  return "#B25000";
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------
export function SourcingView({
  designId,
  currency,
  suppliers,
}: {
  designId: string;
  currency: string;
  suppliers: SupplierRow[];
}) {
  const [data, setData] = useState<RfqGetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [sampleOpen, setSampleOpen] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [selectingRfq, setSelectingRfq] = useState<string | null>(null);
  const [quoteTarget, setQuoteTarget] = useState<{
    supplier: SupplierRow;
    rfq: RfqWithSupplier;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiRequest<RfqGetResponse>(
        `/api/designs/${designId}/rfq`,
      );
      setData(res);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [designId]);

  useEffect(() => {
    void load();
  }, [load]);

  // -- Derived --------------------------------------------------------------
  const rfqBySupplier = useMemo(() => {
    const map = new Map<string, RfqWithSupplier>();
    for (const rfq of data?.rfqs ?? []) map.set(rfq.supplier_id, rfq);
    return map;
  }, [data]);

  const cmpByRfq = useMemo(() => {
    const map = new Map<string, QuoteComparison>();
    for (const c of data?.comparison ?? []) map.set(c.rfqId, c);
    return map;
  }, [data]);

  const currentStep = useMemo(() => {
    const rfqs = data?.rfqs ?? [];
    if (rfqs.length === 0) return 0;
    let max = 1;
    for (const rfq of rfqs) {
      const stage = stageOf(rfq);
      if (stage) max = Math.max(max, STAGE_STEP[stage]);
    }
    return Math.min(max, SOURCING_STEPS.length - 1);
  }, [data]);

  const orderedSuppliers = useMemo(() => {
    return suppliers
      .map((supplier, index) => {
        const rfq = rfqBySupplier.get(supplier.id);
        const cmp = rfq ? cmpByRfq.get(rfq.id) : undefined;
        return { supplier, rfq, cmp, index };
      })
      .sort((a, b) => {
        const sa = a.cmp ? a.cmp.totalScore : -1;
        const sb = b.cmp ? b.cmp.totalScore : -1;
        if (sa !== sb) return sb - sa;
        return a.index - b.index;
      });
  }, [suppliers, rfqBySupplier, cmpByRfq]);

  const rfqCount = data?.rfqs.length ?? 0;
  const recommendation = data?.recommendation ?? null;

  // -- Actions --------------------------------------------------------------
  async function generateRfqs() {
    setGenerating(true);
    try {
      const res = await apiRequest<{ created: number }>(
        `/api/designs/${designId}/rfq`,
        { method: "POST", body: {} },
      );
      toast.success(
        res.created > 0
          ? `Drafted ${res.created} RFQ${res.created === 1 ? "" : "s"} — nothing sent.`
          : "RFQs already drafted for every supplier.",
      );
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setGenerating(false);
    }
  }

  async function selectForSampling(rfqId: string) {
    setSelectingRfq(rfqId);
    try {
      await apiRequest(`/api/designs/${designId}/rfq`, {
        method: "PATCH",
        body: { rfqId, stage: "SUPPLIER_SHORTLISTED" },
      });
      toast.success("Supplier shortlisted for sampling.");
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSelectingRfq(null);
    }
  }

  async function saveQuote(rfqId: string, quote: QuotePayload) {
    await apiRequest(`/api/designs/${designId}/rfq`, {
      method: "PATCH",
      body: { rfqId, quote },
    });
    toast.success("Quote recorded.");
    setQuoteTarget(null);
    await load();
  }

  function confirmSample() {
    setSimulating(true);
    // Mock only: never contacts a supplier, sends email, or places an order.
    window.setTimeout(() => {
      setSimulating(false);
      setSampleOpen(false);
      toast.success(
        "Simulated sample request (mock) — no supplier was contacted.",
      );
    }, 300);
  }

  const sampleNote =
    "MOCK MODE — LabelOS simulates the request locally. No supplier is contacted, no email is sent and no order is placed.";

  return (
    <div className="px-[30px] pb-10 pt-1">
      {/* Sourcing sequence */}
      <Card className="mb-4 p-[16px_20px]">
        <div className="mb-3.5 text-[11px] font-bold uppercase tracking-[0.04em] text-muted">
          Sourcing sequence — sampling first, production commitment last
        </div>
        <SourcingSequence steps={SOURCING_STEPS} current={currentStep} />
      </Card>

      {/* Next action */}
      <div className="lo-hero mb-[18px] flex flex-col gap-4 px-[22px] py-[18px] sm:flex-row sm:items-center sm:gap-5">
        <div className="min-w-0 flex-1">
          <div className="text-[11.5px] font-bold uppercase tracking-[0.05em] text-accent">
            Next action
          </div>
          <div className="mt-0.5 text-[17px] font-bold tracking-[-0.01em] text-ink">
            Simulate a sample request with your chosen supplier
          </div>
          <div className="mt-0.5 text-[12.5px] leading-snug text-ink3">
            {sampleNote}
          </div>
        </div>
        <Button
          className="flex-none"
          onClick={() => setSampleOpen(true)}
          disabled={rfqCount === 0}
        >
          <Icon name="send" size={16} strokeWidth={1.9} />
          Simulate sample request
        </Button>
      </div>

      {/* Recommendation transparency */}
      {recommendation ? (
        <Card className="mb-4 flex items-start gap-3 p-[14px_18px]">
          <Pill fg="#0863C4" bg="rgba(10,132,255,0.13)">
            RECOMMENDED
          </Pill>
          <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-ink2">
            {recommendation.rationale}
          </p>
        </Card>
      ) : null}

      {/* Supplier board header */}
      <div className="mb-3 flex items-center gap-3">
        <div className="flex-1 text-[13px] font-[650] text-ink">
          Supplier quotes
          <span className="ml-2 font-normal text-muted">
            {rfqCount > 0
              ? `${rfqCount} RFQ${rfqCount === 1 ? "" : "s"} drafted · unverified leads`
              : "unverified leads — not vetted factories"}
          </span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={generateRfqs}
          loading={generating}
          title="Drafts one RFQ per supplier. Idempotent — only missing RFQs are created. Nothing is sent."
        >
          <Icon name="refresh" size={15} />
          {rfqCount > 0 ? "Generate missing RFQs" : "Generate RFQs"}
        </Button>
      </div>

      {/* Supplier cards */}
      {suppliers.length === 0 ? (
        <Card>
          <EmptyState
            icon="box"
            title="No suppliers on the board"
            description="Seed the demo suppliers to draft RFQs. Supplier records are unverified leads, never vetted factories."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orderedSuppliers.map(({ supplier, rfq, cmp }) => (
            <SupplierCard
              key={supplier.id}
              supplier={supplier}
              rfq={rfq}
              cmp={cmp}
              currency={currency}
              recommended={
                !!recommendation && !!rfq && recommendation.rfqId === rfq.id
              }
              selecting={selectingRfq === rfq?.id}
              onSelect={() => rfq && selectForSampling(rfq.id)}
              onRecordQuote={() => rfq && setQuoteTarget({ supplier, rfq })}
            />
          ))}
        </div>
      )}

      {loading && !data ? (
        <p className="mt-3 text-[12px] text-muted">Loading supplier quotes…</p>
      ) : null}

      {/* Production PO — locked, separate later step */}
      <div className="mt-4 flex items-center gap-3 rounded-[16px] border border-[rgba(0,0,0,0.06)] bg-surface px-5 py-4 opacity-60 shadow-card">
        <Icon name="check" size={20} className="flex-none text-muted" />
        <div className="flex-1">
          <div className="text-[14px] font-[650] text-ink">
            Production purchase order — a separate, later step
          </div>
          <div className="mt-px text-[12px] text-muted">
            Unlocks only after a physical sample is approved. This release stops at
            Production Approval Pending — LabelOS never places production orders,
            sends purchase orders or triggers payments.
          </div>
        </div>
        <button
          type="button"
          disabled
          aria-disabled
          className="h-9 flex-none cursor-not-allowed rounded-[10px] border border-[rgba(0,0,0,0.14)] bg-surface px-4 text-[13px] font-semibold text-muted"
        >
          Draft production PO
        </button>
      </div>

      {/* Simulate sample modal */}
      <ConfirmModal
        open={sampleOpen}
        onClose={() => setSampleOpen(false)}
        tone="warning"
        header={
          <Pill fg={SUPPLIER_TONE.demo.fg} bg={SUPPLIER_TONE.demo.bg}>
            MOCK MODE
          </Pill>
        }
        title="Simulate a sample request?"
        body={
          <>
            This is a mock action for the demo. No supplier will be contacted, no
            email sent and no sample ordered — it only advances the sampling step
            visually so you can see the flow.
          </>
        }
        confirmLabel="Simulate request"
        onConfirm={confirmSample}
        loading={simulating}
      />

      {/* Manual quote drawer */}
      {quoteTarget ? (
        <QuoteDrawer
          supplier={quoteTarget.supplier}
          currency={currency}
          onClose={() => setQuoteTarget(null)}
          onSave={(quote) => saveQuote(quoteTarget.rfq.id, quote)}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Supplier card
// ---------------------------------------------------------------------------
interface SupplierRowItem {
  k: string;
  v: string;
  color?: string;
}

function SupplierCard({
  supplier,
  rfq,
  cmp,
  currency,
  recommended,
  selecting,
  onSelect,
  onRecordQuote,
}: {
  supplier: SupplierRow;
  rfq: RfqWithSupplier | undefined;
  cmp: QuoteComparison | undefined;
  currency: string;
  recommended: boolean;
  selecting: boolean;
  onSelect: () => void;
  onRecordQuote: () => void;
}) {
  const quote = rfq?.quote_payload ?? null;
  const stage = stageOf(rfq);
  const cur = quote?.currency ?? currency;

  const rows: SupplierRowItem[] = quote
    ? [
        { k: "Source", v: supplier.country },
        { k: "Quote", v: `${money(quote.unitPrice, cur)} / unit` },
        {
          k: "Landed est.",
          v: cmp ? money(cmp.landedCostEstimate, cur) : "—",
          color: cmp && !cmp.withinMaxLandedCost ? "#C4271B" : undefined,
        },
        { k: "MOQ", v: `${quote.minimumOrderQuantity} units` },
        {
          k: "MOQ cash",
          v: money(quote.unitPrice * quote.minimumOrderQuantity, cur),
        },
        {
          k: "Sample",
          v: `${money(quote.sampleFee, cur)} · ${quote.sampleLeadDays}d`,
        },
        { k: "Production", v: `${quote.productionLeadDays} days` },
        { k: "Payment", v: quote.paymentTerms },
        {
          k: "Budget",
          v: cmp
            ? cmp.withinMaxLandedCost
              ? "Within max landed cost"
              : "Over max landed cost"
            : "—",
          color: cmp && !cmp.withinMaxLandedCost ? "#C4271B" : "#248A3D",
        },
      ]
    : [
        { k: "Source", v: supplier.country },
        { k: "MOQ", v: `${supplier.minimum_order_quantity} units` },
        { k: "Sample lead", v: `${supplier.sample_lead_days} days` },
        { k: "Production lead", v: `${supplier.production_lead_days} days` },
        {
          k: "Status",
          v: rfq ? "RFQ drafted — awaiting quote" : "No RFQ drafted yet",
          color: "#8E8E93",
        },
      ];

  const selected = stage !== null && SAMPLING_OR_BEYOND.has(stage);
  const canSelect = stage === "QUOTE_RECEIVED";
  const verifyTone = toneFor(SUPPLIER_TONE, supplier.verification_status);
  const matchScore = cmp ? Math.round(cmp.totalScore * 100) : null;
  const matchColor = cmp ? scoreColor(cmp.totalScore) : "#8E8E93";

  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-[16px] border-[1.5px] bg-surface shadow-card",
        recommended ? "border-accent" : "border-[rgba(0,0,0,0.06)]",
      )}
    >
      {recommended ? (
        <span className="absolute right-3.5 top-3.5 z-[1] rounded-full bg-accent px-2.5 py-[3px] text-[10px] font-bold text-white">
          RECOMMENDED
        </span>
      ) : null}

      <div className="px-[18px] pb-3 pt-4">
        <div className="pr-24 text-[15.5px] font-bold tracking-[-0.01em] text-ink">
          {supplier.name}
        </div>
        <div className="mt-0.5 text-[11.5px] text-muted">
          {supplier.country} · {supplier.capabilities[0] ?? "apparel"}
        </div>
        <div className="mt-3 flex items-end gap-2">
          <div className="text-[28px] font-bold tracking-[-0.02em] text-ink">
            {quote ? money(quote.unitPrice, cur) : "—"}
          </div>
          <div className="mb-1.5 text-[11.5px] text-muted">
            / unit · landed{" "}
            {cmp ? money(cmp.landedCostEstimate, cur) : "pending"}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <span
            title="Deterministic weighted score (0–100): price 30%, MOQ fit 15%, sample speed 15%, production speed 10%, capability fit 15%, quality confidence 15%."
            className="cursor-help text-[11px] text-muted"
          >
            Supplier match score
          </span>
          <span className="text-[14px] font-bold" style={{ color: matchColor }}>
            {matchScore != null ? matchScore : "—"}
          </span>
        </div>
      </div>

      <div className="px-2">
        {rows.map((r) => (
          <div
            key={r.k}
            className="flex justify-between gap-3 border-t border-[rgba(0,0,0,0.04)] px-2.5 py-[7px] text-[11.5px]"
          >
            <span className="flex-none text-muted">{r.k}</span>
            <span
              className="min-w-0 truncate text-right font-semibold text-ink"
              style={r.color ? { color: r.color } : undefined}
              title={r.v}
            >
              {r.v}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5 px-[18px] pb-3 pt-2.5">
        <Pill fg={verifyTone.fg} bg={verifyTone.bg}>
          {verifyTone.label || "Lead"}
        </Pill>
        {supplier.capabilities.slice(0, 2).map((c) => (
          <Chip key={c}>{c}</Chip>
        ))}
      </div>

      <div className="mt-auto px-4 pb-4">
        {!rfq ? (
          <button
            type="button"
            disabled
            className="flex h-9 w-full cursor-not-allowed items-center justify-center rounded-[10px] border border-[rgba(0,0,0,0.12)] bg-surface text-[13px] font-semibold text-muted"
          >
            Generate RFQs to quote
          </button>
        ) : selected ? (
          <div className="flex h-9 w-full items-center justify-center gap-1.5 rounded-[10px] bg-[rgba(52,199,89,0.12)] text-[13px] font-semibold text-[#248A3D]">
            <Icon name="check" size={15} strokeWidth={2.4} />
            Selected for sampling
          </div>
        ) : canSelect ? (
          <div className="flex flex-col gap-1.5">
            <Button
              size="sm"
              className="w-full"
              onClick={onSelect}
              loading={selecting}
            >
              Select for sampling
            </Button>
            <button
              type="button"
              onClick={onRecordQuote}
              className="text-[11.5px] font-semibold text-accent hover:underline"
            >
              Edit quote
            </button>
          </div>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={onRecordQuote}
          >
            Record quote
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manual quote entry drawer (validated against quotePayloadSchema)
// ---------------------------------------------------------------------------
const EMPTY_QUOTE = (currency: string): QuotePayload => ({
  unitPrice: 0,
  currency,
  minimumOrderQuantity: 150,
  sampleFee: 0,
  sampleLeadDays: 14,
  productionLeadDays: 45,
  fabricResponsibility: "",
  packagingIncluded: true,
  paymentTerms: "",
  qualityProcess: "",
  defectPolicy: "",
  communicationNotes: "",
  freightEstimatePerUnit: 0,
  dutyEstimatePerUnit: 0,
});

function initialQuote(supplier: SupplierRow, currency: string): QuotePayload {
  const details = supplier.details as { exampleQuote?: unknown } | null;
  const parsed = quotePayloadSchema.safeParse(details?.exampleQuote);
  if (parsed.success) return parsed.data;
  return EMPTY_QUOTE(currency);
}

function QuoteDrawer({
  supplier,
  currency,
  onClose,
  onSave,
}: {
  supplier: SupplierRow;
  currency: string;
  onClose: () => void;
  onSave: (quote: QuotePayload) => Promise<void>;
}) {
  const [form, setForm] = useState<QuotePayload>(() =>
    initialQuote(supplier, currency),
  );
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof QuotePayload>(key: K, value: QuotePayload[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function submit() {
    const parsed = quotePayloadSchema.safeParse(form);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast.error(
        `Check the quote — ${first.path.join(".")}: ${first.message}`,
      );
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed.data);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title="Record supplier quote"
      subtitle={`${supplier.name} · demo data, prefilled from the example quote`}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={submit} loading={saving}>
            Save quote
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="rounded-[10px] bg-[rgba(255,149,0,0.1)] px-3 py-2 text-[11.5px] leading-relaxed text-[#7A4A00]">
          Manual entry for the demo. Values are your record of a supplier reply —
          LabelOS does not fetch quotes automatically.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label={`Unit price (${form.currency})`}
            value={form.unitPrice}
            onChange={(v) => set("unitPrice", v)}
          />
          <NumberField
            label="MOQ (units)"
            value={form.minimumOrderQuantity}
            onChange={(v) => set("minimumOrderQuantity", Math.round(v))}
          />
          <NumberField
            label="Sample fee"
            value={form.sampleFee}
            onChange={(v) => set("sampleFee", v)}
          />
          <NumberField
            label="Sample lead (days)"
            value={form.sampleLeadDays}
            onChange={(v) => set("sampleLeadDays", Math.round(v))}
          />
          <NumberField
            label="Production lead (days)"
            value={form.productionLeadDays}
            onChange={(v) => set("productionLeadDays", Math.round(v))}
          />
          <NumberField
            label="Freight / unit"
            value={form.freightEstimatePerUnit}
            onChange={(v) => set("freightEstimatePerUnit", v)}
          />
          <NumberField
            label="Duty / unit"
            value={form.dutyEstimatePerUnit}
            onChange={(v) => set("dutyEstimatePerUnit", v)}
          />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-[10px] border border-[rgba(0,0,0,0.08)] px-3 py-2.5">
          <span className="text-[12.5px] font-medium text-ink2">
            Packaging included
          </span>
          <Toggle
            checked={form.packagingIncluded}
            onChange={(v) => set("packagingIncluded", v)}
            label="Packaging included"
          />
        </div>

        <TextField
          label="Fabric responsibility"
          value={form.fabricResponsibility}
          onChange={(v) => set("fabricResponsibility", v)}
        />
        <TextField
          label="Payment terms"
          value={form.paymentTerms}
          onChange={(v) => set("paymentTerms", v)}
        />
        <TextField
          label="Quality process"
          value={form.qualityProcess}
          onChange={(v) => set("qualityProcess", v)}
          multiline
        />
        <TextField
          label="Defect policy"
          value={form.defectPolicy}
          onChange={(v) => set("defectPolicy", v)}
        />
        <TextField
          label="Communication notes"
          value={form.communicationNotes}
          onChange={(v) => set("communicationNotes", v)}
        />
      </div>
    </Drawer>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        className="h-9 rounded-[9px] border border-[rgba(0,0,0,0.12)] bg-surface px-2.5 text-[13px] text-ink outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-[rgba(10,132,255,0.25)]"
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  const cls =
    "rounded-[9px] border border-[rgba(0,0,0,0.12)] bg-surface px-2.5 py-2 text-[13px] leading-relaxed text-ink outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-[rgba(10,132,255,0.25)]";
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted">{label}</span>
      {multiline ? (
        <textarea
          rows={2}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(cls, "h-9 py-0")}
        />
      )}
    </label>
  );
}
