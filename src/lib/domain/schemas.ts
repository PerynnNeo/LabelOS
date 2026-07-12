import { z } from "zod";

/**
 * LabelOS domain schemas — the single source of truth for every JSON shape
 * that crosses a boundary: Claude structured outputs, JSONB database columns,
 * and API payloads.
 *
 * Conventions:
 * - Every confidence and component score is 0–1 (inclusive) unless stated.
 * - Claude structured outputs are re-validated with these schemas after the
 *   provider-side JSON-schema enforcement (numeric bounds are validated here
 *   in application code because JSON Schema numeric constraints are not
 *   supported by the structured-output API).
 */

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

export const garmentCategorySchema = z.enum([
  "top",
  "bottom",
  "dress",
  "outerwear",
  "footwear",
  "accessory",
  "other",
]);
export type GarmentCategory = z.infer<typeof garmentCategorySchema>;

export const productSourceSchema = z.enum(["upload", "shopify", "seed"]);
export type ProductSource = z.infer<typeof productSourceSchema>;

export const analysisStatusSchema = z.enum([
  "pending",
  "running",
  "complete",
  "failed",
]);
export type AnalysisStatus = z.infer<typeof analysisStatusSchema>;

export const outfitStatusSchema = z.enum([
  "candidate",
  "approved",
  "rejected",
  "revised",
  "final",
]);
export type OutfitStatus = z.infer<typeof outfitStatusSchema>;

export const approvalStatusSchema = z.enum(["pending", "approved", "rejected"]);
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

export const approvalActionSchema = z.enum([
  "CREATE_SHOPIFY_DRAFT",
  "PUBLISH_SHOPIFY",
  "APPROVE_DESIGN",
]);
export type ApprovalAction = z.infer<typeof approvalActionSchema>;

