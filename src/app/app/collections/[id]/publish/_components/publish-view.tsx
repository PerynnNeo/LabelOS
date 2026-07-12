"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { toast } from "sonner";
import { NextAction, Card, Drawer, Toggle, Icon } from "@/components/lo";
import { money } from "@/lib/ui/tokens";
import { apiRequest, errorMessage } from "@/app/app/_lib/api-client";
import type { ListingPayload } from "@/lib/domain/schemas";

/**
 * Store & Publish — client flow (Collection Studio stage 6).
 *
 * Enforces the three-separate-steps model exactly as the API does: generate a
 * DRAFT-only listing, create hidden Shopify drafts (approval-gated + idempotent)
 * and only then publish, behind a typed "PUBLISH" confirmation and a chosen
 * publication. Every mutation surfaces the ApiResult error message via a toast.
 * No credentials are ever shown — only the exact draft payload and returned GIDs.
 */

// --- API response shapes (mirror the route files) --------------------------

interface DraftPayloadPreview {
  title: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  tags: string[];
  price: number;
  sizeOptions: string[];
  imageUrl: string | null;
  metafields: Array<{
    namespace: string;
    key: string;
    type: string;
    value: string;
  }>;
}

interface DraftPreviewResponse {
  payload: DraftPayloadPreview | null;
  mode: "mock" | "client_credentials";
  approval: { exists: boolean; status: string | null };
  ready: boolean;
}

interface DraftCreateResponse {
  productGid: string;
  collectionGid: string | null;
  adminUrl: string | null;
  mode: "mock" | "client_credentials";
}

interface PublicationsResponse {
  publications: Array<{ id: string; name: string }>;
  mode: "mock" | "client_credentials";
}

interface ApprovalResult {
  approval: { id: string; status: string };
  created?: boolean;
}

// --- Checklist derivation --------------------------------------------------

type CheckState = "ok" | "review" | "missing";

const CHECK_TONE: Record<CheckState, { fg: string; bg: string; badge: string }> =
  {
    ok: { fg: "#248A3D", bg: "rgba(52,199,89,0.14)", badge: "Ready" },
    review: { fg: "#B25000", bg: "rgba(255,149,0,0.14)", badge: "Review" },
    missing: { fg: "#C4271B", bg: "rgba(255,59,48,0.14)", badge: "Missing" },
  };

interface CheckItem {
  label: string;
  state: CheckState;
}

function buildChecklist(
  listing: ListingPayload | null,
  collectionName: string,
  draftsCreated: boolean,
  published: boolean,
  isPublic: boolean,
): CheckItem[] {
  const sizes = listing?.sizeOptions ?? [];
  const variantLabel =
    sizes.length > 0
      ? `Variants (${sizes[0]}–${sizes[sizes.length - 1]})`
      : "Variants";
  const has = (v: unknown) => Boolean(v);
  return [
    { label: "Product title", state: has(listing?.title) ? "ok" : "missing" },
    {
      label: "Description",
      state: has(listing?.shortDescription || listing?.htmlDescription)
        ? "ok"
        : "missing",
    },
    { label: "Images", state: has(listing?.imageUrl) ? "ok" : "review" },
    { label: variantLabel, state: sizes.length > 0 ? "ok" : "missing" },
    { label: "SKU values", state: draftsCreated ? "ok" : "review" },
    {
      label: "Prices",
      state: listing && listing.price > 0 ? "ok" : "missing",
    },
    { label: "Inventory state", state: "review" },
    {
      label: "Product status: draft",
      state: listing ? "ok" : "missing",
    },
    { label: `Collection: ${collectionName}`, state: "ok" },
    {
      label: "Sales channel: Online Store",
      state: published ? "ok" : "review",
    },
    { label: "Product links", state: draftsCreated ? "ok" : "review" },
    { label: "Lookbook entry", state: isPublic ? "ok" : "review" },
    {
      label: "Fibre content confirmed",
      state:
        listing?.materialInformationStatus === "verified" ? "ok" : "review",
    },
    { label: "Warnings reviewed", state: "review" },
  ];
}

// --- Approval helper -------------------------------------------------------

