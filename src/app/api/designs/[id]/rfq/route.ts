import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api";
import { requireSession } from "@/lib/auth/require-session";
import { logActivity } from "@/lib/logging/activity";
import {
  compareQuotes,
  computeCosting,
  QUOTE_COMPARISON_WEIGHTS,
  type CompareQuotesInput,
} from "@/lib/domain/costing";
import { canTransitionProduction } from "@/lib/domain/approvals";
import {
  costingSchema,
  newDesignSchema,
  productionStageSchema,
  quotePayloadSchema,
  rfqRequestSchema,
  type Costing,
  type GarmentCategory,
  type NewDesign,
  type QuoteComparison,
} from "@/lib/domain/schemas";
import {
  getAppSettings,
  getCollection,
  getDesign,
  getRfq,
  insertRfq,
  listRfqsByDesign,
  listSuppliers,
  updateDesign,
  updateRfq,
  type DesignRow,
  type RfqRow,
} from "@/lib/supabase/repositories";

/**
 * /api/designs/[id]/rfq (spec section 19).
 *
 * POST  — draft RFQ rows for every supplier (or a supplied subset). The request
 *         payload is built deterministically from the design, tech pack, and
 *         code-computed costing; it is never sent automatically.
 * GET   — list RFQs plus a deterministic quote comparison and a recommendation
 *         that cites the transparent weights (the lowest price never auto-wins).
 * PATCH — enter a supplier quote (→ QUOTE_RECEIVED) or advance the production
 *         board one stage, blocked past PRODUCTION_APPROVAL_PENDING.
 */
export const runtime = "nodejs";

const idSchema = z.uuid();

const DEFAULT_SIZE_RANGE = ["XS", "S", "M", "L", "XL"] as const;
const DEFAULT_QUANTITY = 150;

const postSchema = z.object({
  supplierIds: z.array(z.uuid()).optional(),
});

const patchSchema = z
  .object({
    rfqId: z.uuid(),
    quote: quotePayloadSchema.optional(),
    stage: productionStageSchema.optional(),
  })
  .refine((v) => (v.quote !== undefined) !== (v.stage !== undefined), {
    message: "Provide exactly one of: quote (to record a quote) or stage (to advance production).",
  });

/**
 * Representative capability tags per garment category. Matching against a
 * supplier's declared capabilities is exact and case-insensitive (see
 * compareQuotes), and contributes only 15% of the weighted score.
 */
const CATEGORY_CAPABILITIES: Record<GarmentCategory, string[]> = {
  top: ["woven tops and dresses", "linen and cotton shirting"],
  bottom: ["trousers and shorts"],
  dress: ["woven tops and dresses"],
  outerwear: ["cut and sew", "small-batch wovens"],
  footwear: ["footwear"],
  accessory: ["accessories"],
  other: [],
};

/**
 * The design's persisted costing, computing it from the brief + collection
 * margin when absent. `persist` writes the derived value back (mutations only).
 */
async function resolveCosting(
  design: DesignRow,
  brief: NewDesign,
  persist: boolean,
): Promise<Costing | null> {
  const existing = costingSchema.safeParse(design.costing);
  if (existing.success) return existing.data;

  const [collection, settings] = await Promise.all([
    getCollection(design.collection_id),
    getAppSettings(),
  ]);
  const targetGrossMargin = collection?.brief.targetGrossMargin ?? 0.7;
  const currency = settings?.currency ?? "SGD";

  let costing: Costing;
  try {
    costing = computeCosting({
      targetRetailPrice: brief.targetRetailPrice,
      targetGrossMargin,
      currency,
    });
  } catch {
    return null;
  }
  if (persist) {
    try {
      await updateDesign(design.id, { costing });
    } catch {
      // Best-effort persistence; the value is still usable this request.
    }
  }
  return costing;
}

/** Quantity recorded on the first RFQ request, or the default. */
function rfqQuantity(rfqs: RfqRow[]): number {
  for (const rfq of rfqs) {
    const parsed = rfqRequestSchema.safeParse(rfq.request_payload);
    if (parsed.success) return parsed.data.quantity;
  }
  return DEFAULT_QUANTITY;
}

