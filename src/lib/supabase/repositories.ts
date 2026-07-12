import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  AnalysisStatus,
  ApprovalStatus,
  BrandProfile,
  CollectionBrief,
  Costing,
  CurationSummary,
  GarmentAnalysis,
  JobStatus,
  ListingPayload,
  NewDesign,
  OutfitStatus,
  ProductSource,
  QuotePayload,
  StoredReview,
  SupplierVerification,
  TechPack,
  TrendReport,
  Usage,
} from "@/lib/domain/schemas";

/**
 * Typed repository layer over the service-role Supabase client.
 *
 * Deliberately plain: every function is a thin, explicit wrapper around one
 * PostgREST call that throws a RepositoryError on failure. No ORM, no
 * query-builder abstraction, no caching.
 *
 * Row interfaces mirror supabase/migrations/001_initial.sql exactly
 * (snake_case column names). JSONB columns are typed with the domain types
 * from src/lib/domain/schemas.ts; routes re-validate untrusted JSON with Zod
 * before acting on it.
 */

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

interface DbErrorLike {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

export class RepositoryError extends Error {
  readonly operation: string;
  /** Postgres/PostgREST error code, e.g. "23505" or "42P01". */
  readonly code: string | null;
  readonly details: string | null;

  constructor(operation: string, dbError: DbErrorLike) {
    super(
      `Database operation "${operation}" failed: ${dbError.message ?? "unknown error"}`,
    );
    this.name = "RepositoryError";
    this.operation = operation;
    this.code = dbError.code ?? null;
    this.details = typeof dbError.details === "string" ? dbError.details : null;
  }
}

export const PG_UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof RepositoryError && error.code === PG_UNIQUE_VIOLATION;
}

/**
 * True when the error indicates the migration has not been run yet
 * (relation does not exist / table missing from the PostgREST schema cache).
 */
export function isMissingMigrationError(error: unknown): boolean {
  if (!(error instanceof RepositoryError)) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return /does not exist|schema cache/i.test(error.message);
}

function raise(operation: string, error: DbErrorLike): never {
  throw new RepositoryError(operation, error);
}

function db() {
  return supabaseAdmin();
}

// ---------------------------------------------------------------------------
// Row interfaces (match 001_initial.sql)
// ---------------------------------------------------------------------------

export interface AppSettingsRow {
  id: string;
  brand_name: string;
  brand_slug: string;
  brand_profile: BrandProfile;
  currency: string;
  market: string;
  created_at: string;
  updated_at: string;
}

export interface ProductRow {
  id: string;
  source: ProductSource;
  external_id: string | null;
  shopify_gid: string | null;
  title: string;
  description: string;
  vendor: string;
  product_type: string;
  sku: string;
  price: number;
  inventory_quantity: number;
  image_path: string | null;
  public_image_url: string | null;
  status: string;
  raw_metadata: Record<string, unknown>;
  analysis: GarmentAnalysis | null;
  analysis_status: AnalysisStatus;
  created_at: string;
  updated_at: string;
}

