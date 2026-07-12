"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type {
  CollectionRow,
  OutfitRow,
  ProductRow,
} from "@/lib/supabase/repositories";
import type { CurationLabel } from "@/lib/domain/schemas";
import type { StudioStageProps } from "./types";
import {
  Button,
  Card,
  EmptyState,
  Icon,
  NextAction,
  OutfitCard,
  Pill,
  StatCell,
  Swatch,
  type OutfitCardActions,
  type OutfitSummary,
} from "@/components/lo";
import { money } from "@/lib/ui/tokens";
import { cn } from "@/lib/utils";
import { ApiError, apiRequest, errorMessage } from "@/app/app/_lib/api-client";

/**
 * Collection Studio — stage 3 (Outfit Plan).
 *
 * Reproduces the mockup's `cs_outfits` block: the Next-action hero, the outfit
 * pipeline stat strip, the "How the AI fixed one look" before → after revision
 * diff, the four pipeline actions (generate / critique / revise / curate) and
 * the tabbed outfit grid. Every mutation flows through the ApiResult envelope,
 * toasts the server message on failure and refreshes the server tree on success.
 *
 * Conforms to the shared StudioStageProps shape (defined + exported here until
 * the studio page's `types.ts` lands — see the concerns in the handoff notes).
 */
type OutfitTab = "all" | "shortlisted" | "review" | "final" | "rejected";

// --- Response payloads for the four pipeline actions (for toast wording) ----
interface GenerateResult {
  created: number;
  dropped: number;
  batches: number;
}
interface CritiqueResult {
  processed: number;
  capped: number;
  counts: { approve: number; revise: number; reject: number };
}
interface ReviseResult {
  revised: Array<{ originalOutfitId: string; revisedOutfitId: string }>;
  skipped: Array<{ outfitId: string; reason: string }>;
  capped: number;
}
interface CurateResult {
  selectedOutfitIds: string[];
  unmetConstraints: string[];
}

