import { z } from "zod";

/**
 * New-collection creation schemas (LabelOS image-generation spec §9).
 *
 * LabelOS analyses the existing catalog only as *reference* to learn the brand,
 * then designs a brand-new seasonal capsule: a small set of new collection
 * "slots", each realised as three genuinely different garment design concepts
 * with generated concept images. These Zod schemas are the contract for the
 * Collection Architect and Garment Designer agents and for the image pipeline.
 */

const score01 = z.number().min(0).max(1);
const score100 = z.number().min(0).max(100);

export const designCategorySchema = z.enum([
  "top",
  "bottom",
  "dress",
  "outerwear",
  "knitwear",
  "accessory",
]);
export type DesignCategory = z.infer<typeof designCategorySchema>;

export const designRoleSchema = z.enum(["core", "directional", "statement"]);
export type DesignRole = z.infer<typeof designRoleSchema>;

// ---------------------------------------------------------------------------
// Brand DNA (Agent 2) — abstract brand principles learned from the reference
// catalog, never a copy of any single existing garment.
// ---------------------------------------------------------------------------

export const brandDnaSchema = z.object({
  summary: z.string(),
  targetCustomerInterpretation: z.string(),
  colourPalette: z.array(
    z.object({
      name: z.string(),
      hex: z.string(),
      usage: z.enum(["primary", "secondary", "accent", "avoid"]),
      confidence: score01,
    }),
  ),
  silhouettePatterns: z.array(
    z.object({
      name: z.string(),
      evidenceProductIds: z.array(z.string()),
      confidence: score01,
    }),
  ),
  categoryMix: z.array(
    z.object({ category: z.string(), count: z.number().int().nonnegative() }),
  ),
  priceArchitecture: z.object({
    entry: z.number().nonnegative(),
    core: z.number().nonnegative(),
    premium: z.number().nonnegative(),
  }),
  materialPatterns: z.array(
    z.object({
      label: z.string(),
      verification: z.enum([
        "merchant_provided",
        "supplier_provided",
        "visual_guess",
        "unknown",
      ]),
      confidence: score01,
    }),
  ),
  strengths: z.array(z.string()),
  risks: z.array(z.string()),
  doNotDuplicate: z.array(z.string()),
  uncertaintyNotes: z.array(z.string()),
});
export type BrandDna = z.infer<typeof brandDnaSchema>;

// ---------------------------------------------------------------------------
// Collection slot (Agent 4 — Collection Architect). One new product to design.
// ---------------------------------------------------------------------------

export const collectionSlotSchema = z.object({
  provisionalStyleId: z.string(),
  category: designCategorySchema,
  role: designRoleSchema,
  productOpportunity: z.string(),
  customerNeed: z.string(),
  intendedOccasions: z.array(z.string()),
  climateRequirements: z.array(z.string()),
  targetRetailPrice: z.number().positive(),
  targetFullyLoadedCost: z.number().positive(),
  targetMarginPercent: score100,
  coordinationRequirements: z.array(z.string()),
  nonDuplicationReason: z.string(),
  developmentRiskLimit: z.enum(["low", "medium", "high"]),
  rationale: z.string(),
});
export type CollectionSlot = z.infer<typeof collectionSlotSchema>;

export const collectionPlanSchema = z.object({
  collectionName: z.string(),
  season: z.string(),
  colourStory: z.string(),
  slots: z.array(collectionSlotSchema).min(1).max(6),
  totalFirstRunCommitmentEstimate: z.number().nonnegative(),
  fitsProductionBudget: z.boolean(),
  budgetNote: z.string(),
});
export type CollectionPlan = z.infer<typeof collectionPlanSchema>;

// ---------------------------------------------------------------------------
// Garment design spec (Agent 5 — Garment Designer). One concept for a slot.
// ---------------------------------------------------------------------------

export const colourwaySchema = z.object({
  name: z.string(),
  hex: z.string(),
  role: z.enum(["primary", "secondary", "accent"]),
});