export const jobStatusSchema = z.enum([
  "queued",
  "running",
  "complete",
  "failed",
]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const supplierVerificationSchema = z.enum([
  "demo",
  "lead",
  "contacted",
  "verified",
]);
export type SupplierVerification = z.infer<typeof supplierVerificationSchema>;

export const productionStageSchema = z.enum([
  "RFQ_DRAFT",
  "QUOTE_RECEIVED",
  "SUPPLIER_SHORTLISTED",
  "SAMPLE_REQUESTED",
  "SAMPLE_REVIEW",
  "REVISION_REQUIRED",
  "SAMPLE_APPROVED",
  "PRODUCTION_APPROVAL_PENDING",
]);
export type ProductionStage = z.infer<typeof productionStageSchema>;

const score01 = z.number().min(0).max(1);

// ---------------------------------------------------------------------------
// Collection brief
// ---------------------------------------------------------------------------

export const collectionBriefSchema = z.object({
  market: z.string().min(1),
  season: z.string().min(1),
  climate: z.string().min(1),
  audience: z.string().min(1),
  priceTier: z.string().default("contemporary"),
  commercialObjective: z.string().min(1),
  heroProductIds: z.array(z.uuid()).default([]),
  prohibitedStyles: z.array(z.string()).default([]),
  allowUnavailableProducts: z.boolean().default(false),
  maxNewProducts: z.number().int().min(0).max(1).default(1),
  targetGrossMargin: z.number().min(0).max(0.95).default(0.7),
  notes: z.string().default(""),
});
export type CollectionBrief = z.infer<typeof collectionBriefSchema>;

// ---------------------------------------------------------------------------
// Garment analysis (Garment Librarian output)
// ---------------------------------------------------------------------------

export const materialObservationSchema = z.object({
  value: z.string(),
  confidence: score01,
  verified: z.boolean(),
  caveat: z.string(),
});

export const garmentAnalysisSchema = z.object({
  category: garmentCategorySchema,
  subcategory: z.string(),
  primaryColors: z.array(z.string()),
  secondaryColors: z.array(z.string()),
  pattern: z.string(),
  silhouette: z.string(),
  fit: z.string(),
  length: z.string(),
  texture: z.string(),
  materialObservation: materialObservationSchema,
  formality: score01,
  climateTags: z.array(z.string()),
  seasonTags: z.array(z.string()),
  occasionTags: z.array(z.string()),
  layeringRole: z.string(),
  styleTags: z.array(z.string()),
  compatibilityNotes: z.array(z.string()),
  warnings: z.array(z.string()),
  confidence: score01,
});
export type GarmentAnalysis = z.infer<typeof garmentAnalysisSchema>;

// ---------------------------------------------------------------------------
// Trend report (Trend Scout output)
// ---------------------------------------------------------------------------

export const trendSourceSchema = z.object({
  title: z.string(),
  url: z.string(),
  date: z.string().nullable(),
});

export const trendSignalSchema = z.object({
  name: z.string(),
  summary: z.string(),
  adoptionStage: z.enum([
    "emerging",
    "growing",
    "established",
    "declining",
    "uncertain",
  ]),
  relevanceToBrand: z.string(),
  climateFit: z.string(),
  confidence: score01,
  recommendedUse: z.array(z.string()),
  avoidBecause: z.array(z.string()),
  sources: z.array(trendSourceSchema),
});

export const trendReportSchema = z.object({
  title: z.string(),
  market: z.string(),
  season: z.string(),
  generatedAt: z.string(),
  sourceMode: z.enum(["live_web_search", "demo", "model_only"]),
  signals: z.array(trendSignalSchema),
  rejectedSignals: z.array(
    z.object({
      name: z.string(),
      reason: z.string(),
    }),
  ),
  limitations: z.array(z.string()),
});
export type TrendReport = z.infer<typeof trendReportSchema>;

// ---------------------------------------------------------------------------
// Outfit generation / composition / review
// ---------------------------------------------------------------------------

/** Deterministic candidate produced by code, before any Claude involvement. */
export const outfitCandidateSchema = z.object({
  candidateId: z.string(),
  productIds: z.array(z.uuid()).min(1),
  template: z.enum([
    "top_bottom",
    "top_bottom_outerwear",
    "dress",
    "dress_outerwear",
  ]),
  accessoryProductId: z.uuid().nullable(),
  heuristicScore: score01,
  heuristicReasons: z.array(z.string()),
});
export type OutfitCandidate = z.infer<typeof outfitCandidateSchema>;

/** Composer output for a batch of candidates. */
export const composerRankingSchema = z.object({
  rankings: z.array(
    z.object({
      candidateId: z.string(),
      title: z.string(),
      occasion: z.string(),
      description: z.string(),
      trendConnection: z.string(),
      commercialReason: z.string(),
      rank: z.number().int().min(1),
    }),
  ),
});
export type ComposerRanking = z.infer<typeof composerRankingSchema>;

export const reviewReasonCodeSchema = z.enum([
  "BRAND_DRIFT",
  "COLOUR_CONFLICT",
  "SEASON_MISMATCH",
  "FORMALITY_MISMATCH",
  "SKU_UNAVAILABLE",
  "ITEM_OVERUSED",
  "TOO_SIMILAR",
  "WEAK_TREND_EVIDENCE",
  "LOW_COMMERCIAL_VALUE",
  "OTHER",
]);
export type ReviewReasonCode = z.infer<typeof reviewReasonCodeSchema>;

export const outfitReviewScoresSchema = z.object({
  brandFit: score01,
  visualHarmony: score01,
  seasonClimateFit: score01,
  trendRelevance: score01,
  commercialValue: score01,
  novelty: score01,
});
export type OutfitReviewScores = z.infer<typeof outfitReviewScoresSchema>;

/**
 * Weights for the deterministic weighted score. Claude supplies component
 * scores; application code computes the final number with these weights.
 */
export const REVIEW_SCORE_WEIGHTS: Record<
  keyof OutfitReviewScores,
  number
> = {
  brandFit: 0.25,
  visualHarmony: 0.2,
  seasonClimateFit: 0.15,
  trendRelevance: 0.15,
  commercialValue: 0.15,
  novelty: 0.1,
};

/** Critic (Runway Jury) output. overallScore is computed by code, not Claude. */
export const outfitReviewSchema = z.object({
  scores: outfitReviewScoresSchema,
  verdict: z.enum(["approve", "revise", "reject"]),
  reasonCodes: z.array(reviewReasonCodeSchema),
  strengths: z.array(z.string()),
  issues: z.array(z.string()),
  revisionInstructions: z.array(z.string()),
});
export type OutfitReview = z.infer<typeof outfitReviewSchema>;

/** Review as stored: Claude output + code-computed weighted score. */
export const storedReviewSchema = outfitReviewSchema.extend({
  overallScore: score01,
  reviewedAt: z.string(),
  promptVersion: z.string(),
});
export type StoredReview = z.infer<typeof storedReviewSchema>;

/** Reviser output. */
export const revisionResultSchema = z.object({
  productIds: z.array(z.uuid()).min(1),
  corrections: z.array(
    z.object({
      reasonCode: reviewReasonCodeSchema,
      correction: z.string(),
    }),
  ),
  summary: z.string(),
});
export type RevisionResult = z.infer<typeof revisionResultSchema>;

export const curationLabelSchema = z.enum(["Core", "Directional", "Statement"]);
export type CurationLabel = z.infer<typeof curationLabelSchema>;

export const curationSummarySchema = z.object({
  selectedOutfitIds: z.array(z.uuid()),
  labels: z.record(z.string(), curationLabelSchema),
  occasionsCovered: z.array(z.string()),
  unmetConstraints: z.array(z.string()),
  notes: z.string(),
  curatedAt: z.string(),
});
export type CurationSummary = z.infer<typeof curationSummarySchema>;

// ---------------------------------------------------------------------------
// New design (Gap Designer output)
// ---------------------------------------------------------------------------

export const newDesignSchema = z.object({
  category: garmentCategorySchema,
  name: z.string(),
  problemSolved: z.string(),
  outfitIdsUnlocked: z.array(z.string()),
  targetCustomer: z.string(),
  silhouette: z.string(),
  colour: z.string(),
  colourHex: z.string(),
  constructionDirection: z.string(),
  fabricRequirements: z.array(z.string()),
  verifiedData: z.array(z.string()),
  assumedData: z.array(z.string()),
  targetRetailPrice: z.number().positive(),
  estimatedRisk: z.enum(["low", "medium", "high"]),
  originalitySafeguards: z.array(z.string()),
  openQuestions: z.array(z.string()),
  // Rendering hints for the deterministic flat-sketch generator
  sketchTemplate: z.enum(["top", "trouser", "skirt", "dress", "jacket"]),
  neckline: z.string().default("crew"),
  sleeveLength: z.enum(["sleeveless", "short", "elbow", "long"]).default("short"),
  garmentLength: z.enum(["cropped", "regular", "longline"]).default("regular"),
});
export type NewDesign = z.infer<typeof newDesignSchema>;

// ---------------------------------------------------------------------------
// Costing (deterministic — computed by code, never by Claude)
// ---------------------------------------------------------------------------

export const costingSchema = z.object({
  targetRetailPrice: z.number().positive(),
  targetGrossMargin: z.number().min(0).max(0.95),
  /** maximum_landed_cost = target_retail_price × (1 − target_gross_margin) */
  maximumLandedCost: z.number().nonnegative(),
  currency: z.string().default("SGD"),
  detailedEstimate: z.object({
    packagingAllowance: z.number().nonnegative(),
    freightAllowance: z.number().nonnegative(),
    dutyAllowance: z.number().nonnegative(),
    sampleAllocation: z.number().nonnegative(),
    returnAllowance: z.number().nonnegative(),
    maximumFactoryCost: z.number().nonnegative(),
  }),
  calculatedAt: z.string(),
});
export type Costing = z.infer<typeof costingSchema>;

// ---------------------------------------------------------------------------
// Tech pack (draft only)
// ---------------------------------------------------------------------------

export const TECH_PACK_DRAFT_STATUS = "DRAFT_REQUIRES_HUMAN_VERIFICATION" as const;

export const measurementRowSchema = z.object({
  pointOfMeasure: z.string(),
  /** Values are strings so cells can be "TBD". */
  sizes: z.record(z.string(), z.string()),
  toleranceCm: z.string(),
});

export const billOfMaterialsRowSchema = z.object({
  item: z.string(),
  placement: z.string(),
  composition: z.string(),
  supplierReference: z.string(),
  verified: z.boolean(),
});

export const techPackSchema = z.object({
  styleCode: z.string(),
  version: z.number().int().min(1),
  status: z.literal(TECH_PACK_DRAFT_STATUS),
  garmentName: z.string(),
  frontDetails: z.array(z.string()),
  backDetails: z.array(z.string()),
  constructionNotes: z.array(z.string()),
  billOfMaterials: z.array(billOfMaterialsRowSchema),
  trims: z.array(z.string()),
  measurementTable: z.array(measurementRowSchema),
  sizeRange: z.array(z.string()),
  artworkPlacement: z.array(z.string()),
  labelling: z.array(z.string()),
  packaging: z.array(z.string()),
  qualityChecks: z.array(z.string()),
  unresolvedQuestions: z.array(z.string()),
  assumptions: z.array(z.string()),
  disclaimer: z.string(),
});
export type TechPack = z.infer<typeof techPackSchema>;

// ---------------------------------------------------------------------------
// Suppliers, RFQs, quotes
// ---------------------------------------------------------------------------

export const rfqRequestSchema = z.object({
  brandReference: z.string(),
  styleReference: z.string(),
  quantity: z.number().int().positive(),
  sizeRange: z.array(z.string()),
  materialRequirements: z.array(z.string()),
  targetUnitPrice: z.number().positive(),
  currency: z.string(),
  sampleRequest: z.string(),
  deliveryTarget: z.string(),
  requestedQuoteFields: z.array(z.string()),
  unresolvedQuestions: z.array(z.string()),
  disclaimer: z.string(),
});
export type RfqRequest = z.infer<typeof rfqRequestSchema>;

export const quotePayloadSchema = z.object({
  unitPrice: z.number().positive(),
  currency: z.string(),
  minimumOrderQuantity: z.number().int().positive(),
  sampleFee: z.number().nonnegative(),
  sampleLeadDays: z.number().int().positive(),
  productionLeadDays: z.number().int().positive(),
  fabricResponsibility: z.string(),
  packagingIncluded: z.boolean(),
  paymentTerms: z.string(),
  qualityProcess: z.string(),
  defectPolicy: z.string(),
  communicationNotes: z.string(),
  freightEstimatePerUnit: z.number().nonnegative().default(0),
  dutyEstimatePerUnit: z.number().nonnegative().default(0),
});
export type QuotePayload = z.infer<typeof quotePayloadSchema>;

export const quoteComparisonSchema = z.object({
  rfqId: z.uuid(),
  supplierName: z.string(),
  landedCostEstimate: z.number().nonnegative(),
  moqFit: score01,
  sampleSpeed: score01,
  productionSpeed: score01,
  capabilityFit: score01,
  qualityConfidence: score01,
  priceFit: score01,
  totalScore: score01,
  withinMaxLandedCost: z.boolean(),
});
export type QuoteComparison = z.infer<typeof quoteComparisonSchema>;

// ---------------------------------------------------------------------------
// Listing (Listing Writer output)
// ---------------------------------------------------------------------------

export const listingPayloadSchema = z.object({
  title: z.string(),
  shortDescription: z.string(),
  htmlDescription: z.string(),
  bulletFeatures: z.array(z.string()),
  productType: z.string(),
  vendor: z.string(),
  tags: z.array(z.string()),
  seoTitle: z.string(),
  seoDescription: z.string(),
  sizeOptions: z.array(z.string()),
  price: z.number().positive(),
  currency: z.string(),
  status: z.literal("DRAFT"),
  careInformation: z.string(),
  materialInformationStatus: z.enum(["verified", "unverified", "pending_review"]),
  collectionStory: z.string(),
  imageUrl: z.string().nullable(),
});
export type ListingPayload = z.infer<typeof listingPayloadSchema>;

// ---------------------------------------------------------------------------
// Brand profile (app_settings.brand_profile JSONB)
// ---------------------------------------------------------------------------

export const brandProfileSchema = z.object({
  audience: z.string(),
  personality: z.array(z.string()),
  colours: z.array(z.string()),
  prohibitedStyles: z.array(z.string()),
  climate: z.string(),
  typicalPriceRange: z.object({
    min: z.number().nonnegative(),
    max: z.number().positive(),
    currency: z.string(),
  }),
  targetGrossMargin: z.number().min(0).max(0.95),
  defaultSeason: z.string(),
});
export type BrandProfile = z.infer<typeof brandProfileSchema>;

// ---------------------------------------------------------------------------
// Activity log usage shape
// ---------------------------------------------------------------------------

export const usageSchema = z.object({
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  webSearchRequests: z.number().int().nonnegative().default(0),
  durationMs: z.number().int().nonnegative().default(0),
});
export type Usage = z.infer<typeof usageSchema>;