// ---------------------------------------------------------------------------
// POST — draft RFQs
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiErrorHandling<{ rfqs: RfqRow[]; created: number }>(
    async (requestId) => {
      const session = await requireSession(request);
      if (!session.ok) {
        return apiError(
          "UNAUTHORIZED",
          "A valid session is required to draft RFQs.",
          { requestId },
        );
      }

      const { id } = await params;
      if (!idSchema.safeParse(id).success) {
        return apiError("VALIDATION_ERROR", "Invalid design id.", { requestId });
      }

      let raw: unknown = {};
      try {
        raw = await request.json();
      } catch {
        raw = {};
      }
      const parsed = postSchema.safeParse(raw);
      if (!parsed.success) {
        return apiError(
          "VALIDATION_ERROR",
          "supplierIds must be an array of supplier UUIDs.",
          { requestId },
        );
      }

      const design = await getDesign(id);
      if (!design) {
        return apiError("NOT_FOUND", `No design found with id ${id}.`, {
          requestId,
        });
      }

      const briefResult = newDesignSchema.safeParse(design.design_brief);
      if (!briefResult.success) {
        return apiError(
          "STATE_INVALID",
          "This design does not yet have a complete design brief to build an RFQ from.",
          { requestId },
        );
      }
      const brief = briefResult.data;

      const costing = await resolveCosting(design, brief, true);
      if (!costing) {
        return apiError(
          "STATE_INVALID",
          "A valid costing model is required before drafting RFQs. Check the design's target retail price.",
          { requestId },
        );
      }

      const allSuppliers = await listSuppliers();
      const requestedIds = parsed.data.supplierIds;
      const targetSuppliers = requestedIds
        ? allSuppliers.filter((s) => requestedIds.includes(s.id))
        : allSuppliers;

      if (targetSuppliers.length === 0) {
        return apiError(
          requestedIds ? "VALIDATION_ERROR" : "STATE_INVALID",
          requestedIds
            ? "None of the supplied supplierIds match a known supplier."
            : "There are no suppliers to send RFQs to. Seed the demo suppliers first.",
          { requestId },
        );
      }

      const settings = await getAppSettings();
      const sizeRange =
        design.tech_pack && design.tech_pack.sizeRange.length > 0
          ? design.tech_pack.sizeRange
          : [...DEFAULT_SIZE_RANGE];
      const targetUnitPrice = Math.max(
        costing.detailedEstimate.maximumFactoryCost,
        costing.maximumLandedCost,
      );

      // Deterministic RFQ request payload (validated), shared across suppliers.
      const requestPayload: Record<string, unknown> = {
        brandReference: settings?.brand_name ?? "LabelOS",
        styleReference: design.tech_pack?.styleCode ?? brief.name,
        quantity: DEFAULT_QUANTITY,
        sizeRange,
        materialRequirements: brief.fabricRequirements,
        targetUnitPrice,
        currency: costing.currency,
        sampleRequest:
          "One sealed, measured sample per size in the approved colourway before any bulk production.",
        deliveryTarget:
          "Sample within your stated sample lead time; bulk delivery within your stated production lead time after written sample sign-off.",
        requestedQuoteFields: [
          "unitPrice",
          "minimumOrderQuantity",
          "sampleFee",
          "sampleLeadDays",
          "productionLeadDays",
          "fabricResponsibility",
          "packagingIncluded",
          "paymentTerms",
          "qualityProcess",
          "defectPolicy",
          "freightEstimatePerUnit",
          "dutyEstimatePerUnit",
        ],
        unresolvedQuestions: brief.openQuestions,
        disclaimer:
          "DRAFT RFQ — LabelOS does not send this automatically. Review every figure and requirement with a human before contacting any supplier. Supplier records are unverified leads, not vetted factories.",
      };
      // Validate the payload shape; a failure here is a programming error.
      rfqRequestSchema.parse(requestPayload);

      const existingRfqs = await listRfqsByDesign(id);
      const existingSupplierIds = new Set(
        existingRfqs.map((rfq) => rfq.supplier_id),
      );

      let created = 0;
      for (const supplier of targetSuppliers) {
        if (existingSupplierIds.has(supplier.id)) continue;
        await insertRfq({
          design_id: id,
          supplier_id: supplier.id,
          status: "RFQ_DRAFT",
          request_payload: requestPayload,
        });
        created += 1;
      }

      const rfqs = await listRfqsByDesign(id);

      await logActivity({
        actor: "rfq-generator",
        action: "designs.rfq.draft",
        entityType: "design",
        entityId: id,
        inputSummary: `draft RFQs for ${targetSuppliers.length} supplier(s)`,
        outputSummary: `ok — ${created} new RFQ row(s), ${rfqs.length} total`,
        rawMetadata: { status: "success", created, total: rfqs.length },
      });

      return apiOk<{ rfqs: RfqRow[]; created: number }>(
        { rfqs, created },
        requestId,
      );
    },
  );
}