export const garmentDesignSpecSchema = z.object({
  styleId: z.string(),
  productName: z.string(),
  conceptTitle: z.string(),
  category: designCategorySchema,
  role: designRoleSchema,
  silhouette: z.string(),
  fit: z.string(),
  length: z.string(),
  neckline: z.string().nullable(),
  collar: z.string().nullable(),
  sleeveLength: z.string().nullable(),
  sleeveShape: z.string().nullable(),
  waistConstruction: z.string().nullable(),
  hem: z.string(),
  closures: z.array(z.string()),
  pockets: z.array(z.string()),
  seamDetails: z.array(z.string()),
  constructionDetails: z.array(z.string()),
  primaryMaterialRequirement: z.object({
    fibreRequirement: z.string(),
    targetWeightGsmMin: z.number().nullable(),
    targetWeightGsmMax: z.number().nullable(),
    handFeel: z.string(),
    drape: z.string(),
    stretch: z.string(),
    opacity: z.string(),
    verificationNeeded: z.boolean(),
  }),
  trims: z.array(z.string()),
  colourways: z.array(colourwaySchema).min(1),
  targetRetailPrice: z.number().positive(),
  targetFullyLoadedCost: z.number().positive(),
  estimatedMarginPercent: score100,
  coordinatesWithSlotIds: z.array(z.string()),
  brandFitReason: z.string(),
  trendReason: z.string(),
  climateReason: z.string(),
  commercialReason: z.string(),
  manufacturabilityRisks: z.array(z.string()),
  unknowns: z.array(z.string()),
  originalityCheck: z.object({
    avoidsDirectCopy: z.boolean(),
    notes: z.string(),
  }),
  imagePromptFacts: z.object({
    garmentOnly: z.literal(true),
    frontBackSheet: z.literal(true),
    background: z.string(),
    visualStyle: z.string(),
  }),
  // Scores the Garment Design cards display. Computed/assigned deterministically
  // where the spec requires it, but the designer may supply an initial read.
  brandFitScore: score01.default(0.8),
  climateFitScore: score01.default(0.8),
  manufacturabilityScore: score01.default(0.75),
});
export type GarmentDesignSpec = z.infer<typeof garmentDesignSpecSchema>;

/** A slot's three concepts, one flagged AI-recommended. */
export const conceptSetSchema = z.object({
  slotIndex: z.number().int().nonnegative(),
  provisionalStyleId: z.string(),
  concepts: z.array(garmentDesignSpecSchema).length(3),
  recommendedStyleId: z.string(),
  recommendationReason: z.string(),
});
export type ConceptSet = z.infer<typeof conceptSetSchema>;

// ---------------------------------------------------------------------------
// Visual QA (Agent 6) — Claude Vision checks the generated image vs. the spec.
// ---------------------------------------------------------------------------

export const visualQaSchema = z.object({
  categoryMatches: z.boolean(),
  frontBackConsistent: z.boolean(),
  keyDetailsPresent: z.array(z.string()),
  keyDetailsMissing: z.array(z.string()),
  forbiddenElements: z.array(z.string()),
  imageUsable: z.boolean(),
  confidence: score01,
  recommendation: z.enum(["accept", "regenerate", "owner_review"]),
  explanation: z.string(),
});
export type VisualQa = z.infer<typeof visualQaSchema>;

// ---------------------------------------------------------------------------
// Collection review (Agent 7) — the four owner-selected designs judged as one.
// ---------------------------------------------------------------------------

export const collectionReviewSchema = z.object({
  overallScore: score100,
  brandCoherence: score100,
  categoryBalance: score100,
  colourStory: score100,
  climateSuitability: score100,
  priceArchitecture: score100,
  outfitCompatibility: score100,
  manufacturability: score100,
  productionBudgetFit: score100,
  duplicateRisk: score100,
  strengths: z.array(z.string()),
  blockingIssues: z.array(
    z.object({
      designId: z.string().nullable(),
      code: z.string(),
      explanation: z.string(),
      suggestedRevision: z.string(),
    }),
  ),
  recommendedOutfits: z.array(
    z.object({
      title: z.string(),
      designIds: z.array(z.string()),
      occasion: z.string(),
      reason: z.string(),
    }),
  ),
  recommendation: z.enum(["approve", "revise", "reject"]),
});
export type CollectionReview = z.infer<typeof collectionReviewSchema>;

// ---------------------------------------------------------------------------
// Image pipeline value types
// ---------------------------------------------------------------------------

export const imageTypeSchema = z.enum([
  "concept_sheet",
  "technical_flat_front",
  "technical_flat_back",
  "final_packshot_front",
  "final_packshot_back",
  "colourway",
  "collection_preview",
]);
export type ImageType = z.infer<typeof imageTypeSchema>;

export const imageJobStatusSchema = z.enum([
  "queued",
  "generating",
  "running_qa",
  "ready",
  "needs_regeneration",
  "failed",
  "canceled",
]);
export type ImageJobStatus = z.infer<typeof imageJobStatusSchema>;

export const conceptStatusSchema = z.enum([
  "generating",
  "shortlisted",
  "recommended",
  "selected",
  "rejected",
]);
export type ConceptStatus = z.infer<typeof conceptStatusSchema>;

/** Availability states a new product can truthfully show (spec §3 stage 6, §22). */
export const availabilityStateSchema = z.enum([
  "concept_approved",
  "specification_ready",
  "sampling",
  "sample_approved",
  "in_production",
  "coming_soon",
  "waitlist",
  "preorder",
  "in_stock",
]);
export type AvailabilityState = z.infer<typeof availabilityStateSchema>;
