import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Maps every domain status value to a Badge variant and a human label.
 *
 *   <StatusBadge kind="analysis" status={product.analysis_status} />
 *   <StatusBadge kind="production" status={rfq.status} />
 *
 * `kind` selects which status vocabulary to interpret. Unknown values fall
 * back to a neutral badge with a humanised label, so a new status never
 * crashes the UI.
 */

export type StatusKind =
  | "analysis"
  | "outfit"
  | "job"
  | "approval"
  | "production"
  | "collection"
  | "supplier";

interface StatusMeta {
  variant: BadgeVariant;
  label: string;
}

type StatusMap = Record<string, StatusMeta>;

const ANALYSIS: StatusMap = {
  pending: { variant: "neutral", label: "Pending" },
  running: { variant: "warning", label: "Analysing" },
  complete: { variant: "success", label: "Analysed" },
  failed: { variant: "danger", label: "Failed" },
};

const OUTFIT: StatusMap = {
  candidate: { variant: "neutral", label: "Candidate" },
  approved: { variant: "success", label: "Approved" },
  rejected: { variant: "danger", label: "Rejected" },
  revised: { variant: "accent", label: "Revised" },
  final: { variant: "success", label: "Final" },
};

const JOB: StatusMap = {
  queued: { variant: "neutral", label: "Queued" },
  running: { variant: "warning", label: "Running" },
  complete: { variant: "success", label: "Complete" },
  failed: { variant: "danger", label: "Failed" },
};

const APPROVAL: StatusMap = {
  pending: { variant: "warning", label: "Pending" },
  approved: { variant: "success", label: "Approved" },
  rejected: { variant: "danger", label: "Rejected" },
};

const PRODUCTION: StatusMap = {
  RFQ_DRAFT: { variant: "neutral", label: "RFQ draft" },
  QUOTE_RECEIVED: { variant: "accent", label: "Quote received" },
  SUPPLIER_SHORTLISTED: { variant: "accent", label: "Shortlisted" },
  SAMPLE_REQUESTED: { variant: "warning", label: "Sample requested" },
  SAMPLE_REVIEW: { variant: "warning", label: "Sample review" },
  REVISION_REQUIRED: { variant: "danger", label: "Revision required" },
  SAMPLE_APPROVED: { variant: "success", label: "Sample approved" },
  PRODUCTION_APPROVAL_PENDING: {
    variant: "warning",
    label: "Awaiting production approval",
  },
};

const COLLECTION: StatusMap = {
  draft: { variant: "neutral", label: "Draft" },
  briefed: { variant: "neutral", label: "Briefed" },
  active: { variant: "accent", label: "Active" },
  curated: { variant: "accent", label: "Curated" },
  ready: { variant: "accent", label: "Ready" },
  published: { variant: "success", label: "Published" },
  archived: { variant: "neutral", label: "Archived" },
};

const SUPPLIER: StatusMap = {
  demo: { variant: "neutral", label: "Demo" },
  lead: { variant: "warning", label: "Lead" },
  contacted: { variant: "accent", label: "Contacted" },
  verified: { variant: "success", label: "Verified" },
};

const MAPS: Record<StatusKind, StatusMap> = {
  analysis: ANALYSIS,
  outfit: OUTFIT,
  job: JOB,
  approval: APPROVAL,
  production: PRODUCTION,
  collection: COLLECTION,
  supplier: SUPPLIER,
};

/** Title-case a raw status token, treating `_`/`-` as spaces. */
function humanize(status: string): string {
  const spaced = status.replace(/[_-]+/g, " ").trim().toLowerCase();
  if (!spaced) return "Unknown";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Resolve a (kind, status) pair to its badge variant and label. */
export function statusBadgeMeta(kind: StatusKind, status: string): StatusMeta {
  return MAPS[kind][status] ?? { variant: "neutral", label: humanize(status) };
}

export interface StatusBadgeProps {
  kind: StatusKind;
  status: string;
  /** Render a leading colour dot. */
  dot?: boolean;
  className?: string;
}

export function StatusBadge({ kind, status, dot, className }: StatusBadgeProps) {
  const { variant, label } = statusBadgeMeta(kind, status);
  return (
    <Badge variant={variant} dot={dot} className={cn(className)}>
      {label}
    </Badge>
  );
}
