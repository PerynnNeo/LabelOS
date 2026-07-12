"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button, Card, Icon } from "@/components/lo";
import { collectionBriefSchema } from "@/lib/domain/schemas";
import { cn } from "@/lib/utils";
import { pct } from "@/lib/ui/tokens";
import { apiRequest, errorMessage } from "@/app/app/_lib/api-client";

/**
 * Collection brief form. Builds a payload matching `collectionBriefSchema`,
 * creates the collection via POST /api/collections, then opens the studio.
 * Hero products (fetched from /api/products) and prohibited-style tags are
 * managed as local state alongside the react-hook-form text fields.
 */

interface HeroOption {
  id: string;
  title: string;
  category: string | null;
}

const formSchema = z.object({
  name: z.string().min(1, "Give the collection a name.").max(200),
  market: z.string().min(1, "Required."),
  season: z.string().min(1, "Required."),
  climate: z.string().min(1, "Required."),
  audience: z.string().min(1, "Required."),
  priceTier: z.string().min(1, "Required."),
  commercialObjective: z.string().min(1, "Describe the commercial objective."),
  targetGrossMargin: z.number().min(0).max(0.95),
  maxNewProducts: z.number().int().min(0).max(1),
  allowUnavailableProducts: z.boolean(),
  notes: z.string().max(2000),
});

type FormValues = z.infer<typeof formSchema>;

