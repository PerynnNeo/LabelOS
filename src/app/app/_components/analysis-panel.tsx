import { BadgeCheck, ShieldQuestion, TriangleAlert } from "lucide-react";
import type { GarmentAnalysis } from "@/lib/domain/schemas";
import { Badge } from "@/components/ui/badge";
import { ScoreBar } from "@/components/score-bar";

/**
 * Renders a garment analysis (Garment Librarian output) as an editorial detail
 * panel. Presentational and Server/Client-safe. The material observation is
 * shown with an explicit verified/caveat callout — visual analysis is never
 * treated as verification.
 */

function Field({ label, value }: { label: string; value: string }) {
  const display = value && value.trim().length > 0 ? value : "—";
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
        {label}
      </dt>
      <dd className="text-sm text-ink">{display}</dd>
    </div>
  );
}

function TagRow({ label, tags }: { label: string; tags: string[] }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag, index) => (
          <Badge key={`${tag}-${index}`} variant="neutral">
            {tag}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function AnalysisPanel({ analysis }: { analysis: GarmentAnalysis }) {
  const colors = [...analysis.primaryColors, ...analysis.secondaryColors];

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
        <Field label="Category" value={titleCase(analysis.category)} />
        <Field label="Subcategory" value={analysis.subcategory} />
        <Field label="Silhouette" value={analysis.silhouette} />
        <Field label="Fit" value={analysis.fit} />
        <Field label="Length" value={analysis.length} />
        <Field label="Pattern" value={analysis.pattern} />
        <Field label="Texture" value={analysis.texture} />
        <Field label="Layering role" value={analysis.layeringRole} />
      </dl>

      <div className="flex flex-col gap-3">
        <ScoreBar
          value={analysis.formality}
          label="Formality"
          tone="neutral"
        />
        <ScoreBar
          value={analysis.confidence}
          label="Analysis confidence"
          tone="accent"
        />
      </div>

      {colors.length > 0 ? <TagRow label="Colours" tags={colors} /> : null}
      <TagRow label="Style" tags={analysis.styleTags} />
      <TagRow label="Season" tags={analysis.seasonTags} />
      <TagRow label="Climate" tags={analysis.climateTags} />
      <TagRow label="Occasion" tags={analysis.occasionTags} />

      {/* Material observation — explicit about what is and isn't verified. */}
      <div
        className={
          analysis.materialObservation.verified
            ? "flex flex-col gap-2 border border-success/30 bg-success/5 px-4 py-3"
            : "flex flex-col gap-2 border border-warning/30 bg-warning/5 px-4 py-3"
        }
      >
        <div className="flex items-center gap-2">
          {analysis.materialObservation.verified ? (
            <BadgeCheck aria-hidden className="size-4 shrink-0 text-success" />
          ) : (
            <ShieldQuestion aria-hidden className="size-4 shrink-0 text-warning" />
          )}
          <span className="text-sm font-medium text-ink">
            Material observation
          </span>
          <Badge
            variant={analysis.materialObservation.verified ? "success" : "warning"}
          >
            {analysis.materialObservation.verified
              ? "Verified"
              : "Visual estimate"}
          </Badge>
        </div>
        <p className="text-sm text-ink">
          {analysis.materialObservation.value || "—"}
        </p>
        {analysis.materialObservation.caveat ? (
          <p className="text-xs leading-relaxed text-muted">
            {analysis.materialObservation.caveat}
          </p>
        ) : null}
        <ScoreBar
          value={analysis.materialObservation.confidence}
          label="Observation confidence"
          tone="neutral"
          className="mt-1"
        />
      </div>

      {analysis.compatibilityNotes.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Compatibility notes
          </span>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed text-muted marker:text-line">
            {analysis.compatibilityNotes.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {analysis.warnings.length > 0 ? (
        <div className="flex flex-col gap-2 border border-danger/30 bg-danger/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <TriangleAlert aria-hidden className="size-4 shrink-0 text-danger" />
            <span className="text-sm font-medium text-ink">Warnings</span>
          </div>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed text-danger marker:text-danger/50">
            {analysis.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