export interface CollectionRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  brief: CollectionBrief;
  trend_report: TrendReport | null;
  curation_summary: CurationSummary | null;
  shopify_collection_gid: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface OutfitRow {
  id: string;
  collection_id: string;
  name: string;
  product_ids: string[];
  occasion: string;
  generation: Record<string, unknown>;
  review: StoredReview | null;
  revision_of: string | null;
  status: OutfitStatus;
  overall_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface DesignRow {
  id: string;
  collection_id: string;
  name: string;
  status: string;
  design_brief: NewDesign | Record<string, unknown>;
  tech_pack: TechPack | null;
  costing: Costing | null;
  flat_sketch_svg: string | null;
  rendered_image_path: string | null;
  listing_payload: ListingPayload | null;
  shopify_product_gid: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupplierRow {
  id: string;
  name: string;
  country: string;
  capabilities: string[];
  minimum_order_quantity: number;
  sample_lead_days: number;
  production_lead_days: number;
  email: string | null;
  verification_status: SupplierVerification;
  details: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface RfqRow {
  id: string;
  design_id: string;
  supplier_id: string;
  status: string;
  request_payload: Record<string, unknown>;
  quote_payload: QuotePayload | null;
  score: number | null;
  created_at: string;
  updated_at: string;
}

export interface ApprovalRow {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  status: ApprovalStatus;
  decision_note: string;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobRow {
  id: string;
  job_type: string;
  entity_type: string;
  entity_id: string | null;
  status: JobStatus;
  progress: number;
  error_message: string | null;
  attempt_count: number;
  idempotency_key: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityLogRow {
  id: string;
  actor: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  input_summary: string;
  output_summary: string;
  provider: string | null;
  model: string | null;
  usage: Partial<Usage> & Record<string, unknown>;
  raw_metadata: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Insert / patch types
// ---------------------------------------------------------------------------

type Writable<Row> = Partial<Omit<Row, "id" | "created_at" | "updated_at">>;

export type AppSettingsInsert = Writable<AppSettingsRow> & {
  brand_name: string;
  brand_slug: string;
};
export type ProductInsert = Writable<ProductRow> & {
  source: ProductSource;
  title: string;
};
export type ProductPatch = Writable<ProductRow>;
export type CollectionInsert = Writable<CollectionRow> & {
  name: string;
  slug: string;
};
export type CollectionPatch = Writable<CollectionRow>;
export type OutfitInsert = Writable<OutfitRow> & {
  collection_id: string;
  product_ids: string[];
};
export type OutfitPatch = Writable<OutfitRow>;
export type DesignInsert = Writable<DesignRow> & {
  collection_id: string;
  name: string;
};
export type DesignPatch = Writable<DesignRow>;
export type SupplierInsert = Writable<SupplierRow> & { name: string };
export type RfqInsert = Writable<RfqRow> & {
  design_id: string;
  supplier_id: string;
};
export type RfqPatch = Writable<RfqRow>;
export type ApprovalInsert = Writable<ApprovalRow> & {
  entity_type: string;
  entity_id: string;
  action: string;
};
export type ApprovalPatch = Writable<ApprovalRow>;
export type JobInsert = Writable<JobRow> & {
  job_type: string;
  idempotency_key: string;
};
export type JobPatch = Writable<JobRow>;
export type ActivityLogInsert = Partial<Omit<ActivityLogRow, "id" | "created_at">> & {
  actor: string;
  action: string;
};

// ---------------------------------------------------------------------------
// app_settings
// ---------------------------------------------------------------------------

export async function getAppSettings(): Promise<AppSettingsRow | null> {
  const { data, error } = await db()
    .from("app_settings")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) raise("getAppSettings", error);
  return (data as AppSettingsRow | null) ?? null;
}

/** Single-row table: updates the existing row if present, else inserts. */
export async function upsertAppSettings(
  input: AppSettingsInsert,
): Promise<AppSettingsRow> {
  const existing = await getAppSettings();
  if (existing) {
    const { data, error } = await db()
      .from("app_settings")
      .update(input)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) raise("upsertAppSettings", error);
    return data as AppSettingsRow;
  }
  const { data, error } = await db()
    .from("app_settings")
    .insert(input)
    .select("*")
    .single();
  if (error) raise("upsertAppSettings", error);
  return data as AppSettingsRow;
}

// ---------------------------------------------------------------------------
// products
// ---------------------------------------------------------------------------

export interface ProductFilter {
  source?: ProductSource;
  analysisStatus?: AnalysisStatus;
  status?: string;
}

export async function listProducts(filter: ProductFilter = {}): Promise<ProductRow[]> {
  let query = db().from("products").select("*").order("created_at", { ascending: true });
  if (filter.source) query = query.eq("source", filter.source);
  if (filter.analysisStatus) query = query.eq("analysis_status", filter.analysisStatus);
  if (filter.status) query = query.eq("status", filter.status);
  const { data, error } = await query;
  if (error) raise("listProducts", error);
  return (data ?? []) as ProductRow[];
}

export async function countProducts(filter: ProductFilter = {}): Promise<number> {
  let query = db().from("products").select("*", { count: "exact", head: true });
  if (filter.source) query = query.eq("source", filter.source);
  if (filter.analysisStatus) query = query.eq("analysis_status", filter.analysisStatus);
  if (filter.status) query = query.eq("status", filter.status);
  const { count, error } = await query;
  if (error) raise("countProducts", error);
  return count ?? 0;
}

export async function getProduct(id: string): Promise<ProductRow | null> {
  const { data, error } = await db()
    .from("products")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) raise("getProduct", error);
  return (data as ProductRow | null) ?? null;
}

export async function getProductBySku(sku: string): Promise<ProductRow | null> {
  const { data, error } = await db()
    .from("products")
    .select("*")
    .eq("sku", sku)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) raise("getProductBySku", error);
  return (data as ProductRow | null) ?? null;
}

export async function insertProduct(input: ProductInsert): Promise<ProductRow> {
  const { data, error } = await db()
    .from("products")
    .insert(input)
    .select("*")
    .single();
  if (error) raise("insertProduct", error);
  return data as ProductRow;
}

export async function updateProduct(
  id: string,
  patch: ProductPatch,
): Promise<ProductRow> {
  const { data, error } = await db()
    .from("products")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) raise("updateProduct", error);
  return data as ProductRow;
}

/**
 * Import upsert keyed on shopify_gid (partial unique index). Select-then-write
 * because PostgREST `on_conflict` cannot target a partial unique index.
 */
export async function upsertProductByShopifyGid(
  input: ProductInsert & { shopify_gid: string },
): Promise<{ product: ProductRow; created: boolean }> {
  const { data: existing, error: findError } = await db()
    .from("products")
    .select("*")
    .eq("shopify_gid", input.shopify_gid)
    .maybeSingle();
  if (findError) raise("upsertProductByShopifyGid", findError);
  if (existing) {
    const row = existing as ProductRow;
    const product = await updateProduct(row.id, input);
    return { product, created: false };
  }
  const product = await insertProduct(input);
  return { product, created: true };
}

// ---------------------------------------------------------------------------
// collections
// ---------------------------------------------------------------------------

export async function insertCollection(input: CollectionInsert): Promise<CollectionRow> {
  const { data, error } = await db()
    .from("collections")
    .insert(input)
    .select("*")
    .single();
  if (error) raise("insertCollection", error);
  return data as CollectionRow;
}

export async function getCollection(id: string): Promise<CollectionRow | null> {
  const { data, error } = await db()
    .from("collections")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) raise("getCollection", error);
  return (data as CollectionRow | null) ?? null;
}

