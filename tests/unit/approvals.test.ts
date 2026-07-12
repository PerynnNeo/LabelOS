import { describe, it, expect } from "vitest";
import {
  assertApprovalGranted,
  ApprovalRequiredError,
  canTransitionProduction,
  PRODUCTION_STAGE_ORDER,
} from "@/lib/domain/approvals";
import type { ProductionStage } from "@/lib/domain/schemas";

describe("assertApprovalGranted", () => {
  it("throws when there is no approval record", () => {
    expect(() => assertApprovalGranted(null, "CREATE_SHOPIFY_DRAFT")).toThrow(
      ApprovalRequiredError,
    );
    expect(() =>
      assertApprovalGranted(undefined, "CREATE_SHOPIFY_DRAFT"),
    ).toThrow(ApprovalRequiredError);
  });

  it("throws when the approval is still pending", () => {
    expect(() =>
      assertApprovalGranted({ status: "pending" }, "PUBLISH_SHOPIFY"),
    ).toThrow(ApprovalRequiredError);
  });

  it("throws when the approval was rejected", () => {
    expect(() =>
      assertApprovalGranted({ status: "rejected" }, "PUBLISH_SHOPIFY"),
    ).toThrow(ApprovalRequiredError);
  });

  it("passes for an approved record", () => {
    expect(() =>
      assertApprovalGranted({ status: "approved" }, "CREATE_SHOPIFY_DRAFT"),
    ).not.toThrow();
  });

  it("carries the action code on the thrown error", () => {
    try {
      assertApprovalGranted(null, "PUBLISH_SHOPIFY");
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ApprovalRequiredError);
      expect((error as ApprovalRequiredError).code).toBe("APPROVAL_REQUIRED");
      expect((error as ApprovalRequiredError).action).toBe("PUBLISH_SHOPIFY");
    }
  });
});

describe("canTransitionProduction — linear board", () => {
  it("allows every immediate forward step", () => {
    for (let i = 0; i < PRODUCTION_STAGE_ORDER.length - 1; i += 1) {
      const from = PRODUCTION_STAGE_ORDER[i];
      const to = PRODUCTION_STAGE_ORDER[i + 1];
      expect(canTransitionProduction(from, to)).toBe(true);
    }
  });

  it("forbids skipping a stage", () => {
    expect(
      canTransitionProduction("RFQ_DRAFT", "SUPPLIER_SHORTLISTED"),
    ).toBe(false);
    expect(
      canTransitionProduction("RFQ_DRAFT", "SAMPLE_APPROVED"),
    ).toBe(false);
  });

  it("forbids moving backwards", () => {
    expect(
      canTransitionProduction("QUOTE_RECEIVED", "RFQ_DRAFT"),
    ).toBe(false);
  });

  it("forbids a self-transition", () => {
    expect(canTransitionProduction("SAMPLE_REVIEW", "SAMPLE_REVIEW")).toBe(false);
  });

  it("treats PRODUCTION_APPROVAL_PENDING as terminal", () => {
    // Reaching it is allowed…
    expect(
      canTransitionProduction("SAMPLE_APPROVED", "PRODUCTION_APPROVAL_PENDING"),
    ).toBe(true);
    // …but nothing may advance past it.
    for (const stage of PRODUCTION_STAGE_ORDER) {
      expect(
        canTransitionProduction("PRODUCTION_APPROVAL_PENDING", stage),
      ).toBe(false);
    }
  });

  it("rejects unknown stages", () => {
    expect(
      canTransitionProduction("NOT_A_STAGE" as ProductionStage, "RFQ_DRAFT"),
    ).toBe(false);
  });
});
