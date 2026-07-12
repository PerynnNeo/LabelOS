import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/api";
import { requireSession } from "@/lib/auth/require-session";
import { collectionBriefSchema } from "@/lib/domain/schemas";
import { logActivity } from "@/lib/logging/activity";
import { classifyPipelineError } from "@/lib/analysis/critique-outfit";
import {
  getCollectionBySlug,
  insertCollection,
  listCollections,
  type CollectionRow,
} from "@/lib/supabase/repositories";

/**
 * /api/collections
 *
 * GET  — list every collection (studio index).
 * POST — create a collection from { name, brief }: slugify the name, make the
 *        slug unique with a numeric suffix, and start it in status "draft".
 *
 * Touches Supabase (service-role client), so it runs on the Node.js runtime.
 */
export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  brief: collectionBriefSchema,
});

/** Slugify a collection name: lowercase, hyphen-separated, safe fallback. */
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

/**
 * Return a slug unique across collections. If `base` is taken, appends -2, -3…
 * `allowId` (the current collection) may keep its own slug.
 */
async function uniqueSlug(base: string, allowId?: string): Promise<string> {
  let candidate = base;
  let suffix = 1;
  for (;;) {
    const existing = await getCollectionBySlug(candidate);
    if (!existing || existing.id === allowId) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}

export async function GET(request: NextRequest) {
  return withApiErrorHandling<{ collections: CollectionRow[] }>(
    async (requestId) => {
      const session = await requireSession(request);
      if (!session.ok) {
        return apiError("UNAUTHORIZED", "A valid session is required.", {
          requestId,
        });
      }
      try {
        const collections = await listCollections();
        return apiOk({ collections }, requestId);
      } catch (error) {
        const classified = classifyPipelineError(error);
        if (classified) {
          return apiError(classified.code, classified.message, { requestId });
        }
        throw error;
      }
    },
  );
}

export async function POST(request: NextRequest) {
  return withApiErrorHandling<CollectionRow>(async (requestId) => {
    const session = await requireSession(request);
    if (!session.ok) {
      return apiError("UNAUTHORIZED", "A valid session is required.", {
        requestId,
      });
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return apiError("VALIDATION_ERROR", "Request body must be JSON.", {
        requestId,
      });
    }

    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(
        "VALIDATION_ERROR",
        "A collection name and a valid brief are required.",
        { requestId, details: parsed.error.flatten() },
      );
    }

    try {
      const slug = await uniqueSlug(slugify(parsed.data.name));
      const collection = await insertCollection({
        name: parsed.data.name,
        slug,
        status: "draft",
        brief: parsed.data.brief,
        is_public: false,
      });

      await logActivity({
        actor: "user",
        action: "collection.create",
        entityType: "collection",
        entityId: collection.id,
        inputSummary: `Create collection "${parsed.data.name}"`,
        outputSummary: `Created collection ${collection.id} (slug ${slug}, status draft)`,
      });

      return apiOk(collection, requestId);
    } catch (error) {
      const classified = classifyPipelineError(error);
      if (classified) {
        await logActivity({
          actor: "user",
          action: "collection.create",
          entityType: "collection",
          inputSummary: `Create collection "${parsed.data.name}"`,
          outputSummary: `error (${classified.code}): ${classified.message}`,
        });
        return apiError(classified.code, classified.message, { requestId });
      }
      throw error;
    }
  });
}
