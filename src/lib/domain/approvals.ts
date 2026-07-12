import {
  productionStageSchema,
  type ApprovalStatus,
  type ProductionStage,
} from "@/lib/domain/schemas";

/**
 * Deterministic approval and production-board rules.
 *
 * Expensive or public actions require an explicit human approval record.
 * These helpers are pure so routes can enforce the gate consistently and
 * unit tests can verify it directly.
 */

/**
 * Actions that must never execute without an approved approval record,
 * mapped to a human-readable description used in error messages and the UI.
 */
export const APPROVAL_REQUIRED_ACTIONS = {
  CREATE_SHOPIFY_DRAFT: "create a draft product in your Shopify store",
  PUBLISH_SHOPIFY: "publish to your public Shopify sales channel",
} as const;

export type ApprovalRequiredAction = keyof typeof APPROVAL_REQUIRED_ACTIONS;

/** Thrown when an approval-gated action is attempted without a granted approval. */
export class ApprovalRequiredError extends Error {
  readonly code = "APPROVAL_REQUIRED" as const;
  readonly action: ApprovalRequiredAction;

  constructor(action: ApprovalRequiredAction, message: string) {
    super(message);
    this.name = "ApprovalRequiredError";
    this.action = action;
  }
}

/**
 * Assert that an approval record exists and is approved for the given action.
 *
 * @throws ApprovalRequiredError with a friendly, actionable message when the
 * record is missing, still pending, or was rejected.
 */
export function assertApprovalGranted(
  approval: { status: ApprovalStatus } | null | undefined,
  action: ApprovalRequiredAction,
): void {
  const description = APPROVAL_REQUIRED_ACTIONS[action];

  if (!approval) {
    throw new ApprovalRequiredError(
      action,
      `This step would ${description}, which needs your explicit approval first. No approval record was found — review the details and approve the action to continue.`,
    );
  }
  if (approval.status === "pending") {
    throw new ApprovalRequiredError(
      action,
      `This step would ${description}, but the approval is still pending. Approve or reject it before continuing.`,
    );
  }
  if (approval.status === "rejected") {
    throw new ApprovalRequiredError(
      action,
      `This step would ${description}, but the approval was rejected. Nothing was sent to Shopify. Create and approve a new approval if you change your mind.`,
    );
  }
  // status === "approved" — allowed.
}

/**
 * The linear production board order:
 * RFQ Draft → Quote Received → Supplier Shortlisted → Sample Requested
 * → Sample Review → Revision Required → Sample Approved
 * → Production Approval Pending
 */
export const PRODUCTION_STAGE_ORDER: readonly ProductionStage[] =
  productionStageSchema.options;

/**
 * Whether a production-board transition is allowed.
 *
 * Rules:
 * - only a move to the IMMEDIATE next stage in the linear order is allowed
 *   (no skipping, no moving backwards, no self-transition);
 * - nothing may advance past PRODUCTION_APPROVAL_PENDING — the MVP never
 *   places production orders or payments, so that stage is terminal and
 *   requires a human decision outside the app.
 */
export function canTransitionProduction(
  from: ProductionStage,
  to: ProductionStage,
): boolean {
  const fromIndex = PRODUCTION_STAGE_ORDER.indexOf(from);
  const toIndex = PRODUCTION_STAGE_ORDER.indexOf(to);
  if (fromIndex < 0 || toIndex < 0) {
    return false;
  }
  if (from === "PRODUCTION_APPROVAL_PENDING") {
    // Terminal for the MVP: no automated advance past the human approval gate.
    return false;
  }
  return toIndex === fromIndex + 1;
}
