import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { RepositoryError } from "@/lib/supabase/repositories";
import type {
  BrandDna,
  CollectionPlan,
  CollectionReview,
  CollectionSlot,
  ConceptStatus,
  GarmentDesignSpec,
  ImageJobStatus,
  ImageType,
  VisualQa,
} from "@/lib/domain/design-schemas";

/**
 * Typed repository layer for the new-collection tables (migration 002).
 *
 * Same deliberately-plain style as src/lib/supabase/repositories.ts: every
 * function is a thin, explicit wrapper around one PostgREST call that throws a
 * RepositoryError on failure. Row interfaces mirror
 * supabase/migrations/002_new_collection.sql exactly (snake_case columns).
 *
 * JSONB columns are typed with the domain types from design-schemas.ts, or a
 * permissive record where the payload is not a fixed schema; routes re-validate
 * untrusted JSON with Zod before acting on it. numeric columns can come back
 * from supabase-js as strings, so every numeric field is coerced with Number()
 * before the typed row is returned.
 */

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface DbErrorLike {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

function raise(operation: string, error: DbErrorLike): never {
  throw new RepositoryError(operation, error);
}

function db() {
  return supabaseAdmin();
}

type Writable<Row> = Partial<Omit<Row, "id" | "created_at" | "updated_at">>;

/** Coerce a numeric column (possibly a PostgREST string) to a number. */
function num(value: unknown): number {
  return Number(value);
}

/** Coerce a nullable numeric column, preserving null/undefined as null. */
function numOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

// ---------------------------------------------------------------------------
// Row interfaces (match 002_new_collection.sql)
// ---------------------------------------------------------------------------

export interface CollectionSlotRow {
  id: string;
  collection_id: string;
  slot_index: number;
  provisional_style_id: string;
  category: string;
  role: string;
  target_retail_price: number;
  target_fully_loaded_cost: number;
  target_margin_percent: number;
  slot_json: CollectionSlot | Record<string, unknown>;
  duplicate_check: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface GarmentDesignRow {
  id: string;
  collection_slot_id: string;
  concept_index: number;
  style_id: string;
  name: string;
  spec_json: GarmentDesignSpec | Record<string, unknown>;
  concept_status: ConceptStatus;
  brand_fit_score: number | null;
  climate_fit_score: number | null;
  manufacturability_score: number | null;
  owner_selected_at: string | null;
  owner_rejected_at: string | null;
  revision_of_design_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface GarmentImageRow {
  id: string;
  garment_design_id: string;
  image_type: ImageType;
  provider: string;
  provider_job_id: string | null;
  prompt: string | null;
  negative_prompt: string | null;
  seed: number | null;
  status: ImageJobStatus;
  provider_output_url: string | null;
  stored_url: string | null;
  width: number | null;
  height: number | null;
  qa_json: VisualQa | Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImageGenerationJobRow {
  id: string;
  collection_id: string | null;
  garment_design_id: string | null;
  garment_image_id: string | null;
  provider: string;
  provider_job_id: string | null;
  job_type: string;
  status: ImageJobStatus;
  attempt_count: number;
  idempotency_key: string | null;
  input_json: Record<string, unknown>;
  output_json: Record<string, unknown> | null;
  error_json: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CollectionReviewRow {
  id: string;
  collection_id: string;
  review_json: CollectionReview | Record<string, unknown>;
  score: number | null;
  blocking_issues: CollectionReview["blockingIssues"] | Record<string, unknown>[];
  revision_required: boolean;
  owner_status: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Collection extension columns (added to `collections` by 002)
// ---------------------------------------------------------------------------

export interface CollectionExtras {
  collection_type: string;
  workflow_status: string | null;
  brand_dna: BrandDna | null;
  plan: CollectionPlan | null;
  collection_review: CollectionReview | null;
}

const COLLECTION_EXTRAS_COLUMNS =
  "collection_type, workflow_status, brand_dna, plan, collection_review";

// ---------------------------------------------------------------------------
// Insert / patch types
// ---------------------------------------------------------------------------

export type CollectionExtrasPatch = Partial<CollectionExtras>;

export type CollectionSlotInsert = Writable<CollectionSlotRow> & {
  slot_index: number;
  provisional_style_id: string;
  category: string;
  role: string;
};
export type CollectionSlotPatch = Writable<CollectionSlotRow>;

export type GarmentDesignInsert = Writable<GarmentDesignRow> & {
  collection_slot_id: string;
  concept_index: number;
  style_id: string;
  name: string;
};
export type GarmentDesignPatch = Writable<GarmentDesignRow>;

export type GarmentImageInsert = Writable<GarmentImageRow> & {
  garment_design_id: string;
  image_type: ImageType;
  provider: string;
};
export type GarmentImagePatch = Writable<GarmentImageRow>;

export type ImageJobInsert = Writable<ImageGenerationJobRow> & {
  provider: string;
  job_type: string;
};
export type ImageJobPatch = Writable<ImageGenerationJobRow>;

export type CollectionReviewInsert = Writable<CollectionReviewRow> & {
  collection_id: string;
};
export type CollectionReviewPatch = Writable<CollectionReviewRow>;

// ---------------------------------------------------------------------------
// Row mappers — coerce numeric columns (PostgREST may return them as strings)
// ---------------------------------------------------------------------------

function mapSlot(raw: CollectionSlotRow): CollectionSlotRow {
  return {
    ...raw,
    slot_index: num(raw.slot_index),
    target_retail_price: num(raw.target_retail_price),
    target_fully_loaded_cost: num(raw.target_fully_loaded_cost),
    target_margin_percent: num(raw.target_margin_percent),
  };
}

function mapDesign(raw: GarmentDesignRow): GarmentDesignRow {
  return {
    ...raw,
    concept_index: num(raw.concept_index),
    brand_fit_score: numOrNull(raw.brand_fit_score),
    climate_fit_score: numOrNull(raw.climate_fit_score),
    manufacturability_score: numOrNull(raw.manufacturability_score),
  };
}

function mapImage(raw: GarmentImageRow): GarmentImageRow {
  return {
    ...raw,
    seed: numOrNull(raw.seed),
    width: numOrNull(raw.width),
    height: numOrNull(raw.height),
  };
}

function mapJob(raw: ImageGenerationJobRow): ImageGenerationJobRow {
  return {
    ...raw,
    attempt_count: num(raw.attempt_count),
  };
}

function mapReview(raw: CollectionReviewRow): CollectionReviewRow {
  return {
    ...raw,
    score: numOrNull(raw.score),
  };
}

// ---------------------------------------------------------------------------
// collections — new-collection extension columns
// ---------------------------------------------------------------------------

export async function getCollectionExtras(
  collectionId: string,
): Promise<CollectionExtras | null> {
  const { data, error } = await db()
    .from("collections")
    .select(COLLECTION_EXTRAS_COLUMNS)
    .eq("id", collectionId)
    .maybeSingle();
  if (error) raise("getCollectionExtras", error);
  return (data as CollectionExtras | null) ?? null;
}

export async function updateCollectionExtras(
  collectionId: string,
  patch: CollectionExtrasPatch,
): Promise<CollectionExtras> {
  const { data, error } = await db()
    .from("collections")
    .update(patch)
    .eq("id", collectionId)
    .select(COLLECTION_EXTRAS_COLUMNS)
    .single();
  if (error) raise("updateCollectionExtras", error);
  return data as unknown as CollectionExtras;
}

// ---------------------------------------------------------------------------
// collection_slots
// ---------------------------------------------------------------------------

export async function insertCollectionSlots(
  collectionId: string,
  slots: Omit<CollectionSlotInsert, "collection_id">[],
): Promise<CollectionSlotRow[]> {
  if (slots.length === 0) return [];
  const rows = slots.map((slot) => ({ ...slot, collection_id: collectionId }));
  const { data, error } = await db()
    .from("collection_slots")
    .insert(rows)
    .select("*");
  if (error) raise("insertCollectionSlots", error);
  return ((data ?? []) as CollectionSlotRow[]).map(mapSlot);
}

export async function listSlotsByCollection(
  collectionId: string,
): Promise<CollectionSlotRow[]> {
  const { data, error } = await db()
    .from("collection_slots")
    .select("*")
    .eq("collection_id", collectionId)
    .order("slot_index", { ascending: true });
  if (error) raise("listSlotsByCollection", error);
  return ((data ?? []) as CollectionSlotRow[]).map(mapSlot);
}

export async function getSlot(id: string): Promise<CollectionSlotRow | null> {
  const { data, error } = await db()
    .from("collection_slots")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) raise("getSlot", error);
  const row = data as CollectionSlotRow | null;
  return row ? mapSlot(row) : null;
}

export async function updateSlot(
  id: string,
  patch: CollectionSlotPatch,
): Promise<CollectionSlotRow> {
  const { data, error } = await db()
    .from("collection_slots")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) raise("updateSlot", error);
  return mapSlot(data as CollectionSlotRow);
}

// ---------------------------------------------------------------------------
// garment_designs
// ---------------------------------------------------------------------------

export async function insertGarmentDesign(
  input: GarmentDesignInsert,
): Promise<GarmentDesignRow> {
  const { data, error } = await db()
    .from("garment_designs")
    .insert(input)
    .select("*")
    .single();
  if (error) raise("insertGarmentDesign", error);
  return mapDesign(data as GarmentDesignRow);
}

export async function insertGarmentDesigns(
  inputs: GarmentDesignInsert[],
): Promise<GarmentDesignRow[]> {
  if (inputs.length === 0) return [];
  const { data, error } = await db()
    .from("garment_designs")
    .insert(inputs)
    .select("*");
  if (error) raise("insertGarmentDesigns", error);
  return ((data ?? []) as GarmentDesignRow[]).map(mapDesign);
}

export async function listDesignsBySlot(
  slotId: string,
): Promise<GarmentDesignRow[]> {
  const { data, error } = await db()
    .from("garment_designs")
    .select("*")
    .eq("collection_slot_id", slotId)
    .order("concept_index", { ascending: true });
  if (error) raise("listDesignsBySlot", error);
  return ((data ?? []) as GarmentDesignRow[]).map(mapDesign);
}

/** All designs across a collection, joined through its slots. */
export async function listDesignsByCollection(
  collectionId: string,
): Promise<GarmentDesignRow[]> {
  const slots = await listSlotsByCollection(collectionId);
  if (slots.length === 0) return [];
  const slotIds = slots.map((slot) => slot.id);
  const { data, error } = await db()
    .from("garment_designs")
    .select("*")
    .in("collection_slot_id", slotIds)
    .order("created_at", { ascending: true });
  if (error) raise("listDesignsByCollection", error);
  return ((data ?? []) as GarmentDesignRow[]).map(mapDesign);
}

export async function getGarmentDesign(
  id: string,
): Promise<GarmentDesignRow | null> {
  const { data, error } = await db()
    .from("garment_designs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) raise("getGarmentDesign", error);
  const row = data as GarmentDesignRow | null;
  return row ? mapDesign(row) : null;
}

export async function updateGarmentDesign(
  id: string,
  patch: GarmentDesignPatch,
): Promise<GarmentDesignRow> {
  const { data, error } = await db()
    .from("garment_designs")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) raise("updateGarmentDesign", error);
  return mapDesign(data as GarmentDesignRow);
}

// ---------------------------------------------------------------------------
// garment_images
// ---------------------------------------------------------------------------

export async function insertGarmentImage(
  input: GarmentImageInsert,
): Promise<GarmentImageRow> {
  const { data, error } = await db()
    .from("garment_images")
    .insert(input)
    .select("*")
    .single();
  if (error) raise("insertGarmentImage", error);
  return mapImage(data as GarmentImageRow);
}

export async function getGarmentImage(
  id: string,
): Promise<GarmentImageRow | null> {
  const { data, error } = await db()
    .from("garment_images")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) raise("getGarmentImage", error);
  const row = data as GarmentImageRow | null;
  return row ? mapImage(row) : null;
}

export async function listImagesByDesign(
  designId: string,
): Promise<GarmentImageRow[]> {
  const { data, error } = await db()
    .from("garment_images")
    .select("*")
    .eq("garment_design_id", designId)
    .order("created_at", { ascending: true });
  if (error) raise("listImagesByDesign", error);
  return ((data ?? []) as GarmentImageRow[]).map(mapImage);
}

export async function updateGarmentImage(
  id: string,
  patch: GarmentImagePatch,
): Promise<GarmentImageRow> {
  const { data, error } = await db()
    .from("garment_images")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) raise("updateGarmentImage", error);
  return mapImage(data as GarmentImageRow);
}

/** Most recently created image of a given type for a design, if any. */
export async function latestImageForDesign(
  designId: string,
  imageType: ImageType,
): Promise<GarmentImageRow | null> {
  const { data, error } = await db()
    .from("garment_images")
    .select("*")
    .eq("garment_design_id", designId)
    .eq("image_type", imageType)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) raise("latestImageForDesign", error);
  const row = data as GarmentImageRow | null;
  return row ? mapImage(row) : null;
}

// ---------------------------------------------------------------------------
// image_generation_jobs
// ---------------------------------------------------------------------------

export async function insertImageJob(
  input: ImageJobInsert,
): Promise<ImageGenerationJobRow> {
  const { data, error } = await db()
    .from("image_generation_jobs")
    .insert(input)
    .select("*")
    .single();
  if (error) raise("insertImageJob", error);
  return mapJob(data as ImageGenerationJobRow);
}

export async function getImageJob(
  id: string,
): Promise<ImageGenerationJobRow | null> {
  const { data, error } = await db()
    .from("image_generation_jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) raise("getImageJob", error);
  const row = data as ImageGenerationJobRow | null;
  return row ? mapJob(row) : null;
}

export async function findImageJobByIdempotencyKey(
  idempotencyKey: string,
): Promise<ImageGenerationJobRow | null> {
  const { data, error } = await db()
    .from("image_generation_jobs")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) raise("findImageJobByIdempotencyKey", error);
  const row = data as ImageGenerationJobRow | null;
  return row ? mapJob(row) : null;
}

export async function listImageJobsByCollection(
  collectionId: string,
): Promise<ImageGenerationJobRow[]> {
  const { data, error } = await db()
    .from("image_generation_jobs")
    .select("*")
    .eq("collection_id", collectionId)
    .order("created_at", { ascending: true });
  if (error) raise("listImageJobsByCollection", error);
  return ((data ?? []) as ImageGenerationJobRow[]).map(mapJob);
}

export async function updateImageJob(
  id: string,
  patch: ImageJobPatch,
): Promise<ImageGenerationJobRow> {
  const { data, error } = await db()
    .from("image_generation_jobs")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) raise("updateImageJob", error);
  return mapJob(data as ImageGenerationJobRow);
}

// ---------------------------------------------------------------------------
// collection_reviews
// ---------------------------------------------------------------------------

export async function insertCollectionReview(
  input: CollectionReviewInsert,
): Promise<CollectionReviewRow> {
  const { data, error } = await db()
    .from("collection_reviews")
    .insert(input)
    .select("*")
    .single();
  if (error) raise("insertCollectionReview", error);
  return mapReview(data as CollectionReviewRow);
}

/** Most recent review for a collection, if any. */
export async function getLatestCollectionReview(
  collectionId: string,
): Promise<CollectionReviewRow | null> {
  const { data, error } = await db()
    .from("collection_reviews")
    .select("*")
    .eq("collection_id", collectionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) raise("getLatestCollectionReview", error);
  const row = data as CollectionReviewRow | null;
  return row ? mapReview(row) : null;
}

export async function updateCollectionReview(
  id: string,
  patch: CollectionReviewPatch,
): Promise<CollectionReviewRow> {
  const { data, error } = await db()
    .from("collection_reviews")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) raise("updateCollectionReview", error);
  return mapReview(data as CollectionReviewRow);
}