export async function getCollectionBySlug(slug: string): Promise<CollectionRow | null> {
  const { data, error } = await db()
    .from("collections")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) raise("getCollectionBySlug", error);
  return (data as CollectionRow | null) ?? null;
}

export async function listCollections(): Promise<CollectionRow[]> {
  const { data, error } = await db()
    .from("collections")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) raise("listCollections", error);
  return (data ?? []) as CollectionRow[];
}

export async function updateCollection(
  id: string,
  patch: CollectionPatch,
): Promise<CollectionRow> {
  const { data, error } = await db()
    .from("collections")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) raise("updateCollection", error);
  return data as CollectionRow;
}

// ---------------------------------------------------------------------------
// outfits
// ---------------------------------------------------------------------------

export async function insertOutfit(input: OutfitInsert): Promise<OutfitRow> {
  const { data, error } = await db()
    .from("outfits")
    .insert(input)
    .select("*")
    .single();
  if (error) raise("insertOutfit", error);
  return data as OutfitRow;
}

export async function insertOutfits(inputs: OutfitInsert[]): Promise<OutfitRow[]> {
  if (inputs.length === 0) return [];
  const { data, error } = await db()
    .from("outfits")
    .insert(inputs)
    .select("*");
  if (error) raise("insertOutfits", error);
  return (data ?? []) as OutfitRow[];
}