/** Shape of the revision context stored on a revised outfit's `generation` JSON. */
interface RevisionGeneration {
  revision?: {
    of?: string;
    summary?: string;
    corrections?: Array<{ reasonCode: string; correction: string }>;
  };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function OutfitsStage({
  collection,
  outfits,
  products,
  designs,
  brandProfile,
  context,
}: StudioStageProps) {
  const router = useRouter();
  const collectionId = context.collectionId;
  const hasDesign = designs.length > 0;
  const [tab, setTab] = useState<OutfitTab>("review");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [busyOutfit, setBusyOutfit] = useState<string | null>(null);

  const currency = brandProfile?.typicalPriceRange?.currency ?? "SGD";
  const running = busyAction !== null || busyOutfit !== null;

  const productsById = useMemo(() => {
    const map = new Map<string, ProductRow>();
    for (const product of products) map.set(product.id, product);
    return map;
  }, [products]);

  const curationLabels = useMemo<Record<string, CurationLabel>>(
    () => collection?.curation_summary?.labels ?? {},
    [collection],
  );

  // Outfits that are the target of a revision — used to gate "Revise" so a look
  // is only revised once (mirrors the revise route's eligibility rule).
  const revisedFromIds = useMemo(() => {
    const set = new Set<string>();
    for (const outfit of outfits) {
      if (outfit.revision_of) set.add(outfit.revision_of);
    }
    return set;
  }, [outfits]);

  // --- Derived pipeline classification -------------------------------------
  const isAiApproved = (o: OutfitRow): boolean =>
    o.status === "approved" ||
    o.status === "final" ||
    o.review?.verdict === "approve";

  const isReviewPending = (o: OutfitRow): boolean =>
    o.status === "candidate" || o.status === "approved";

  const reviseEligible = (o: OutfitRow): boolean =>
    o.review !== null &&
    (o.review.verdict === "revise" || o.review.verdict === "reject") &&
    o.revision_of === null &&
    !revisedFromIds.has(o.id);

  const counts = (() => {
    let generated = 0;
    let shortlisted = 0;
    let passed = 0;
    let revised = 0;
    let review = 0;
    let approved = 0;
    for (const o of outfits) {
      if (o.revision_of === null) generated += 1;
      if (o.review !== null) shortlisted += 1;
      if (isAiApproved(o)) passed += 1;
      if (o.revision_of !== null) revised += 1;
      if (isReviewPending(o)) review += 1;
      if (o.status === "final") approved += 1;
    }
    return { generated, shortlisted, passed, revised, review, approved };
  })();

  // --- Tab filtering --------------------------------------------------------
  const tabFilter: Record<OutfitTab, (o: OutfitRow) => boolean> = {
    all: (o) => o.status !== "rejected",
    shortlisted: (o) => isAiApproved(o),
    review: (o) => isReviewPending(o),
    final: (o) => o.status === "final",
    rejected: (o) => o.status === "rejected",
  };

  const tabDefs: Array<{ id: OutfitTab; label: string; count: number }> = [
    { id: "all", label: "All candidates", count: outfits.filter(tabFilter.all).length },
    { id: "shortlisted", label: "AI shortlisted", count: counts.passed },
    { id: "review", label: "Needs your review", count: counts.review },
    { id: "final", label: "Final collection", count: counts.approved },
    { id: "rejected", label: "Rejected", count: outfits.filter(tabFilter.rejected).length },
  ];

  const visibleOutfits = outfits.filter(tabFilter[tab]);

  // --- Revision diff (first revised look with a resolvable original) --------
  const revisionPair = useMemo(() => {
    for (const revisedOutfit of outfits) {
      if (!revisedOutfit.revision_of) continue;
      const original = outfits.find((o) => o.id === revisedOutfit.revision_of);
      if (original) return { original, revised: revisedOutfit };
    }
    return null;
  }, [outfits]);

  const showRevision = revisionPair !== null && (tab === "all" || tab === "review");

  // --- Pipeline stat cells --------------------------------------------------
  const pipelineCells: Array<{ n: number; label: string; color: string }> = [
    { n: counts.generated, label: "Generated", color: "#1D1D1F" },
    { n: counts.shortlisted, label: "AI shortlisted", color: "#1D1D1F" },
    { n: counts.passed, label: "Passed AI review", color: "#0A6E8F" },
    { n: counts.revised, label: "Revised", color: "#FF9500" },
    { n: counts.review, label: "Your review", color: "#B25000" },
    { n: counts.approved, label: "Owner approved", color: "#248A3D" },
  ];

  // --- Mutations ------------------------------------------------------------
  async function runAction(
    key: string,
    path: string,
    successMessage: (data: unknown) => string,
  ) {
    if (running) return;
    setBusyAction(key);
    try {
      const data = await apiRequest<unknown>(
        `/api/collections/${collectionId}/${path}`,
        { method: "POST", body: {} },
      );
      toast.success(successMessage(data));
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  const generate = () =>
    runAction("generate", "outfits/generate", (data) => {
      const { created } = data as GenerateResult;
      return created > 0
        ? `Generated ${plural(created, "outfit candidate", "outfit candidates")}.`
        : "No new candidates — check that products are analysed and in stock.";
    });

  const critique = () =>
    runAction("critique", "outfits/critique", (data) => {
      const { processed, counts: c, capped } = data as CritiqueResult;
      const fix = c.revise + c.reject;
      const cappedNote = capped > 0 ? ` ${capped} left for the next run.` : "";
      return `Reviewed ${plural(processed, "look", "looks")}: ${c.approve} passed, ${fix} need work.${cappedNote}`;
    });

  const reviseRejected = () =>
    runAction("revise", "outfits/revise", (data) => {
      const { revised, skipped } = data as ReviseResult;
      if (revised.length > 0) {
        return `Revised ${plural(revised.length, "rejected look", "rejected looks")}.`;
      }
      return skipped.length > 0
        ? "Nothing eligible to revise right now."
        : "No rejected looks to revise.";
    });

  const curate = () =>
    runAction("curate", "curate", (data) => {
      const { selectedOutfitIds, unmetConstraints } = data as CurateResult;
      const unmet =
        unmetConstraints.length > 0
          ? ` ${plural(unmetConstraints.length, "constraint", "constraints")} still unmet.`
          : "";
      return `Curated ${plural(selectedOutfitIds.length, "final look", "final looks")}.${unmet}`;
    });

  async function patchOutfitStatus(
    outfitId: string,
    status: "approved" | "rejected",
    successMessage: string,
  ) {
    if (running) return;
    setBusyOutfit(outfitId);
    try {
      // NOTE: this per-outfit PATCH route does not exist yet — see concerns.
      await apiRequest(`/api/collections/${collectionId}/outfits/${outfitId}`, {
        method: "PATCH",
        body: { status },
      });
      toast.success(successMessage);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyOutfit(null);
    }
  }

  async function reviseOne(outfitId: string) {
    if (running) return;
    setBusyOutfit(outfitId);
    try {
      const data = await apiRequest<ReviseResult>(
        `/api/collections/${collectionId}/outfits/revise`,
        { method: "POST", body: { outfitIds: [outfitId] } },
      );
      toast.success(
        data.revised.length > 0
          ? "Revised look ready for review."
          : "This look isn't eligible for revision.",
      );
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyOutfit(null);
    }
  }

  async function approvePlan() {
    if (running) return;
    setBusyAction("plan");
    try {
      if (!hasDesign) {
        try {
          await apiRequest(`/api/collections/${collectionId}/gap`, {
            method: "POST",
            body: {},
          });
          toast.success("Assortment gap identified — drafting a new product.");
        } catch (error) {
          // A pre-existing design (CONFLICT) is fine; anything else is surfaced
          // but should not block navigation to Product Development.
          if (!(error instanceof ApiError && error.code === "CONFLICT")) {
            toast.message(errorMessage(error));
          }
        }
      }
      router.push(`/app/collections/${collectionId}/product`);
    } finally {
      setBusyAction(null);
    }
  }

  // --- Outfit → card summary ------------------------------------------------
  function toSummary(o: OutfitRow): OutfitSummary {
    const items = o.product_ids.map((pid) => {
      const product = productsById.get(pid);
      return { title: product?.title ?? "Unknown item", seed: pid };
    });
    const total = o.product_ids.reduce(
      (sum, pid) => sum + (productsById.get(pid)?.price ?? 0),
      0,
    );
    const rawScore = o.review?.overallScore ?? o.overall_score ?? 0;
    const isFinal = o.status === "final";
    const label = curationLabels[o.id];
    return {
      id: o.id,
      name: o.name || "Untitled look",
      occasion: o.occasion || "Everyday",
      total,
      currency,
      score: Math.round(rawScore * 100),
      curationLabel: isFinal ? label : undefined,
      status: isFinal ? "final" : o.status,
      verdict: isFinal ? undefined : o.review?.verdict,
      items,
    };
  }

  function cardActions(o: OutfitRow): OutfitCardActions | undefined {
    if (o.status === "final") return undefined;
    const loading = busyOutfit === o.id;

    if (o.status === "candidate") {
      return {
        onApprove: () => patchOutfitStatus(o.id, "approved", "Look approved."),
        approveLabel: "Approve look",
        approveVariant: "primary",
        onRemove: () => patchOutfitStatus(o.id, "rejected", "Look removed from the plan."),
        loading,
      };
    }
    if (reviseEligible(o)) {
      return {
        onApprove: () => reviseOne(o.id),
        approveLabel: "Revise look",
        approveVariant: "secondary",
        onRemove: () => patchOutfitStatus(o.id, "rejected", "Look removed from the plan."),
        loading,
      };
    }
    if (o.status === "approved") {
      return {
        onRemove: () => patchOutfitStatus(o.id, "rejected", "Look removed from the plan."),
        loading,
      };
    }
    return undefined;
  }

  // --- Hero copy ------------------------------------------------------------
  const heroTitle =
    counts.passed > 0
      ? `Review the ${counts.passed} shortlisted look${counts.passed === 1 ? "" : "s"}, then approve the plan`
      : "Review the shortlisted looks, then approve the plan";
  const heroHelp =
    counts.review > 0
      ? `${plural(counts.review, "look", "looks")} still need your review — approve each below, or approve the plan to continue.`
      : "Every look has been reviewed — you're ready to continue.";

  const actionButtons: Array<{
    key: string;
    label: string;
    icon: "plus" | "eye" | "refresh" | "check";
    onClick: () => void;
  }> = [
    { key: "generate", label: "Generate candidates", icon: "plus", onClick: generate },
    { key: "critique", label: "Critique all", icon: "eye", onClick: critique },
    { key: "revise", label: "Revise rejected", icon: "refresh", onClick: reviseRejected },
    { key: "curate", label: "Curate final six", icon: "check", onClick: curate },
  ];

  return (
    <div className="flex flex-col gap-4 px-[30px] pb-10 pt-3">
      <NextAction
        title={heroTitle}
        help={heroHelp}
        action={{
          label: "Approve outfit plan & find gaps",
          onClick: approvePlan,
          loading: busyAction === "plan",
          disabled: running && busyAction !== "plan",
        }}
      />

      {/* Pipeline stat strip */}
      <Card className="flex items-center px-2 py-3">
        {pipelineCells.map((cell) => (
          <StatCell key={cell.label} n={cell.n} label={cell.label} color={cell.color} />
        ))}
      </Card>

      {/* Pipeline actions */}
      <div className="flex flex-wrap gap-2">
        {actionButtons.map((action) => (
          <Button
            key={action.key}
            size="sm"
            variant="secondary"
            onClick={action.onClick}
            loading={busyAction === action.key}
            disabled={running && busyAction !== action.key}
          >
            <Icon name={action.icon} size={15} />
            {action.label}
          </Button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-[7px]">
        {tabDefs.map((def) => {
          const active = tab === def.id;
          return (
            <button
              key={def.id}
              type="button"
              onClick={() => setTab(def.id)}
              aria-pressed={active}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-[13px] py-1.5 text-[12.5px] transition",
                active
                  ? "border-transparent bg-accent font-semibold text-white"
                  : "border-[rgba(0,0,0,0.1)] bg-surface font-medium text-ink2 hover:bg-[#FAFAFA]",
              )}
            >
              {def.label}
              <span className={cn("text-[11px]", active ? "opacity-80" : "opacity-60")}>
                {def.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Revision diff */}
      {showRevision && revisionPair ? (
        <RevisionDiff
          original={revisionPair.original}
          revised={revisionPair.revised}
          productsById={productsById}
          currency={currency}
        />
      ) : null}

      {/* Outfit grid */}
      {visibleOutfits.length === 0 ? (
        <Card>
          <EmptyState
            icon="layers"
            title={
              outfits.length === 0
                ? "No outfits yet"
                : "Nothing in this view"
            }
            description={
              outfits.length === 0
                ? "Generate candidate looks from your analysed, in-stock catalog to start the outfit plan."
                : "Switch tabs, or run the pipeline actions above to move looks through review."
            }
            action={
              outfits.length === 0 ? (
                <Button
                  size="sm"
                  onClick={generate}
                  loading={busyAction === "generate"}
                  disabled={running && busyAction !== "generate"}
                >
                  <Icon name="plus" size={15} />
                  Generate candidates
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleOutfits.map((o) => (
            <OutfitCard key={o.id} outfit={toSummary(o)} actions={cardActions(o)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Before → after revision diff ("How the AI fixed one look")
// ---------------------------------------------------------------------------

function RevisionDiff({
  original,
  revised,
  productsById,
  currency,
}: {
  original: OutfitRow;
  revised: OutfitRow;
  productsById: Map<string, ProductRow>;
  currency: string;
}) {
  const title = (pid: string) => productsById.get(pid)?.title ?? "Unknown item";
  const totalOf = (o: OutfitRow) =>
    o.product_ids.reduce((sum, pid) => sum + (productsById.get(pid)?.price ?? 0), 0);

  const originalScore = Math.round(
    (original.review?.overallScore ?? original.overall_score ?? 0) * 100,
  );
  const revisedScore = Math.round(
    (revised.review?.overallScore ?? revised.overall_score ?? 0) * 100,
  );
  const reasonCodes = original.review?.reasonCodes ?? [];
  const changedIds = new Set(
    revised.product_ids.filter((pid) => !original.product_ids.includes(pid)),
  );
  const summary =
    (revised.generation as RevisionGeneration).revision?.summary ??
    "The reviser swapped an item to resolve the review issues.";

  return (
    <Card className="p-[18px]">
      <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.04em] text-muted">
        How the AI fixed one look
      </div>
      <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
        {/* Original (rejected) */}
        <div className="overflow-hidden rounded-[13px] border border-[rgba(255,59,48,0.2)]">
          <div className="flex justify-between bg-[rgba(255,59,48,0.05)] px-[13px] py-[9px] text-[12px] font-bold text-[#C4271B]">
            <span>{original.name || "Original look"} · original</span>
            <span>Score {originalScore}</span>
          </div>
          <div className="flex gap-1.5 p-[11px]">
            {original.product_ids.map((pid) => (
              <Swatch
                key={pid}
                seed={pid}
                label={title(pid)}
                aspect="1/1"
                rounded={8}
                className="flex-1"
              />
            ))}
          </div>
          {reasonCodes.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 px-[13px] pb-3">
              {reasonCodes.map((code) => (
                <span
                  key={code}
                  className="rounded-[6px] bg-[rgba(255,59,48,0.1)] px-[7px] py-0.5 font-mono text-[10px] font-bold text-[#C4271B]"
                >
                  {code}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* Arrow */}
        <div className="flex justify-center">
          <Icon name="arrow-right" size={26} className="text-[#C7C7CC] rotate-90 md:rotate-0" />
        </div>

        {/* Revised */}
        <div className="overflow-hidden rounded-[13px] border border-[rgba(52,199,89,0.28)]">
          <div className="flex justify-between bg-[rgba(52,199,89,0.06)] px-[13px] py-[9px] text-[12px] font-bold text-[#248A3D]">
            <span>Revised → {revised.name || "Revised look"}</span>
            <span>Score {revisedScore}</span>
          </div>
          <div className="flex gap-1.5 p-[11px]">
            {revised.product_ids.map((pid) => {
              const changed = changedIds.has(pid);
              return (
                <div key={pid} className="relative flex-1">
                  <Swatch
                    seed={pid}
                    label={title(pid)}
                    aspect="1/1"
                    rounded={8}
                    className={cn(changed && "ring-2 ring-inset ring-[#34C759]")}
                  />
                  {changed ? (
                    <span
                      aria-label="New item"
                      className="absolute right-1 top-1 flex size-[15px] items-center justify-center rounded-full bg-[#34C759] text-white"
                    >
                      <Icon name="check" size={9} strokeWidth={3.6} />
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="px-[13px] pb-3 text-[11.5px] leading-[1.45] text-ink3">
            {summary} Outfit total {money(totalOf(revised), currency)} · all in stock.
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Pill
          fg="#248A3D"
          bg="rgba(52,199,89,0.14)"
          label="AI-assisted revision"
        />
        <span className="text-[11.5px] text-muted">
          Reviser output — verify the swap before approving.
        </span>
      </div>
    </Card>
  );
}