/** Request an approval and auto-approve it (single-owner demo flow). */
async function ensureApproval(
  designId: string,
  action: "CREATE_SHOPIFY_DRAFT" | "PUBLISH_SHOPIFY",
): Promise<void> {
  const res = await apiRequest<ApprovalResult>("/api/approvals", {
    method: "POST",
    body: { entityType: "design", entityId: designId, action },
  });
  if (res.approval.status === "pending") {
    await apiRequest<ApprovalResult>(`/api/approvals/${res.approval.id}`, {
      method: "PATCH",
      body: {
        decision: "approved",
        note: "Approved by owner (single-owner demo).",
      },
    });
  }
}

// --- Small building blocks -------------------------------------------------

function Spinner() {
  return (
    <span
      aria-hidden
      className="size-4 flex-none animate-[lo-spin_0.7s_linear_infinite] rounded-full border-2 border-current border-t-transparent"
    />
  );
}

export interface PublishViewProps {
  collectionId: string;
  collectionName: string;
  collectionSlug: string;
  isPublic: boolean;
  shopifyMode: "mock" | "client_credentials";
  design: {
    id: string;
    name: string;
    shopifyProductGid: string | null;
    listing: ListingPayload | null;
  };
}

export function PublishView({
  collectionId,
  collectionName,
  collectionSlug,
  isPublic: initialPublic,
  shopifyMode,
  design,
}: PublishViewProps) {
  const designId = design.id;

  const [listing, setListing] = useState<ListingPayload | null>(design.listing);
  const [shopifyProductGid, setShopifyProductGid] = useState<string | null>(
    design.shopifyProductGid,
  );
  const [collectionGid, setCollectionGid] = useState<string | null>(null);
  const [adminUrl, setAdminUrl] = useState<string | null>(null);
  const [justPublished, setJustPublished] = useState(false);
  const [isPublic, setIsPublic] = useState(initialPublic);

  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingLookbook, setSavingLookbook] = useState(false);

  // Preview drawer
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPayload, setPreviewPayload] = useState<DraftPayloadPreview | null>(
    null,
  );
  const [previewMode, setPreviewMode] = useState<
    "mock" | "client_credentials"
  >(shopifyMode);

  // Publish modal
  const [publishOpen, setPublishOpen] = useState(false);
  const [pubLoading, setPubLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publications, setPublications] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [selectedPublicationId, setSelectedPublicationId] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const confirmInputRef = useRef<HTMLInputElement | null>(null);

  const draftsCreated = Boolean(shopifyProductGid);
  const checklist = buildChecklist(
    listing,
    collectionName,
    draftsCreated,
    justPublished,
    isPublic,
  );
  const missingCount = checklist.filter((c) => c.state === "missing").length;
  const reviewCount = checklist.filter((c) => c.state === "review").length;
  const publishReady = missingCount === 0 && Boolean(listing);
  const canPublish = draftsCreated && publishReady && !justPublished;
  const checklistReadyLabel =
    missingCount > 0
      ? `${missingCount} blocking`
      : reviewCount > 0
        ? `${reviewCount} to review`
        : "All ready";

  const lookbookHref = `/lookbook/${collectionSlug}`;

  // --- Actions -------------------------------------------------------------

  const generateListing = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await apiRequest<{ listing: ListingPayload }>(
        `/api/designs/${designId}/listing`,
        { method: "POST" },
      );
      setListing(res.listing);
      toast.success("Product listing generated (draft, DRAFT-only).");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setGenerating(false);
    }
  }, [designId]);

  const createDrafts = useCallback(async () => {
    if (!listing) {
      toast.error("Generate the product listing first.");
      return;
    }
    setCreating(true);
    try {
      await ensureApproval(designId, "CREATE_SHOPIFY_DRAFT");
      const res = await apiRequest<DraftCreateResponse>(
        `/api/designs/${designId}/shopify/draft`,
        { method: "POST" },
      );
      setShopifyProductGid(res.productGid);
      setCollectionGid(res.collectionGid);
      setAdminUrl(res.adminUrl);
      toast.success("Hidden Shopify drafts created — nothing is public yet.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setCreating(false);
    }
  }, [designId, listing]);

  const openPreview = useCallback(async () => {
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewPayload(null);
    try {
      const res = await apiRequest<DraftPreviewResponse>(
        `/api/designs/${designId}/shopify/draft`,
      );
      setPreviewPayload(res.payload);
      setPreviewMode(res.mode);
    } catch (error) {
      toast.error(errorMessage(error));
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  }, [designId]);

  const openPublishModal = useCallback(async () => {
    setPublishOpen(true);
    setPubLoading(true);
    setConfirmText("");
    try {
      const res = await apiRequest<PublicationsResponse>(
        `/api/designs/${designId}/shopify/publish`,
      );
      setPublications(res.publications);
      setSelectedPublicationId(res.publications[0]?.id ?? "");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPubLoading(false);
    }
  }, [designId]);

  const confirmPublish = useCallback(async () => {
    if (confirmText !== "PUBLISH" || !selectedPublicationId) return;
    setPublishing(true);
    try {
      await ensureApproval(designId, "PUBLISH_SHOPIFY");
      await apiRequest<{ published: true }>(
        `/api/designs/${designId}/shopify/publish`,
        {
          method: "POST",
          body: {
            publicationId: selectedPublicationId,
            confirmation: "PUBLISH",
          },
        },
      );
      setJustPublished(true);
      setPublishOpen(false);
      toast.success("Published — live to customers.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPublishing(false);
    }
  }, [confirmText, selectedPublicationId, designId]);

  const toggleLookbook = useCallback(
    async (next: boolean) => {
      setSavingLookbook(true);
      try {
        await apiRequest<unknown>(`/api/collections/${collectionId}`, {
          method: "PATCH",
          body: { isPublic: next },
        });
        setIsPublic(next);
        toast.success(
          next ? "Lookbook is now public." : "Lookbook is now private.",
        );
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        setSavingLookbook(false);
      }
    },
    [collectionId],
  );

  useEffect(() => {
    if (publishOpen && !pubLoading) confirmInputRef.current?.focus();
  }, [publishOpen, pubLoading]);

  useEffect(() => {
    if (!publishOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !publishing) setPublishOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [publishOpen, publishing]);

  // --- Hero action ---------------------------------------------------------

  const hero = !listing
    ? {
        title: "Generate the product listing",
        help: "Writes DRAFT-only SEO copy, sizes and a description from the verified tech pack.",
        label: "Generate listing",
        onClick: generateListing,
        loading: generating,
        disabled: false,
      }
    : !draftsCreated
      ? {
          title: "Create your Shopify drafts",
          help: "Creates hidden draft products — nothing is public until you publish.",
          label: "Create Shopify drafts",
          onClick: createDrafts,
          loading: creating,
          disabled: false,
        }
      : {
          title: "Publish the approved products & collection",
          help: "This makes them visible to customers — you will confirm first.",
          label: "Publish collection",
          onClick: openPublishModal,
          loading: pubLoading,
          disabled: !publishReady,
        };

  const publishHint = !listing
    ? "Generate the listing first — drafting stays disabled until a listing exists."
    : !draftsCreated
      ? "Create drafts first — publishing stays disabled until hidden drafts exist."
      : canPublish
        ? "Ready. Publishing asks you to confirm customer visibility before anything goes live."
        : "Resolve blocking items before publishing.";

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Banner / next action */}
      {justPublished ? (
        <div className="flex items-center gap-3.5 rounded-[16px] border border-[rgba(52,199,89,0.3)] bg-[rgba(52,199,89,0.1)] px-[22px] py-[18px]">
          <div className="flex size-11 flex-none items-center justify-center rounded-[12px] bg-[#34C759] text-white">
            <Icon name="check" size={24} strokeWidth={2.4} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-bold text-[#1B7A34]">
              Published — live to customers
            </div>
            <div className="mt-0.5 text-[13px] text-[#2E6B3E]">
              The {collectionName} collection and its products are now visible on
              your storefront.
            </div>
          </div>
        </div>
      ) : (
        <NextAction
          title={hero.title}
          help={hero.help}
          action={{
            label: hero.label,
            onClick: hero.onClick,
            loading: hero.loading,
            disabled: hero.disabled,
          }}
        />
      )}

      <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[1.3fr_1fr]">
        {/* Publication checklist */}
        <Card className="p-[18px_20px]">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex-1 text-[15px] font-[650] text-ink">
              Publication checklist
            </div>
            <span className="text-[11.5px] text-muted">
              {checklistReadyLabel}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">
            {checklist.map((c) => {
              const tone = CHECK_TONE[c.state];
              return (
                <div
                  key={c.label}
                  className="flex items-center gap-[9px] border-b border-[rgba(0,0,0,0.05)] py-[7px]"
                >
                  <span
                    aria-hidden
                    className="size-2 flex-none rounded-full"
                    style={{ background: tone.fg }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink2">
                    {c.label}
                  </span>
                  <span
                    className="flex-none rounded-full px-2 py-[2px] text-[10.5px] font-semibold leading-none"
                    style={{ color: tone.fg, background: tone.bg }}
                  >
                    {tone.badge}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Steps + lookbook */}
        <div className="flex flex-col gap-[14px]">
          <Card className="p-[18px_20px]">
            <div className="mb-1 text-[14.5px] font-[650] text-ink">
              Three separate steps
            </div>
            <div className="mb-[14px] text-[12px] leading-relaxed text-muted">
              Creating drafts never makes anything public. Publishing is a
              distinct, confirmed action.
            </div>

            {/* 1 — Create drafts */}
            <button
              type="button"
              onClick={createDrafts}
              disabled={!listing || draftsCreated || creating}
              className="mb-[9px] inline-flex h-[42px] w-full items-center justify-center gap-2 rounded-[11px] text-[13.5px] font-[600] transition disabled:cursor-not-allowed enabled:hover:brightness-[0.97]"
              style={
                draftsCreated
                  ? { background: "rgba(52,199,89,0.14)", color: "#248A3D" }
                  : !listing
                    ? { background: "rgba(120,120,128,0.14)", color: "#AEAEB2" }
                    : { background: "#0A84FF", color: "#fff" }
              }
            >
              {creating ? (
                <Spinner />
              ) : draftsCreated ? (
                <Icon name="check" size={16} strokeWidth={2.4} />
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M3 9h18" />
                </svg>
              )}
              {draftsCreated ? "Drafts created (hidden)" : "Create Shopify drafts"}
            </button>

            {/* 2 — Preview drafts */}
            <button
              type="button"
              onClick={openPreview}
              disabled={!listing}
              className="mb-[9px] inline-flex h-[42px] w-full items-center justify-center gap-2 rounded-[11px] border border-[rgba(0,0,0,0.14)] bg-surface text-[13.5px] font-[600] text-ink transition enabled:hover:bg-[#FAFAFA] disabled:cursor-not-allowed disabled:text-faint"
            >
              <Icon name="eye" size={16} strokeWidth={1.8} />
              Preview Shopify drafts
            </button>

            {/* 3 — Publish */}
            <button
              type="button"
              onClick={openPublishModal}
              disabled={!canPublish}
              className="inline-flex h-[42px] w-full items-center justify-center gap-2 rounded-[11px] text-[13.5px] font-[650] transition disabled:cursor-not-allowed enabled:hover:brightness-[0.97]"
              style={
                canPublish
                  ? { background: "#248A3D", color: "#fff" }
                  : { background: "rgba(120,120,128,0.18)", color: "#AEAEB2" }
              }
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
              Publish approved products &amp; collection
            </button>

            <div className="mt-[11px] text-[11px] leading-snug text-muted">
              {publishHint}
            </div>

            {draftsCreated ? (
              <div className="mt-3 rounded-[11px] border border-[rgba(0,0,0,0.06)] bg-[#FAFAFA] p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.03em] text-muted">
                  Draft product
                </div>
                <div className="mt-1 break-all font-mono text-[11px] text-ink2">
                  {shopifyProductGid}
                </div>
                {collectionGid ? (
                  <>
                    <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.03em] text-muted">
                      Draft collection
                    </div>
                    <div className="mt-1 break-all font-mono text-[11px] text-ink2">
                      {collectionGid}
                    </div>
                  </>
                ) : null}
                {adminUrl ? (
                  <a
                    href={adminUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-accent hover:underline"
                  >
                    Open in Shopify admin
                    <Icon name="arrow-right" size={13} strokeWidth={2} />
                  </a>
                ) : null}
              </div>
            ) : null}
          </Card>

          {/* Lookbook visibility */}
          <Card className="p-[18px_20px]">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-[600] text-ink">
                  Make lookbook public
                </div>
                <div className="mt-0.5 text-[12px] leading-snug text-muted">
                  Publishes a LabelOS-hosted lookbook at{" "}
                  <span className="font-mono text-[11px]">{lookbookHref}</span> —
                  read-only editorial, no checkout.
                </div>
              </div>
              <Toggle
                checked={isPublic}
                disabled={savingLookbook}
                onChange={toggleLookbook}
                label="Make lookbook public"
              />
            </div>
            {isPublic ? (
              <a
                href={lookbookHref}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-accent hover:underline"
              >
                <Icon name="eye" size={14} strokeWidth={1.8} />
                View public lookbook
              </a>
            ) : null}
          </Card>
        </div>
      </div>

      {/* Draft payload preview drawer */}
      <Drawer
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Shopify draft preview"
        subtitle={`Draft-only · ${previewMode} provider · no credentials shown`}
        headerRight={
          <span className="rounded-full bg-[rgba(255,149,0,0.14)] px-[9px] py-[3px] text-[11px] font-semibold text-[#B25000]">
            {previewMode === "mock" ? "MOCK" : "DRAFT"}
          </span>
        }
      >
        {previewLoading ? (
          <div className="flex flex-col items-center gap-3 py-16 text-muted">
            <span className="size-8 animate-[lo-spin_0.8s_linear_infinite] rounded-full border-[3px] border-[rgba(10,132,255,0.22)] border-t-accent" />
            <span className="text-[13px]">Loading draft payload…</span>
          </div>
        ) : previewPayload ? (
          <PayloadPreview payload={previewPayload} />
        ) : (
          <div className="py-16 text-center text-[13px] text-muted">
            No payload yet. Generate the product listing first.
          </div>
        )}
      </Drawer>

      {/* Publish confirmation modal (typed PUBLISH + publication) */}
      {publishOpen ? (
        <PublishModal
          collectionName={collectionName}
          publications={publications}
          pubLoading={pubLoading}
          selectedPublicationId={selectedPublicationId}
          onSelectPublication={setSelectedPublicationId}
          confirmText={confirmText}
          onConfirmTextChange={setConfirmText}
          confirmInputRef={confirmInputRef}
          publishing={publishing}
          onCancel={() => setPublishOpen(false)}
          onConfirm={confirmPublish}
        />
      ) : null}
    </div>
  );
}

// --- Payload preview -------------------------------------------------------

function PreviewRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-[rgba(0,0,0,0.05)] px-4 py-[11px] text-[13px]">
      <span className="flex-none text-muted">{label}</span>
      <span className="text-right font-semibold text-ink">{value}</span>
    </div>
  );
}

function ChipRow({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="text-faint">—</span>;
  return (
    <span className="flex flex-wrap justify-end gap-[6px]">
      {items.map((t) => (
        <span
          key={t}
          className="rounded-full bg-[rgba(120,120,128,0.12)] px-[9px] py-[2px] text-[11px] font-medium text-ink2"
        >
          {t}
        </span>
      ))}
    </span>
  );
}

function PayloadPreview({ payload }: { payload: DraftPayloadPreview }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[11px] border border-[rgba(255,149,0,0.22)] bg-[rgba(255,149,0,0.09)] px-3.5 py-3 text-[11.5px] leading-relaxed text-[#7A4A00]">
        <b className="font-[650]">This is the exact draft payload.</b> It creates
        a hidden product with status DRAFT — never live, never any credentials.
      </div>

      <div className="lo-card overflow-hidden">
        <div className="px-4 pb-2 pt-3 text-[13px] font-[650] text-ink">
          Product
        </div>
        <PreviewRow label="Title" value={payload.title} />
        <PreviewRow label="Vendor" value={payload.vendor} />
        <PreviewRow label="Product type" value={payload.productType} />
        <PreviewRow label="Price" value={money(payload.price)} />
        <PreviewRow label="Status" value="DRAFT" />
        <PreviewRow
          label="Sizes"
          value={<ChipRow items={payload.sizeOptions} />}
        />
        <PreviewRow label="Tags" value={<ChipRow items={payload.tags} />} />
        <PreviewRow
          label="Image"
          value={
            payload.imageUrl ? (
              <span className="break-all font-mono text-[11px]">
                {payload.imageUrl}
              </span>
            ) : (
              "flat sketch / none"
            )
          }
        />
      </div>

      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.03em] text-muted">
          Description HTML (sanitised)
        </div>
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-[11px] border border-[rgba(0,0,0,0.07)] bg-[#FAFAFA] p-3 font-mono text-[11px] leading-relaxed text-ink2">
          {payload.descriptionHtml}
        </pre>
      </div>

      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.03em] text-muted">
          Metafields
        </div>
        <div className="lo-card overflow-hidden">
          {payload.metafields.map((m) => (
            <div
              key={`${m.namespace}.${m.key}`}
              className="flex items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.05)] px-4 py-[9px] text-[12px] last:border-b-0"
            >
              <span className="font-mono text-[11px] text-muted">
                {m.namespace}.{m.key}
              </span>
              <span className="font-semibold text-ink2">{m.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Publish modal ---------------------------------------------------------

interface PublishModalProps {
  collectionName: string;
  publications: Array<{ id: string; name: string }>;
  pubLoading: boolean;
  selectedPublicationId: string;
  onSelectPublication: (id: string) => void;
  confirmText: string;
  onConfirmTextChange: (value: string) => void;
  confirmInputRef: RefObject<HTMLInputElement | null>;
  publishing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function PublishModal({
  collectionName,
  publications,
  pubLoading,
  selectedPublicationId,
  onSelectPublication,
  confirmText,
  onConfirmTextChange,
  confirmInputRef,
  publishing,
  onCancel,
  onConfirm,
}: PublishModalProps) {
  const noChannels = !pubLoading && publications.length === 0;
  const confirmDisabled =
    publishing ||
    pubLoading ||
    noChannels ||
    confirmText !== "PUBLISH" ||
    !selectedPublicationId;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] animate-[lo-fade_0.18s_ease] bg-black/[0.34]"
        onClick={publishing ? undefined : onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Publish to your live storefront"
        className="fixed left-1/2 top-1/2 z-[61] w-[460px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 animate-[lo-toast_0.24s_ease] rounded-[18px] bg-surface p-[26px] shadow-modal"
      >
        <div className="mb-3.5 flex size-12 items-center justify-center rounded-[13px] bg-[rgba(52,199,89,0.14)] text-[#248A3D]">
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </div>
        <div className="text-[19px] font-bold tracking-[-0.01em] text-ink">
          Publish to your live storefront?
        </div>
        <div className="mt-2 text-[13.5px] leading-relaxed text-ink2">
          This makes the <b>{collectionName}</b> collection and its products{" "}
          <b className="text-[#1B7A34]">visible to customers</b> on your Shopify
          store. Draft-only safety still applies to any sampling item until you
          configure it.
        </div>

        {/* Publication */}
        <label className="mt-[18px] block text-[12px] font-semibold text-ink2">
          Sales channel
        </label>
        {pubLoading ? (
          <div className="mt-1.5 text-[12.5px] text-muted">
            Loading publications…
          </div>
        ) : noChannels ? (
          <div className="mt-1.5 text-[12.5px] text-[#B25000]">
            No publication found. Add an Online Store sales channel in Shopify
            before publishing.
          </div>
        ) : (
          <select
            value={selectedPublicationId}
            onChange={(e) => onSelectPublication(e.target.value)}
            disabled={publishing}
            className="mt-1.5 h-10 w-full rounded-[10px] border border-[rgba(0,0,0,0.14)] bg-surface px-3 text-[13.5px] text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            {publications.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}

        {/* Typed confirmation */}
        <label
          htmlFor="publish-confirm"
          className="mt-3.5 block text-[12px] font-semibold text-ink2"
        >
          Type <span className="font-mono text-accent">PUBLISH</span> to confirm
        </label>
        <input
          id="publish-confirm"
          ref={confirmInputRef}
          value={confirmText}
          onChange={(e) => onConfirmTextChange(e.target.value)}
          disabled={publishing}
          autoComplete="off"
          spellCheck={false}
          placeholder="PUBLISH"
          className="mt-1.5 h-10 w-full rounded-[10px] border border-[rgba(0,0,0,0.14)] bg-surface px-3 font-mono text-[13.5px] tracking-[0.08em] text-ink focus-visible:outline-2 focus-visible:outline-accent"
        />

        <div className="mt-[22px] flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={publishing}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-[12px] border border-[rgba(0,0,0,0.14)] bg-surface text-[14px] font-semibold text-ink transition hover:bg-[#FAFAFA] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[12px] bg-[#248A3D] text-[14px] font-[650] text-white transition hover:brightness-[0.96] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {publishing ? <Spinner /> : null}
            Yes, publish
          </button>
        </div>
      </div>
    </>
  );
}