const INPUT_CLASS =
  "w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-[13.5px] text-ink placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function NewCollectionForm() {
  const router = useRouter();
  const [heroOptions, setHeroOptions] = useState<HeroOption[]>([]);
  const [heroIds, setHeroIds] = useState<string[]>([]);
  const [prohibited, setProhibited] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      market: "",
      season: "",
      climate: "",
      audience: "",
      priceTier: "contemporary",
      commercialObjective: "",
      targetGrossMargin: 0.7,
      maxNewProducts: 1,
      allowUnavailableProducts: false,
      notes: "",
    },
  });

  const margin = watch("targetGrossMargin");

  // Hero-product options come from the catalog (best-effort; a setup error just
  // leaves the picker empty rather than blocking collection creation).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await apiRequest<{
          products: Array<{
            id: string;
            title: string;
            analysis: { category?: string } | null;
          }>;
        }>("/api/products");
        if (!active) return;
        setHeroOptions(
          data.products.map((p) => ({
            id: p.id,
            title: p.title,
            category: p.analysis?.category ?? null,
          })),
        );
      } catch {
        // Silent — the picker is optional.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function toggleHero(id: string) {
    setHeroIds((current) =>
      current.includes(id) ? current.filter((h) => h !== id) : [...current, id],
    );
  }

  function addTag() {
    const value = tagDraft.trim();
    if (!value) return;
    if (!prohibited.includes(value)) setProhibited((p) => [...p, value]);
    setTagDraft("");
  }

  const onSubmit = handleSubmit(async (values) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const brief = collectionBriefSchema.parse({
        market: values.market,
        season: values.season,
        climate: values.climate,
        audience: values.audience,
        priceTier: values.priceTier,
        commercialObjective: values.commercialObjective,
        heroProductIds: heroIds,
        prohibitedStyles: prohibited,
        allowUnavailableProducts: values.allowUnavailableProducts,
        maxNewProducts: values.maxNewProducts,
        targetGrossMargin: values.targetGrossMargin,
        notes: values.notes,
      });

      const created = await apiRequest<{ id: string }>("/api/collections", {
        method: "POST",
        body: { name: values.name, brief },
      });
      toast.success("Collection created.");
      router.push(`/app/collections/${created.id}`);
    } catch (error) {
      toast.error(errorMessage(error));
      setSubmitting(false);
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-[18px]" noValidate>
      <Card className="flex flex-col gap-5 p-6">
        <Field label="Collection name" error={errors.name?.message} htmlFor="cb-name">
          <input
            id="cb-name"
            placeholder="e.g. Coastal Linen — Resort 2027"
            className={cn(INPUT_CLASS, errors.name && "border-[#C4271B]")}
            {...register("name")}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Market" error={errors.market?.message} htmlFor="cb-market">
            <input
              id="cb-market"
              placeholder="e.g. Singapore"
              className={cn(INPUT_CLASS, errors.market && "border-[#C4271B]")}
              {...register("market")}
            />
          </Field>
          <Field label="Season" error={errors.season?.message} htmlFor="cb-season">
            <input
              id="cb-season"
              placeholder="e.g. Resort 2027"
              className={cn(INPUT_CLASS, errors.season && "border-[#C4271B]")}
              {...register("season")}
            />
          </Field>
          <Field label="Climate" error={errors.climate?.message} htmlFor="cb-climate">
            <input
              id="cb-climate"
              placeholder="e.g. Hot & humid"
              className={cn(INPUT_CLASS, errors.climate && "border-[#C4271B]")}
              {...register("climate")}
            />
          </Field>
          <Field label="Audience" error={errors.audience?.message} htmlFor="cb-audience">
            <input
              id="cb-audience"
              placeholder="e.g. Creative professionals, 28–40"
              className={cn(INPUT_CLASS, errors.audience && "border-[#C4271B]")}
              {...register("audience")}
            />
          </Field>
          <Field label="Price tier" error={errors.priceTier?.message} htmlFor="cb-tier">
            <input
              id="cb-tier"
              placeholder="e.g. Contemporary"
              className={cn(INPUT_CLASS, errors.priceTier && "border-[#C4271B]")}
              {...register("priceTier")}
            />
          </Field>
        </div>

        <Field
          label="Commercial objective"
          error={errors.commercialObjective?.message}
          htmlFor="cb-objective"
        >
          <textarea
            id="cb-objective"
            rows={2}
            placeholder="What should this collection achieve commercially?"
            className={cn(INPUT_CLASS, "resize-none", errors.commercialObjective && "border-[#C4271B]")}
            {...register("commercialObjective")}
          />
        </Field>
      </Card>

      <Card className="flex flex-col gap-5 p-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="cb-margin" className="text-[12.5px] font-semibold text-ink2">
            Target gross margin ·{" "}
            <span className="tabular-nums text-ink">{pct(margin ?? 0.7)}</span>
          </label>
          <input
            id="cb-margin"
            type="range"
            min={0}
            max={0.95}
            step={0.05}
            className="w-full accent-[var(--color-accent)]"
            {...register("targetGrossMargin", { valueAsNumber: true })}
          />
          <p className="text-[11.5px] text-muted">
            Drives the maximum landed cost for any new product — retail × (1 −
            margin).
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cb-maxnew" className="text-[12.5px] font-semibold text-ink2">
              New products allowed
            </label>
            <select
              id="cb-maxnew"
              className={cn(INPUT_CLASS, "appearance-none")}
              {...register("maxNewProducts", { valueAsNumber: true })}
            >
              <option value={0}>None — style existing catalog only</option>
              <option value={1}>One — allow the gap designer to add one</option>
            </select>
          </div>
          <label
            htmlFor="cb-allowunavailable"
            className="flex items-center gap-2.5 pt-7 text-[13px] text-ink2"
          >
            <input
              id="cb-allowunavailable"
              type="checkbox"
              className="size-4 accent-[var(--color-accent)]"
              {...register("allowUnavailableProducts")}
            />
            Allow out-of-stock products in outfits
          </label>
        </div>
      </Card>

      <Card className="flex flex-col gap-5 p-6">
        <div className="flex flex-col gap-2">
          <span className="text-[12.5px] font-semibold text-ink2">
            Hero products (optional)
          </span>
          <p className="text-[11.5px] text-muted">
            The pieces the collection should be built around. Curation keeps at
            least one hero when possible.
          </p>
          {heroOptions.length === 0 ? (
            <p className="text-[13px] text-muted">No products in the catalog yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {heroOptions.map((product) => {
                const selected = heroIds.includes(product.id);
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => toggleHero(product.id)}
                    aria-pressed={selected}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                      selected
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-line text-ink2 hover:border-ink3 hover:text-ink",
                    )}
                  >
                    {product.title}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="cb-prohibited" className="text-[12.5px] font-semibold text-ink2">
            Prohibited styles (optional)
          </label>
          <div className="flex gap-2">
            <input
              id="cb-prohibited"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="Type a style and press Enter"
              className={INPUT_CLASS}
            />
            <Button type="button" variant="secondary" onClick={addTag}>
              Add
            </Button>
          </div>
          {prohibited.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {prohibited.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-[rgba(120,120,128,0.12)] px-[11px] py-[3px] text-[11.5px] font-medium text-ink2"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => setProhibited((p) => p.filter((t) => t !== tag))}
                    aria-label={`Remove ${tag}`}
                    className="ml-0.5 text-muted hover:text-ink"
                  >
                    <Icon name="x" size={12} strokeWidth={2.2} />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="cb-notes" className="text-[12.5px] font-semibold text-ink2">
            Notes (optional)
          </label>
          <textarea
            id="cb-notes"
            rows={2}
            className={cn(INPUT_CLASS, "resize-none")}
            {...register("notes")}
          />
        </div>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button type="submit" loading={submitting}>
          Create collection
          <Icon name="arrow-right" size={16} strokeWidth={2} />
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Small presentational field helpers (native inputs styled with tokens).
// ---------------------------------------------------------------------------

function Field({
  label,
  error,
  htmlFor,
  children,
}: {
  label: string;
  error?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[12.5px] font-semibold text-ink2">
        {label}
      </label>
      {children}
      {error ? <p className="text-[11.5px] text-[#C4271B]">{error}</p> : null}
    </div>
  );
}
