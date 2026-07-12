import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  apiError,
  apiOk,
  withApiErrorHandling,
  type ApiErrorCode,
} from "@/lib/api";
import { requireSession } from "@/lib/auth/require-session";
import { logActivity } from "@/lib/logging/activity";
import { getAnthropicProvider } from "@/lib/anthropic/provider";
import { AnthropicCallError } from "@/lib/anthropic/structured";
import { computeCosting } from "@/lib/domain/costing";
import {
  costingSchema,
  newDesignSchema,
  TECH_PACK_DRAFT_STATUS,
  type Costing,
  type NewDesign,
  type TechPack,
} from "@/lib/domain/schemas";
import {
  buildTechPackRequest,
  finalizeTechPack,
  techPackWriterSchema,
} from "@/lib/agents/tech-pack-writer";
import {
  getAppSettings,
  getCollection,
  getDesign,
  updateDesign,
  type DesignRow,
} from "@/lib/supabase/repositories";

/**
 * POST /api/designs/[id]/tech-pack (spec section 18).
 *
 * Runs the Tech Pack Writer agent against the approved design, re-asserts the
 * DRAFT_REQUIRES_HUMAN_VERIFICATION status in code, bumps the stored version,
 * and persists the result. Claude drafts; deterministic code owns the status
 * and version number.
 */
export const runtime = "nodejs";

const idSchema = z.uuid();

function anthropicErrorToApi(error: AnthropicCallError): {
  code: ApiErrorCode;
  message: string;
} {
  switch (error.category) {
    case "not_configured":
      return { code: "PROVIDER_NOT_CONFIGURED", message: error.message };
    case "rate_limit":
      return { code: "RATE_LIMITED", message: error.message };
    default:
      return { code: "PROVIDER_ERROR", message: error.message };
  }
}

/**
 * Return the design's persisted costing, computing (and persisting) it from the
 * brief + collection margin when the gap step has not stored one yet.
 */
async function resolveCosting(
  design: DesignRow,
  brief: NewDesign,
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
  try {
    await updateDesign(design.id, { costing });
  } catch {
    // Persisting the derived costing is best-effort; the value is still usable.
  }
  return costing;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiErrorHandling<{ techPack: TechPack }>(async (requestId) => {
    const session = await requireSession(request);
    if (!session.ok) {
      return apiError(
        "UNAUTHORIZED",
        "A valid session is required to draft a tech pack.",
        { requestId },
      );
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

    const briefResult = newDesignSchema.safeParse(design.design_brief);
    if (!briefResult.success) {
      return apiError(
        "STATE_INVALID",
        "This design does not yet have a complete design brief to draft a tech pack from. Generate the design brief first.",
        { requestId },
      );
    }
    const brief = briefResult.data;

    const costing = await resolveCosting(design, brief);
    if (!costing) {
      return apiError(
        "STATE_INVALID",
        "A valid costing model is required before drafting a tech pack. Check the design's target retail price.",
        { requestId },
      );
    }

    const previousVersion = design.tech_pack?.version ?? 0;
    const nextVersion = previousVersion + 1;

    const { system, user, schemaName } = buildTechPackRequest({
      design: brief,
      costing,
    });

    const provider = getAnthropicProvider();
    let techPack: TechPack;
    try {
      const { data } = await provider.structuredCall({
        schema: techPackWriterSchema,
        schemaName,
        system,
        user,
        maxTokens: 8192,
        route: "designs.tech-pack",
        entityId: id,
      });
      // Deterministic code owns status and version, never the model.
      techPack = {
        ...finalizeTechPack(data),
        status: TECH_PACK_DRAFT_STATUS,
        version: nextVersion,
      };
    } catch (error) {
      if (error instanceof AnthropicCallError) {
        const mapped = anthropicErrorToApi(error);
        await logActivity({
          actor: "tech-pack-writer",
          action: "designs.tech-pack",
          entityType: "design",
          entityId: id,
          inputSummary: `tech pack v${nextVersion} request`,
          outputSummary: `error (${error.category}): ${error.message}`,
          rawMetadata: { status: "error", errorCategory: error.category },
        });
        return apiError(mapped.code, mapped.message, { requestId });
      }
      throw error;
    }

    const updated = await updateDesign(id, { tech_pack: techPack });

    await logActivity({
      actor: "tech-pack-writer",
      action: "designs.tech-pack",
      entityType: "design",
      entityId: id,
      inputSummary: `tech pack v${nextVersion} for "${brief.name}"`,
      outputSummary: `ok — ${techPack.styleCode} v${techPack.version} (${techPack.status})`,
      rawMetadata: { status: "success", version: techPack.version },
    });

    return apiOk<{ techPack: TechPack }>(
      { techPack: updated.tech_pack ?? techPack },
      requestId,
    );
  });
}