export interface OutfitFilter {
  status?: OutfitStatus;
}

export async function listOutfitsByCollection(
  collectionId: string,
  filter: OutfitFilter = {},
): Promise<OutfitRow[]> {
  let query = db()
    .from("outfits")
    .select("*")
    .eq("collection_id", collectionId)
    .order("created_at", { ascending: true });
  if (filter.status) query = query.eq("status", filter.status);
  const { data, error } = await query;
  if (error) raise("listOutfitsByCollection", error);
  return (data ?? []) as OutfitRow[];
}

export async function getOutfit(id: string): Promise<OutfitRow | null> {
  const { data, error } = await db()
    .from("outfits")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) raise("getOutfit", error);
  return (data as OutfitRow | null) ?? null;
}

export async function updateOutfit(id: string, patch: OutfitPatch): Promise<OutfitRow> {
  const { data, error } = await db()
    .from("outfits")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) raise("updateOutfit", error);
  return data as OutfitRow;
}

// ---------------------------------------------------------------------------
// designs
// ---------------------------------------------------------------------------

export async function insertDesign(input: DesignInsert): Promise<DesignRow> {
  const { data, error } = await db()
    .from("designs")
    .insert(input)
    .select("*")
    .single();
  if (error) raise("insertDesign", error);
  return data as DesignRow;
}

export async function getDesign(id: string): Promise<DesignRow | null> {
  const { data, error } = await db()
    .from("designs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) raise("getDesign", error);
  return (data as DesignRow | null) ?? null;
}

export async function listDesignsByCollection(
  collectionId: string,
): Promise<DesignRow[]> {
  const { data, error } = await db()
    .from("designs")
    .select("*")
    .eq("collection_id", collectionId)
    .order("created_at", { ascending: true });
  if (error) raise("listDesignsByCollection", error);
  return (data ?? []) as DesignRow[];
}

export async function updateDesign(id: string, patch: DesignPatch): Promise<DesignRow> {
  const { data, error } = await db()
    .from("designs")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) raise("updateDesign", error);
  return data as DesignRow;
}

// ---------------------------------------------------------------------------
// suppliers
// ---------------------------------------------------------------------------

export async function listSuppliers(): Promise<SupplierRow[]> {
  const { data, error } = await db()
    .from("suppliers")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) raise("listSuppliers", error);
  return (data ?? []) as SupplierRow[];
}

export async function insertSupplier(input: SupplierInsert): Promise<SupplierRow> {
  const { data, error } = await db()
    .from("suppliers")
    .insert(input)
    .select("*")
    .single();
  if (error) raise("insertSupplier", error);
  return data as SupplierRow;
}

// ---------------------------------------------------------------------------
// rfqs
// ---------------------------------------------------------------------------

export async function insertRfq(input: RfqInsert): Promise<RfqRow> {
  const { data, error } = await db().from("rfqs").insert(input).select("*").single();
  if (error) raise("insertRfq", error);
  return data as RfqRow;
}

export async function listRfqsByDesign(designId: string): Promise<RfqRow[]> {
  const { data, error } = await db()
    .from("rfqs")
    .select("*")
    .eq("design_id", designId)
    .order("created_at", { ascending: true });
  if (error) raise("listRfqsByDesign", error);
  return (data ?? []) as RfqRow[];
}

