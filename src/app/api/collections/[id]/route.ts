import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api";
import { requireSession } from "@/lib/auth/require-session";
import { collectionBriefSchema } from "@/lib/domain/schemas";
import { logActivity } from "@/lib/logging/activity";
import { classifyPipelineError } from "@/lib/analysis/critique-outfit";
import {
  getCollection,
  getCollectionBySlug,
  listDesignsByCollection,
  listOutfitsByCollection,
  updateCollection,
  type CollectionPatch,
  type CollectionRow,
  type DesignRow,
  type OutfitRow,
} from "@/lib/supabase/repositories";

/**
 * /api/collections/[id]
 *
 * GET   — the assembled Collection Studio state: the collection plus all of its
 *         outfits and designs.
 * PATCH — update name, brief, isPublic and/or status. The slug is regenerated
 *         only when the caller explicitly asks (regenerateSlug: true) so a
 *         published lookbook URL never changes underneath a rename by accident.
 *
 * Touches Supabase (service-role client) → Node.js runtime.
 */
export const runtime = "nodejs";

const patchSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    brief: collectionBriefSchema.optional(),
    isPublic: z.boolean().optional(),
    status: z.string().min(1).max(50).optional(),
    regenerateSlug: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.brief !== undefined ||
      value.isPublic !== undefined ||
      value.status !== undefined,
    { message: "At least one updatable field is required." },
  );

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return base.length > 0 ? base : "collection";
}

async function uniqueSlug(base: string, allowId: string): Promise<string> {
  let candidate = base;
  let suffix = 1;
  for (;;) {
    const existing = await getCollectionBySlug(candidate);
    if (!existing || existing.id === allowId) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}

interface StudioState {
  collection: CollectionRow;
  outfits: OutfitRow[];
  designs: DesignRow[];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiErrorHandling<StudioState>(async (requestId) => {
    const session = await requireSession(request);
    if (!session.ok) {
      return apiError("UNAUTHORIZED", "A valid session is required.", {
        requestId,
      });
    }

    const { id } = await params;

    try {
      const collection = await getCollection(id);
      if (!collection) {
        return apiError("NOT_FOUND", "Collection not found.", { requestId });
      }
      const [outfits, designs] = await Promise.all([
        listOutfitsByCollection(id),
        listDesignsByCollection(id),
      ]);
      return apiOk({ collection, outfits, designs }, requestId);
    } catch (error) {
      const classified = classifyPipelineError(error);
      if (classified) {
        return apiError(classified.code, classified.message, { requestId });
      }
      throw error;
    }
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiErrorHandling<CollectionRow>(async (requestId) => {
    const session = await requireSession(request);
    if (!session.ok) {
      return apiError("UNAUTHORIZED", "A valid session is required.", {
        requestId,
      });
    }

    const { id } = await params;

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
        "Provide at least one valid field to update (name, brief, isPublic, status).",
        { requestId, details: parsed.error.flatten() },
      );
    }

    try {
      const collection = await getCollection(id);
      if (!collection) {
        return apiError("NOT_FOUND", "Collection not found.", { requestId });
      }

      const patch: CollectionPatch = {};
      if (parsed.data.name !== undefined) patch.name = parsed.data.name;
      if (parsed.data.brief !== undefined) patch.brief = parsed.data.brief;
      if (parsed.data.isPublic !== undefined) {
        patch.is_public = parsed.data.isPublic;
      }
      if (parsed.data.status !== undefined) patch.status = parsed.data.status;

      // Slug is only regenerated on explicit request, and only if we have a
      // name to base it on (the incoming one, or the stored one).
      if (parsed.data.regenerateSlug) {
        const source = parsed.data.name ?? collection.name;
        patch.slug = await uniqueSlug(slugify(source), id);
      }

      const updated = await updateCollection(id, patch);

      await logActivity({
        actor: "user",
        action: "collection.update",
        entityType: "collection",
        entityId: id,
        inputSummary: `Update fields: ${Object.keys(patch).join(", ") || "(none)"}`,
        outputSummary: `Collection ${id} updated (status ${updated.status}, public ${updated.is_public})`,
      });

      return apiOk(updated, requestId);
    } catch (error) {
      const classified = classifyPipelineError(error);
      if (classified) {
        await logActivity({
          actor: "user",
          action: "collection.update",
          entityType: "collection",
          entityId: id,
          outputSummary: `error (${classified.code}): ${classified.message}`,
        });
        return apiError(classified.code, classified.message, { requestId });
      }
      throw error;
    }
  });
}
