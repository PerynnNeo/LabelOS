"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { apiRequest, errorMessage } from "@/app/app/_lib/api-client";

/**
 * Collection brief form. Builds a payload matching collectionBriefSchema and
 * creates the collection via POST /api/collections, then routes into the
 * Collection Studio. Hero selection and prohibited-style tags are managed as
 * local state alongside the react-hook-form text fields.
 */

export interface HeroOption {
  id: string;
  title: string;
  category: string | null;
}

const schema = z.object({
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

type FormValues = z.infer<typeof schema>;

interface CreatedCollection {
  id: string;
}

export function CollectionBriefForm({ products }: { products: HeroOption[] }) {
  const router = useRouter();
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
    resolver: zodResolver(schema),
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

  function toggleHero(id: string) {
    setHeroIds((current) =>
      current.includes(id)
        ? current.filter((h) => h !== id)
        : [...current, id],
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
      const created = await apiRequest<CreatedCollection>("/api/collections", {
        method: "POST",
        body: {
          name: values.name,
          brief: {
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
          },
        },
      });
      toast.success("Collection created.");
      router.push(`/app/collections/${created.id}`);
    } catch (error) {
      toast.error(errorMessage(error));
      setSubmitting(false);
    }
  });

  function field(name: keyof FormValues, label: string, placeholder?: string) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`cb-${name}`} required>
          {label}
        </Label>
        <Input
          id={`cb-${name}`}
          placeholder={placeholder}
          invalid={Boolean(errors[name])}
          {...register(name)}
        />
        {errors[name] ? (
          <p className="text-xs text-danger">{String(errors[name]?.message)}</p>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <Card className="flex flex-col gap-5 p-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cb-name" required>
            Collection name
          </Label>
          <Input
            id="cb-name"
            placeholder="e.g. Coastal Linen — Resort 2027"
            invalid={Boolean(errors.name)}
            {...register("name")}
          />
          {errors.name ? (
            <p className="text-xs text-danger">{errors.name.message}</p>
          ) : null}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {field("market", "Market", "e.g. Singapore")}
          {field("season", "Season", "e.g. Resort 2027")}
          {field("climate", "Climate", "e.g. Hot & humid")}
          {field("audience", "Audience", "e.g. Creative professionals, 28–40")}
          {field("priceTier", "Price tier", "e.g. Contemporary")}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cb-objective" required>
            Commercial objective
          </Label>
          <Textarea
            id="cb-objective"
            rows={2}
            placeholder="What should this collection achieve commercially?"
            invalid={Boolean(errors.commercialObjective)}
            {...register("commercialObjective")}
          />
          {errors.commercialObjective ? (
            <p className="text-xs text-danger">
              {errors.commercialObjective.message}
            </p>
          ) : null}
        </div>
      </Card>

      <Card className="flex flex-col gap-5 p-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor="cb-margin">
            Target gross margin ·{" "}
            <span className="tabular-nums text-ink">
              {Math.round((margin ?? 0.7) * 100)}%
            </span>
          </Label>
          <input
            id="cb-margin"
            type="range"
            min={0}
            max={0.95}
            step={0.05}
            className="w-full accent-[var(--color-accent)]"
            {...register("targetGrossMargin", { valueAsNumber: true })}
          />
          <p className="text-xs text-muted">
            Drives the maximum landed cost for any new product
            (retail × (1 − margin)).
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cb-maxnew">New products allowed</Label>
            <select
              id="cb-maxnew"
              className="w-full appearance-none border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-2 focus:outline-offset-2 focus:outline-accent"
              {...register("maxNewProducts", { valueAsNumber: true })}
            >
              <option value={0}>None — style existing catalog only</option>
              <option value={1}>One — allow the gap designer to add one</option>
            </select>
          </div>
          <div className="flex items-center gap-2 pt-7">
            <input
              id="cb-allowunavailable"
              type="checkbox"
              className="size-4 accent-[var(--color-accent)]"
              {...register("allowUnavailableProducts")}
            />
            <Label htmlFor="cb-allowunavailable" className="font-normal">
              Allow out-of-stock products in outfits
            </Label>
          </div>
        </div>
      </Card>

      <Card className="flex flex-col gap-5 p-6">
        <div className="flex flex-col gap-2">
          <Label>Hero products (optional)</Label>
          <p className="text-xs text-muted">
            The pieces the collection should be built around. Curation keeps at
            least one hero when possible.
          </p>
          {products.length === 0 ? (
            <p className="text-sm text-muted">
              No products in the catalog yet.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {products.map((product) => {
                const selected = heroIds.includes(product.id);
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => toggleHero(product.id)}
                    aria-pressed={selected}
                    className={cn(
                      "border px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                      selected
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-line text-muted hover:border-ink hover:text-ink",
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
          <Label htmlFor="cb-prohibited">Prohibited styles (optional)</Label>
          <div className="flex gap-2">
            <Input
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
            />
            <Button type="button" variant="secondary" onClick={addTag}>
              Add
            </Button>
          </div>
          {prohibited.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {prohibited.map((tag) => (
                <Badge key={tag} variant="neutral">
                  {tag}
                  <button
                    type="button"
                    onClick={() =>
                      setProhibited((p) => p.filter((t) => t !== tag))
                    }
                    aria-label={`Remove ${tag}`}
                    className="ml-0.5 text-muted hover:text-ink"
                  >
                    <X aria-hidden className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cb-notes">Notes (optional)</Label>
          <Textarea id="cb-notes" rows={2} {...register("notes")} />
        </div>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button type="submit" loading={submitting}>
          Create collection
        </Button>
      </div>
    </form>
  );
}
