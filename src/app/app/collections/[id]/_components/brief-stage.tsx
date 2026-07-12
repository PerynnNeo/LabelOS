"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Button,
  Card,
  CardRow,
  Chip,
  Drawer,
  NextAction,
} from "@/components/lo";
import { pct } from "@/lib/ui/tokens";
import { cn } from "@/lib/utils";
import { apiRequest, errorMessage } from "@/app/app/_lib/api-client";
import type { StudioStageProps } from "./types";

/**
 * Stage 1 — Collection Brief.
 *
 * Presents the brief read-only (rows + hard-constraints callout) alongside the
 * brand profile / palette, with an "Edit brief" drawer (PATCH
 * /api/collections/[id]). The Next-action compiles trend directions: it POSTs
 * the trend job when no report exists yet, then moves to the Trends stage.
 */
export function BriefStage({ collection, brandProfile, products }: StudioStageProps) {
  const router = useRouter();
  const brief = collection.brief;

  const [compiling, setCompiling] = useState(false);
  const [editing, setEditing] = useState(false);

  const trendsHref = `/app/collections/${collection.id}?stage=trends`;

  async function compileTrends() {
    if (compiling) return;
    if (collection.trend_report) {
      router.push(trendsHref);
      return;
    }
    setCompiling(true);
    try {
      await apiRequest(`/api/collections/${collection.id}/trends`, {
        method: "POST",
      });
      toast.success("Trend directions compiled.");
      router.push(trendsHref);
    } catch (error) {
      toast.error(errorMessage(error));
      setCompiling(false);
    }
  }

  const heroTitles = brief.heroProductIds
    .map((hid) => products.find((p) => p.id === hid)?.title)
    .filter((t): t is string => Boolean(t));

  const constraints: string[] = [];
  if (heroTitles.length > 0) {
    constraints.push(
      `Feature ${heroTitles.join(", ")} in the collection wherever it fits.`,
    );
  }
  constraints.push(
    brief.maxNewProducts > 0
      ? `Add at most ${brief.maxNewProducts} new product${brief.maxNewProducts > 1 ? "s" : ""} to the assortment.`
      : "Style the existing catalog only — no new products.",
  );
  constraints.push(
    `Any new product must hold a ${pct(brief.targetGrossMargin)} gross margin.`,
  );
  if (!brief.allowUnavailableProducts) {
    constraints.push("Use in-stock products only.");
  }
  if (brief.prohibitedStyles.length > 0) {
    constraints.push(`Avoid prohibited styles: ${brief.prohibitedStyles.join(", ")}.`);
  }

  const briefRows: Array<[string, string]> = [
    ["Market", brief.market],
    ["Season", brief.season],
    ["Climate", brief.climate],
    ["Audience", brief.audience],
    ["Price tier", brief.priceTier],
    ["Commercial objective", brief.commercialObjective],
    ["Target gross margin", pct(brief.targetGrossMargin)],
  ];

  return (
    <div className="flex flex-col gap-[18px]">
      <NextAction
        title="Confirm the brief, then compile trend directions"
        help="The brief below drives every downstream agent. Edit anything before you continue."
        action={{
          label: collection.trend_report
            ? "Go to trend directions"
            : "Compile trend directions",
          onClick: compileTrends,
          loading: compiling,
        }}
      />

      <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[1.3fr_1fr]">
        {/* Brief */}
        <Card className="py-2">
          <div className="flex items-center gap-2.5 px-4 pb-2 pt-3">
            <div className="flex-1 text-[15px] font-[650] tracking-[-0.01em] text-ink">
              Collection brief
            </div>
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Edit brief
            </Button>
          </div>

          {briefRows.map(([k, v]) => (
            <CardRow key={k} label={k} value={v} />
          ))}

          <div className="m-3 rounded-[12px] border border-[rgba(10,132,255,0.16)] bg-[rgba(10,132,255,0.06)] px-3.5 py-3">
            <div className="mb-2 text-[11.5px] font-bold uppercase tracking-[0.03em] text-accent">
              Hard constraints
            </div>
            <ul className="flex flex-col gap-1.5">
              {constraints.map((c, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-[12px] font-bold text-accent">{i + 1}</span>
                  <span className="text-[12.5px] leading-snug text-[#3A5878]">{c}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        {/* Brand profile */}
        <Card className="p-5">
          <div className="mb-3.5 text-[15px] font-[650] tracking-[-0.01em] text-ink">
            Brand profile
          </div>

          <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.03em] text-muted">
            Palette
          </div>
          {brandProfile && brandProfile.colours.length > 0 ? (
            <div className="mb-4 flex flex-wrap gap-3.5">
              {brandProfile.colours.slice(0, 6).map((colour, i) => (
                <div key={`${colour}-${i}`} className="text-center">
                  <div
                    className="size-[34px] rounded-[9px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]"
                    style={{ background: swatchBackground(colour) }}
                  />
                  <div className="mt-1.5 max-w-[52px] truncate text-[10.5px] text-muted">
                    {colour}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mb-4 text-[12.5px] text-muted">
              No palette set on the brand profile yet.
            </p>
          )}

          <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.03em] text-muted">
            Personality
          </div>
          {brandProfile && brandProfile.personality.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {brandProfile.personality.map((trait) => (
                <Chip key={trait}>{trait}</Chip>
              ))}
            </div>
          ) : (
            <p className="text-[12.5px] text-muted">No personality traits set yet.</p>
          )}

          <Link
            href="/app/brand"
            className="mt-4 flex h-9 w-full items-center justify-center rounded-[9px] border border-[rgba(0,0,0,0.12)] bg-surface text-[13px] font-semibold text-ink transition hover:bg-[#FAFAFA]"
          >
            Edit brand profile
          </Link>
        </Card>
      </div>

      <EditBriefDrawer
        open={editing}
        onClose={() => setEditing(false)}
        collectionId={collection.id}
        brief={brief}
        onSaved={() => {
          setEditing(false);
          router.refresh();
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit-brief drawer — PATCH /api/collections/[id] with a full, valid brief.
// ---------------------------------------------------------------------------

type Brief = StudioStageProps["collection"]["brief"];

function EditBriefDrawer({
  open,
  onClose,
  collectionId,
  brief,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  collectionId: string;
  brief: Brief;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    market: brief.market,
    season: brief.season,
    climate: brief.climate,
    audience: brief.audience,
    priceTier: brief.priceTier,
    commercialObjective: brief.commercialObjective,
    notes: brief.notes,
    targetGrossMargin: brief.targetGrossMargin,
  });
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    const required: Array<[keyof typeof form, string]> = [
      ["market", "Market"],
      ["season", "Season"],
      ["climate", "Climate"],
      ["audience", "Audience"],
      ["priceTier", "Price tier"],
      ["commercialObjective", "Commercial objective"],
    ];
    for (const [key, label] of required) {
      if (!String(form[key]).trim()) {
        toast.error(`${label} is required.`);
        return;
      }
    }
    setSaving(true);
    try {
      await apiRequest(`/api/collections/${collectionId}`, {
        method: "PATCH",
        body: {
          brief: {
            ...brief,
            market: form.market.trim(),
            season: form.season.trim(),
            climate: form.climate.trim(),
            audience: form.audience.trim(),
            priceTier: form.priceTier.trim(),
            commercialObjective: form.commercialObjective.trim(),
            notes: form.notes,
            targetGrossMargin: form.targetGrossMargin,
          },
        },
      });
      toast.success("Brief updated.");
      onSaved();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Edit brief"
      subtitle="Changes re-ground every downstream agent."
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={save} loading={saving}>
            Save brief
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField label="Market" value={form.market} onChange={(v) => set("market", v)} />
        <TextField label="Season" value={form.season} onChange={(v) => set("season", v)} />
        <TextField label="Climate" value={form.climate} onChange={(v) => set("climate", v)} />
        <TextField label="Audience" value={form.audience} onChange={(v) => set("audience", v)} />
        <TextField
          label="Price tier"
          value={form.priceTier}
          onChange={(v) => set("priceTier", v)}
        />
        <TextField
          label="Commercial objective"
          value={form.commercialObjective}
          onChange={(v) => set("commercialObjective", v)}
          textarea
        />
        <TextField
          label="Notes"
          value={form.notes}
          onChange={(v) => set("notes", v)}
          textarea
        />
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="eb-margin"
            className="text-[12.5px] font-semibold text-ink2"
          >
            Target gross margin ·{" "}
            <span className="tabular-nums text-ink">
              {pct(form.targetGrossMargin)}
            </span>
          </label>
          <input
            id="eb-margin"
            type="range"
            min={0}
            max={0.95}
            step={0.05}
            value={form.targetGrossMargin}
            onChange={(e) => set("targetGrossMargin", Number(e.target.value))}
            className="w-full accent-[var(--color-accent)]"
          />
          <p className="text-[11.5px] text-muted">
            Drives the maximum landed cost for any new product — retail × (1 −
            margin).
          </p>
        </div>
      </div>
    </Drawer>
  );
}

function TextField({
  label,
  value,
  onChange,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  textarea?: boolean;
}) {
  const id = `eb-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  const cls =
    "w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-[13.5px] text-ink placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12.5px] font-semibold text-ink2">
        {label}
      </label>
      {textarea ? (
        <textarea
          id={id}
          rows={2}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(cls, "resize-none")}
        />
      ) : (
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        />
      )}
    </div>
  );
}

/** Use a hex/CSS colour directly as a swatch fill; fall back to a neutral tint. */
function swatchBackground(colour: string): string {
  const trimmed = colour.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) return trimmed;
  if (/^(rgb|hsl)a?\(/i.test(trimmed)) return trimmed;
  // Named CSS colours still render; anything unrecognised shows a neutral chip.
  return /^[a-z]+$/i.test(trimmed) ? trimmed : "rgba(120,120,128,0.18)";
}
