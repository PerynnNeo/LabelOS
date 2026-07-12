import type {
  CollectionRow,
  DesignRow,
  OutfitRow,
  ProductRow,
} from "@/lib/supabase/repositories";
import type { BrandProfile } from "@/lib/domain/schemas";

/**
 * Shared, stable prop contract for the three Collection Studio stage bodies
 * that live under `/app/collections/[id]` (brief · trends · outfits).
 *
 * The server page (`page.tsx`) loads the assembled studio state via the
 * repository layer and hands each stage the same bundle. Every value is a
 * plain, serialisable row — stage components are Client Components and must
 * never import the server-only repository/admin modules themselves. The
 * repository types below are imported **type-only**, so nothing server-side is
 * pulled into a client bundle.
 *
 * This file is imported by both the page (server) and every stage (client),
 * including the outfits stage owned by another agent, so keep it minimal and
 * additive.
 */

/** The three stages that render under `/app/collections/[id]`. */
export type StudioStageKey = "brief" | "trends" | "outfits";

/** Stable identifiers threaded through the studio scaffolding + stage bodies. */
export interface StudioContext {
  collectionId: string;
  slug: string;
  status: string;
  stage: StudioStageKey;
}

/**
 * Props every studio stage body receives from the server page.
 *
 * Stage components (`BriefStage`, `TrendsStage`, and the other agent's
 * `OutfitsStage`) MUST accept exactly this shape:
 *
 *   export function OutfitsStage(props: StudioStageProps) { ... }
 */
export interface StudioStageProps {
  collection: CollectionRow;
  /** From `app_settings.brand_profile`; null when not configured yet. */
  brandProfile: BrandProfile | null;
  outfits: OutfitRow[];
  designs: DesignRow[];
  products: ProductRow[];
  context: StudioContext;
}