export async function getRfq(id: string): Promise<RfqRow | null> {
  const { data, error } = await db()
    .from("rfqs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) raise("getRfq", error);
  return (data as RfqRow | null) ?? null;
}

export async function updateRfq(id: string, patch: RfqPatch): Promise<RfqRow> {
  const { data, error } = await db()
    .from("rfqs")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) raise("updateRfq", error);
  return data as RfqRow;
}

// ---------------------------------------------------------------------------
// approvals
// ---------------------------------------------------------------------------

export async function insertApproval(input: ApprovalInsert): Promise<ApprovalRow> {
  const { data, error } = await db()
    .from("approvals")
    .insert(input)
    .select("*")
    .single();
  if (error) raise("insertApproval", error);
  return data as ApprovalRow;
}

export async function getApproval(id: string): Promise<ApprovalRow | null> {
  const { data, error } = await db()
    .from("approvals")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) raise("getApproval", error);
  return (data as ApprovalRow | null) ?? null;
}

export interface ApprovalFilter {
  status?: ApprovalStatus;
  entityType?: string;
  entityId?: string;
}

export async function listApprovals(filter: ApprovalFilter = {}): Promise<ApprovalRow[]> {
  let query = db()
    .from("approvals")
    .select("*")
    .order("created_at", { ascending: false });
  if (filter.status) query = query.eq("status", filter.status);
  if (filter.entityType) query = query.eq("entity_type", filter.entityType);
  if (filter.entityId) query = query.eq("entity_id", filter.entityId);
  const { data, error } = await query;
  if (error) raise("listApprovals", error);
  return (data ?? []) as ApprovalRow[];
}

export async function updateApproval(
  id: string,
  patch: ApprovalPatch,
): Promise<ApprovalRow> {
  const { data, error } = await db()
    .from("approvals")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) raise("updateApproval", error);
  return data as ApprovalRow;
}

/**
 * Most recent approval matching (entityType, entityId, action) and, when
 * provided, status. Used by approval-gated routes (e.g. Shopify draft/publish).
 */
export async function findApproval(
  entityType: string,
  entityId: string,
  action: string,
  status?: ApprovalStatus,
): Promise<ApprovalRow | null> {
  let query = db()
    .from("approvals")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("action", action)
    .order("created_at", { ascending: false })
    .limit(1);
  if (status) query = query.eq("status", status);
  const { data, error } = await query.maybeSingle();
  if (error) raise("findApproval", error);
  return (data as ApprovalRow | null) ?? null;
}

// ---------------------------------------------------------------------------
// jobs
// ---------------------------------------------------------------------------

export async function insertJob(input: JobInsert): Promise<JobRow> {
  const { data, error } = await db().from("jobs").insert(input).select("*").single();
  if (error) raise("insertJob", error);
  return data as JobRow;
}

export async function findJobByIdempotencyKey(
  idempotencyKey: string,
): Promise<JobRow | null> {
  const { data, error } = await db()
    .from("jobs")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) raise("findJobByIdempotencyKey", error);
  return (data as JobRow | null) ?? null;
}

export async function updateJob(id: string, patch: JobPatch): Promise<JobRow> {
  const { data, error } = await db()
    .from("jobs")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) raise("updateJob", error);
  return data as JobRow;
}

export async function listRecentJobs(limit = 20): Promise<JobRow[]> {
  const { data, error } = await db()
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) raise("listRecentJobs", error);
  return (data ?? []) as JobRow[];
}

// ---------------------------------------------------------------------------
// activity_logs
// ---------------------------------------------------------------------------

export async function insertActivityLog(
  input: ActivityLogInsert,
): Promise<ActivityLogRow> {
  const { data, error } = await db()
    .from("activity_logs")
    .insert(input)
    .select("*")
    .single();
  if (error) raise("insertActivityLog", error);
  return data as ActivityLogRow;
}

export async function listRecentActivity(limit = 20): Promise<ActivityLogRow[]> {
  const { data, error } = await db()
    .from("activity_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) raise("listRecentActivity", error);
  return (data ?? []) as ActivityLogRow[];
}