// ---------------------------------------------------------------------------
// GET — list + comparison + recommendation
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
  weights: typeof QUOTE_COMPARISON_WEIGHTS;
  maximumLandedCost: number | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiErrorHandling<RfqGetResponse>(async (requestId) => {
    const session = await requireSession(request);
    if (!session.ok) {
      return apiError("UNAUTHORIZED", "A valid session is required.", {
        requestId,
      });
    }

    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return apiError("VALIDATION_ERROR", "Invalid design id.", { requestId });
    }

    const design = await getDesign(id);
    if (!design) {
      return apiError("NOT_FOUND", `No design found with id ${id}.`, {
        requestId,
      });
    }

    const [rfqs, suppliers] = await Promise.all([
      listRfqsByDesign(id),
      listSuppliers(),
    ]);
    const supplierById = new Map(suppliers.map((s) => [s.id, s]));
    const rfqsWithSupplier: RfqWithSupplier[] = rfqs.map((rfq) => ({
      ...rfq,
      supplierName: supplierById.get(rfq.supplier_id)?.name ?? "Unknown supplier",
    }));

    // Costing drives the maximum landed cost budget for the comparison.
    const briefResult = newDesignSchema.safeParse(design.design_brief);
    let costing: Costing | null;
    if (briefResult.success) {
      costing = await resolveCosting(design, briefResult.data, false);
    } else {
      const parsedCosting = costingSchema.safeParse(design.costing);
      costing = parsedCosting.success ? parsedCosting.data : null;
    }

    const requiredCapabilities = briefResult.success
      ? CATEGORY_CAPABILITIES[briefResult.data.category] ?? []
      : [];

    const quantity = rfqQuantity(rfqs);

    const quoteInputs: CompareQuotesInput["rfqs"] = [];
    for (const rfq of rfqs) {
      const quote = quotePayloadSchema.safeParse(rfq.quote_payload);
      if (!quote.success) continue;
      quoteInputs.push({
        rfqId: rfq.id,
        supplierName: supplierById.get(rfq.supplier_id)?.name ?? "Unknown supplier",
        capabilities: supplierById.get(rfq.supplier_id)?.capabilities ?? [],
        quote: quote.data,
      });
    }

    let comparison: QuoteComparison[] = [];
    if (quoteInputs.length > 0 && costing) {
      comparison = compareQuotes({
        rfqs: quoteInputs,
        requiredCapabilities,
        quantity,
        maximumLandedCost: costing.maximumLandedCost,
      });
    }

    let recommendation: Recommendation | null = null;
    if (comparison.length > 0) {
      const top = comparison[0];
      const weightSentence =
        "price 30%, MOQ fit 15%, sample speed 15%, production speed 10%, capability fit 15%, quality confidence 15%";
      const budgetNote = top.withinMaxLandedCost
        ? "Its estimated landed cost is within the maximum landed-cost budget."
        : "Caution: its estimated landed cost exceeds the maximum landed-cost budget — review before proceeding.";
      recommendation = {
        rfqId: top.rfqId,
        supplierName: top.supplierName,
        totalScore: top.totalScore,
        withinMaxLandedCost: top.withinMaxLandedCost,
        rationale:
          `Recommended lead: ${top.supplierName} (weighted score ${top.totalScore.toFixed(2)}). ` +
          `Ranked by transparent weights — ${weightSentence}. ` +
          `The lowest price does not automatically win; this supplier leads on the balance of cost, speed, capability and quality. ` +
          `${budgetNote} Supplier records are unverified leads — confirm with due diligence before committing.`,
      };
    }

    return apiOk<RfqGetResponse>(
      {
        rfqs: rfqsWithSupplier,
        comparison,
        recommendation,
        weights: QUOTE_COMPARISON_WEIGHTS,
        maximumLandedCost: costing?.maximumLandedCost ?? null,
      },
      requestId,
    );
  });
}

// ---------------------------------------------------------------------------
// PATCH — record a quote, or advance the production board
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiErrorHandling<{ rfq: RfqRow }>(async (requestId) => {
    const session = await requireSession(request);
    if (!session.ok) {
      return apiError(
        "UNAUTHORIZED",
        "A valid session is required to update an RFQ.",
        { requestId },
      );
    }

    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return apiError("VALIDATION_ERROR", "Invalid design id.", { requestId });
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return apiError("VALIDATION_ERROR", "Request body must be JSON.", {
        requestId,
      });
    }

    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(
        "VALIDATION_ERROR",
        "Provide rfqId plus exactly one of: quote or stage.",
        {
          requestId,
          details: parsed.error.issues.map(
            (i) => `${i.path.join(".")}: ${i.message}`,
          ),
        },
      );
    }

    const design = await getDesign(id);
    if (!design) {
      return apiError("NOT_FOUND", `No design found with id ${id}.`, {
        requestId,
      });
    }

    const rfq = await getRfq(parsed.data.rfqId);
    if (!rfq || rfq.design_id !== id) {
      return apiError(
        "NOT_FOUND",
        `No RFQ ${parsed.data.rfqId} found for this design.`,
        { requestId },
      );
    }

    // --- Record a supplier quote ---
    if (parsed.data.quote !== undefined) {
      const updated = await updateRfq(rfq.id, {
        quote_payload: parsed.data.quote,
        status: "QUOTE_RECEIVED",
      });
      await logActivity({
        actor: "user",
        action: "designs.rfq.quote",
        entityType: "rfq",
        entityId: rfq.id,
        inputSummary: `quote for RFQ ${rfq.id}`,
        outputSummary: "ok — status QUOTE_RECEIVED",
        rawMetadata: { status: "success" },
      });
      return apiOk<{ rfq: RfqRow }>({ rfq: updated }, requestId);
    }

    // --- Advance the production board one stage ---
    const targetStage = parsed.data.stage!;
    const fromResult = productionStageSchema.safeParse(rfq.status);
    const fromStage = fromResult.success ? fromResult.data : "RFQ_DRAFT";

    if (!canTransitionProduction(fromStage, targetStage)) {
      const message =
        fromStage === "PRODUCTION_APPROVAL_PENDING"
          ? "Production Approval Pending is the final automated stage. Advancing to production requires a human decision made outside LabelOS — the app never places production orders, sends purchase orders, or triggers payments."
          : `Invalid production transition ${fromStage} → ${targetStage}. Only a move to the immediate next stage is allowed (no skipping or moving backwards).`;
      await logActivity({
        actor: "user",
        action: "designs.rfq.stage",
        entityType: "rfq",
        entityId: rfq.id,
        inputSummary: `attempt ${fromStage} → ${targetStage}`,
        outputSummary: "rejected: invalid production transition",
        rawMetadata: { status: "error", from: fromStage, to: targetStage },
      });
      return apiError("STATE_INVALID", message, { requestId });
    }

    const updated = await updateRfq(rfq.id, { status: targetStage });
    await logActivity({
      actor: "user",
      action: "designs.rfq.stage",
      entityType: "rfq",
      entityId: rfq.id,
      inputSummary: `${fromStage} → ${targetStage}`,
      outputSummary: "ok",
      rawMetadata: { status: "success", from: fromStage, to: targetStage },
    });
    return apiOk<{ rfq: RfqRow }>({ rfq: updated }, requestId);
  });
}
