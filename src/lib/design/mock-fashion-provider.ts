import "server-only";
import type {
  CollectionPlan,
  CollectionReview,
  CollectionSlot,
  ConceptSet,
  DesignCategory,
  GarmentDesignSpec,
  VisualQa,
} from "@/lib/domain/design-schemas";
import {
  collectionPlanSchema,
  collectionReviewSchema,
  conceptSetSchema,
  visualQaSchema,
} from "@/lib/domain/design-schemas";
import { usageSchema, type Usage } from "@/lib/domain/schemas";
import { computeCosting } from "@/lib/domain/costing";
import type {
  CollectionPlanResult,
  CollectionReviewResult,
  ConceptSetResult,
  CreateCollectionPlanInput,
  CreateConceptSetInput,
  FashionReasoningProvider,
  ReviewCollectionInput,
  RunVisualQaInput,
  VisualQaResult,
} from "./fashion-provider";

/**
 * High-quality deterministic mock fashion-reasoning provider (image-generation
 * spec §17). Not an empty stub: it returns rich, schema-valid values for the
 * whole new-collection flow with NO external call, so the demo behaves
 * identically every run.
 *
 * - createCollectionPlan → the four-slot "Meridian" tropical-city capsule
 *   (relaxed warm-weather shirt, pleated wide-leg trouser, draped day-to-evening
 *   dress, lightweight overshirt) with SGD prices and 70% target margins.
 * - createConceptSet → three genuinely different garment concepts per slot,
 *   varying silhouette/neckline/sleeve/closure/pockets/hem/length so the
 *   deterministic SVG renderer draws visibly different garments; one recommended.
 * - runVisualQa → an accepting, usable verdict derived from the spec facts.
 * - reviewCollection → a coherent review with three outfits built from the
 *   selected design IDs.
 *
 * Every cost/margin figure comes from the deterministic costing module — never
 * language-model arithmetic. All outputs are re-validated against their Zod
 * schemas before return, so a contract drift fails loudly in tests.
 */

// ---------------------------------------------------------------------------
// Numeric helpers
// ---------------------------------------------------------------------------

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampMarginFraction(fraction: number): number {
  if (!Number.isFinite(fraction)) return 0.7;
  return Math.min(0.95, Math.max(0.05, fraction));
}

interface SlotCosts {
  targetRetailPrice: number;
  targetFullyLoadedCost: number;
  targetMarginPercent: number;
}

/**
 * Deterministic per-product costing via the costing module. Given a retail
 * price and a target gross-margin fraction it derives the fully-loaded cost
 * (= maximum landed cost) and the exact margin percent — never LM arithmetic.
 */
function slotCosts(
  retail: number,
  marginFraction: number,
  currency = "SGD",
): SlotCosts {
  const price = Number.isFinite(retail) && retail > 0 ? round2(retail) : 100;
  const margin = clampMarginFraction(marginFraction);
  const costing = computeCosting({
    targetRetailPrice: price,
    targetGrossMargin: margin,
    currency,
  });
  const fullyLoaded =
    costing.maximumLandedCost > 0
      ? costing.maximumLandedCost
      : round2(price * 0.3);
  const marginPercent = round2((1 - fullyLoaded / price) * 100);
  return {
    targetRetailPrice: price,
    targetFullyLoadedCost: fullyLoaded,
    targetMarginPercent: marginPercent,
  };
}

function mockUsage(): Usage {
  return usageSchema.parse({
    inputTokens: 0,
    outputTokens: 0,
    webSearchRequests: 0,
    durationMs: 6,
  });
}

// ---------------------------------------------------------------------------
// Collection plan — the fixed "Meridian" four-slot tropical-city capsule
// ---------------------------------------------------------------------------

interface MeridianSlotSeed {
  provisionalStyleId: string;
  category: DesignCategory;
  role: "core" | "directional" | "statement";
  retail: number;
  productOpportunity: string;
  customerNeed: string;
  intendedOccasions: string[];
  climateRequirements: string[];
  coordinationRequirements: string[];
  nonDuplicationReason: string;
  developmentRiskLimit: "low" | "medium" | "high";
  rationale: string;
}

const MERIDIAN_MARGIN_FRACTION = 0.7;
const MERIDIAN_FIRST_RUN_UNITS = 60;

const MERIDIAN_SLOTS: MeridianSlotSeed[] = [
  {
    provisionalStyleId: "TOP-NEW-001",
    category: "top",
    role: "core",
    retail: 129,
    productOpportunity:
      "A relaxed warm-weather shirt that reads considered rather than casual and photographs cleanly for the store.",
    customerNeed:
      "A breathable everyday top that survives a humid commute and still looks pulled together in air-conditioning.",
    intendedOccasions: ["work", "weekend", "travel"],
    climateRequirements: ["hot", "humid", "breathable", "quick-drying"],
    coordinationRequirements: [
      "Tucks into BOTTOM-NEW-001 for a tonal daytime column",
      "Layers under LAYER-NEW-001 without collar bulk",
    ],
    nonDuplicationReason:
      "Reference tops are fitted jerseys; this is a woven, boxy camp-collar shirt with a patch pocket and side vents — a different construction and silhouette.",
    developmentRiskLimit: "low",
    rationale:
      "A core woven top anchors most outfits in the capsule and is the brand's most repeatable warm-weather piece.",
  },
  {
    provisionalStyleId: "BOTTOM-NEW-001",
    category: "bottom",
    role: "core",
    retail: 169,
    productOpportunity:
      "A pleated wide-leg trouser that gives the capsule an elevated, fluid bottom with airflow.",
    customerNeed:
      "A smart trouser that keeps its line in the heat and dresses up or down across the day.",
    intendedOccasions: ["work", "dinner", "weekend"],
    climateRequirements: ["hot", "humid", "airflow"],
    coordinationRequirements: [
      "Anchors TOP-NEW-001 for a tucked workday look",
      "Reads clean under LAYER-NEW-001 for commute-to-office",
      "Shares the tonal palette that ties to DRESS-NEW-001",
    ],
    nonDuplicationReason:
      "Reference bottoms are slim cropped jeans; this is a high-waisted pleated wide-leg in a fluid woven — different rise, leg and fabric behaviour.",
    developmentRiskLimit: "low",
    rationale:
      "A second core piece: a versatile bottom that multiplies outfit combinations with the top and the layer.",
  },
  {
    provisionalStyleId: "DRESS-NEW-001",
    category: "dress",
    role: "directional",
    retail: 239,
    productOpportunity:
      "A draped day-to-evening dress that carries the collection's directional, fluid mood.",
    customerNeed:
      "One easy piece that moves from a warm daytime event to dinner without a change of clothes.",
    intendedOccasions: ["dinner", "occasion", "evening"],
    climateRequirements: ["hot", "humid", "fluid", "breathable"],
    coordinationRequirements: [
      "Wears open under LAYER-NEW-001 as a light duster look",
      "Shares the tonal palette anchored by TOP-NEW-001 and BOTTOM-NEW-001",
    ],
    nonDuplicationReason:
      "The brand has no dress in the reference catalog; this bias-draped one-piece introduces a new category rather than restyling an existing product.",
    developmentRiskLimit: "medium",
    rationale:
      "A directional hero that raises the collection's price ceiling and gives it an evening story.",
  },
  {
    provisionalStyleId: "LAYER-NEW-001",
    category: "outerwear",
    role: "directional",
    retail: 199,
    productOpportunity:
      "A lightweight overshirt layer that bridges air-conditioned interiors and humid streets.",
    customerNeed:
      "A breathable topper for over-cooled offices that never reads as heavy outerwear.",
    intendedOccasions: ["commute", "work", "evening"],
    climateRequirements: ["hot", "humid", "lightweight", "unlined"],
    coordinationRequirements: [
      "Throws over TOP-NEW-001 and BOTTOM-NEW-001 for commute-to-office",
      "Doubles as a light duster over DRESS-NEW-001",
    ],
    nonDuplicationReason:
      "Reference outerwear is a structured denim jacket; this is an unlined, drop-shoulder overshirt in a light weave — a distinct weight, structure and use.",
    developmentRiskLimit: "medium",
    rationale:
      "A directional layer that unlocks commute and evening looks the capsule otherwise lacks in a tropical climate.",
  },
];

function buildMeridianSlot(seed: MeridianSlotSeed): CollectionSlot {
  const costs = slotCosts(seed.retail, MERIDIAN_MARGIN_FRACTION);
  return {
    provisionalStyleId: seed.provisionalStyleId,
    category: seed.category,
    role: seed.role,
    productOpportunity: seed.productOpportunity,
    customerNeed: seed.customerNeed,
    intendedOccasions: seed.intendedOccasions,
    climateRequirements: seed.climateRequirements,
    targetRetailPrice: costs.targetRetailPrice,
    targetFullyLoadedCost: costs.targetFullyLoadedCost,
    targetMarginPercent: costs.targetMarginPercent,
    coordinationRequirements: seed.coordinationRequirements,
    nonDuplicationReason: seed.nonDuplicationReason,
    developmentRiskLimit: seed.developmentRiskLimit,
    rationale: seed.rationale,
  };
}

function buildMeridianPlan(input: CreateCollectionPlanInput): CollectionPlan {
  const season = input.brief.season || "Tropical Resort";
  const market = input.brief.market || "Singapore";
  const slots = MERIDIAN_SLOTS.map(buildMeridianSlot);

  const firstRunCommitment = round2(
    slots.reduce(
      (sum, slot) => sum + slot.targetFullyLoadedCost * MERIDIAN_FIRST_RUN_UNITS,
      0,
    ),
  );

  return {
    collectionName: `Meridian — ${season}`,
    season,
    colourStory:
      "A quiet tonal palette of ivory, sand and sea-salt blue grounded by palm and ink, layered tone-on-tone for humid-city ease.",
    slots,
    totalFirstRunCommitmentEstimate: firstRunCommitment,
    fitsProductionBudget: true,
    budgetNote: `Preliminary first-run estimate of ${firstRunCommitment.toFixed(0)} SGD assumes ${MERIDIAN_FIRST_RUN_UNITS} units per style at target fully-loaded cost for ${market}. This is a planning target, not a supplier quote — confirm against the production budget before committing.`,
  };
}

// ---------------------------------------------------------------------------
// Concept sets — three visibly different concepts per slot category
// ---------------------------------------------------------------------------

interface ColourwaySeed {
  name: string;
  hex: string;
  role: "primary" | "secondary" | "accent";
}

interface ConceptRecipe {
  suffix: "A" | "B" | "C";
  productName: string;
  conceptTitle: string;
  silhouette: string;
  fit: string;
  length: string;
  neckline: string | null;
  collar: string | null;
  sleeveLength: string | null;
  sleeveShape: string | null;
  waistConstruction: string | null;
  hem: string;
  closures: string[];
  pockets: string[];
  seamDetails: string[];
  constructionDetails: string[];
  fibreRequirement: string;
  gsmMin: number | null;
  gsmMax: number | null;
  handFeel: string;
  drape: string;
  stretch: string;
  opacity: string;
  trims: string[];
  colourways: ColourwaySeed[];
  brandFitScore: number;
  climateFitScore: number;
  manufacturabilityScore: number;
  manufacturabilityRisks: string[];
  unknowns: string[];
  distinctionNote: string;
  /** Retail multiplier off the slot target, so prices stay slot-consistent. */
  priceFactor: number;
}

const TOP_RECIPES: ConceptRecipe[] = [
  {
    suffix: "A",
    productName: "Isla Camp-Collar Shirt",
    conceptTitle: "Boxy camp-collar resort shirt",
    silhouette: "boxy",
    fit: "relaxed",
    length: "hip",
    neckline: "camp collar",
    collar: "camp collar",
    sleeveLength: "short",
    sleeveShape: "straight set-in",
    waistConstruction: null,
    hem: "straight hem with side vents",
    closures: ["button placket"],
    pockets: ["patch"],
    seamDetails: ["single-needle topstitch"],
    constructionDetails: ["one-piece camp collar", "left chest patch pocket"],
    fibreRequirement: "lightweight linen-cotton blend",
    gsmMin: 120,
    gsmMax: 150,
    handFeel: "dry, crisp",
    drape: "soft with body",
    stretch: "none",
    opacity: "opaque",
    trims: ["corozo buttons", "woven brand label"],
    colourways: [
      { name: "Ivory", hex: "#EDE6D6", role: "primary" },
      { name: "Palm Shadow", hex: "#4B5B4A", role: "accent" },
    ],
    brandFitScore: 0.9,
    climateFitScore: 0.92,
    manufacturabilityScore: 0.85,
    manufacturabilityRisks: ["Camp collar roll line needs a fit sample to confirm."],
    unknowns: ["Final blend ratio and shrinkage after wash."],
    distinctionNote:
      "camp collar, short sleeves, button placket and a chest patch pocket on a boxy hip-length body",
    priceFactor: 1,
  },
  {
    suffix: "B",
    productName: "Isla V-Neck Popover",
    conceptTitle: "Straight long-sleeve pullover popover",
    silhouette: "straight",
    fit: "regular",
    length: "hip",
    neckline: "v-neck",
    collar: null,
    sleeveLength: "long",
    sleeveShape: "rolled with tab",
    waistConstruction: null,
    hem: "clean straight hem",
    closures: [],
    pockets: [],
    seamDetails: ["flat-felled side seams"],
    constructionDetails: ["bound v-neckline", "sleeve roll tabs"],
    fibreRequirement: "airy cotton voile",
    gsmMin: 90,
    gsmMax: 115,
    handFeel: "soft, breezy",
    drape: "fluid",
    stretch: "none",
    opacity: "semi-sheer",
    trims: ["self-fabric neck binding"],
    colourways: [
      { name: "Sea-salt", hex: "#A9C4CE", role: "primary" },
      { name: "Ivory", hex: "#EDE6D6", role: "secondary" },
    ],
    brandFitScore: 0.82,
    climateFitScore: 0.88,
    manufacturabilityScore: 0.8,
    manufacturabilityRisks: ["Semi-sheer voile needs careful seam finishing."],
    unknowns: ["Opacity acceptance in lighter colourways."],
    distinctionNote:
      "a collarless v-neck pullover with long roll-tab sleeves and no pockets — no front placket",
    priceFactor: 0.95,
  },
  {
    suffix: "C",
    productName: "Isla Sleeveless Shell",
    conceptTitle: "Cropped sleeveless scoop shell",
    silhouette: "straight",
    fit: "relaxed",
    length: "cropped",
    neckline: "scoop",
    collar: null,
    sleeveLength: "sleeveless",
    sleeveShape: null,
    waistConstruction: null,
    hem: "curved cropped hem",
    closures: [],
    pockets: [],
    seamDetails: ["bias-bound armholes"],
    constructionDetails: ["deep scoop neckline", "bias armhole binding"],
    fibreRequirement: "textured cotton-slub",
    gsmMin: 130,
    gsmMax: 160,
    handFeel: "dry, textured",
    drape: "structured",
    stretch: "none",
    opacity: "opaque",
    trims: ["self-bias binding"],
    colourways: [
      { name: "Palm Shadow", hex: "#4B5B4A", role: "primary" },
      { name: "Sand", hex: "#D8C7A9", role: "accent" },
    ],
    brandFitScore: 0.8,
    climateFitScore: 0.9,
    manufacturabilityScore: 0.88,
    manufacturabilityRisks: ["Cropped length grading across sizes needs review."],
    unknowns: ["Preferred crop length for the target customer."],
    distinctionNote:
      "a sleeveless scoop-neck shell cropped at the waist — no collar, no sleeves, no pockets",
    priceFactor: 1.05,
  },
];

const BOTTOM_RECIPES: ConceptRecipe[] = [
  {
    suffix: "A",
    productName: "Isla Pleated Wide-Leg Trouser",
    conceptTitle: "High-waist pleated wide-leg",
    silhouette: "wide",
    fit: "relaxed",
    length: "full",
    neckline: null,
    collar: null,
    sleeveLength: null,
    sleeveShape: null,
    waistConstruction: "pleated high waist",
    hem: "clean full-length hem",
    closures: ["hook-and-bar", "concealed zip fly"],
    pockets: ["side"],
    seamDetails: ["front pleats"],
    constructionDetails: ["double forward pleats", "curtain waistband"],
    fibreRequirement: "fluid tencel-linen blend",
    gsmMin: 160,
    gsmMax: 200,
    handFeel: "cool, smooth",
    drape: "fluid",
    stretch: "none",
    opacity: "opaque",
    trims: ["hook-and-bar", "concealed zip"],
    colourways: [
      { name: "Sand", hex: "#D8C7A9", role: "primary" },
      { name: "Ink", hex: "#23303A", role: "accent" },
    ],
    brandFitScore: 0.9,
    climateFitScore: 0.9,
    manufacturabilityScore: 0.82,
    manufacturabilityRisks: ["Pleat depth and drape need a fit sample."],
    unknowns: ["Final fabric weight for clean pleat retention."],
    distinctionNote:
      "a high-waisted wide leg with forward pleats and slant side pockets, full length",
    priceFactor: 1,
  },
  {
    suffix: "B",
    productName: "Isla Tapered Pull-On Trouser",
    conceptTitle: "Elastic-waist tapered pull-on",
    silhouette: "tapered",
    fit: "slim",
    length: "full",
    neckline: null,
    collar: null,
    sleeveLength: null,
    sleeveShape: null,
    waistConstruction: "elasticated drawcord waist",
    hem: "narrow clean ankle hem",
    closures: ["drawcord"],
    pockets: ["side"],
    seamDetails: [],
    constructionDetails: ["covered elastic waistband", "internal drawcord"],
    fibreRequirement: "soft washed cotton poplin",
    gsmMin: 130,
    gsmMax: 160,
    handFeel: "soft, dry",
    drape: "light",
    stretch: "waistband only",
    opacity: "opaque",
    trims: ["flat drawcord", "internal elastic"],
    colourways: [
      { name: "Stone", hex: "#B9AE97", role: "primary" },
      { name: "Ivory", hex: "#EDE6D6", role: "secondary" },
    ],
    brandFitScore: 0.8,
    climateFitScore: 0.9,
    manufacturabilityScore: 0.88,
    manufacturabilityRisks: ["Waistband recovery after repeated wear."],
    unknowns: ["Preferred taper break at the ankle."],
    distinctionNote:
      "a narrow tapered leg with a soft elastic pull-on waist and no pleats",
    priceFactor: 0.92,
  },
  {
    suffix: "C",
    productName: "Isla Cropped Wide Culotte",
    conceptTitle: "Cropped pleated culotte",
    silhouette: "wide",
    fit: "relaxed",
    length: "cropped",
    neckline: null,
    collar: null,
    sleeveLength: null,
    sleeveShape: null,
    waistConstruction: "pleated high waist",
    hem: "wide cropped hem",
    closures: ["side zip"],
    pockets: ["welt"],
    seamDetails: ["front pleats"],
    constructionDetails: ["single deep pleat", "back welt pockets"],
    fibreRequirement: "crisp linen blend",
    gsmMin: 170,
    gsmMax: 210,
    handFeel: "dry, crisp",
    drape: "structured",
    stretch: "none",
    opacity: "opaque",
    trims: ["invisible side zip"],
    colourways: [
      { name: "Ink", hex: "#23303A", role: "primary" },
      { name: "Sand", hex: "#D8C7A9", role: "accent" },
    ],
    brandFitScore: 0.82,
    climateFitScore: 0.88,
    manufacturabilityScore: 0.84,
    manufacturabilityRisks: ["Cropped wide hem can flare unevenly without a sample."],
    unknowns: ["Final crop length above the ankle."],
    distinctionNote:
      "a cropped wide culotte with pleats and back welt pockets — shorter than the full-length options",
    priceFactor: 1.03,
  },
];

const DRESS_RECIPES: ConceptRecipe[] = [
  {
    suffix: "A",
    productName: "Isla Bias Column Dress",
    conceptTitle: "Sleeveless bias column",
    silhouette: "column",
    fit: "fitted",
    length: "midi",
    neckline: "v-neck",
    collar: null,
    sleeveLength: "sleeveless",
    sleeveShape: null,
    waistConstruction: "bias seaming",
    hem: "fluid midi hem",
    closures: ["concealed back zip"],
    pockets: [],
    seamDetails: ["bias front and back panels"],
    constructionDetails: ["bias-cut column body", "narrow shoulder straps"],
    fibreRequirement: "fluid viscose-crepe",
    gsmMin: 120,
    gsmMax: 150,
    handFeel: "cool, silky",
    drape: "liquid",
    stretch: "slight bias give",
    opacity: "opaque",
    trims: ["concealed zip"],
    colourways: [
      { name: "Ink", hex: "#23303A", role: "primary" },
      { name: "Sea-salt", hex: "#A9C4CE", role: "accent" },
    ],
    brandFitScore: 0.9,
    climateFitScore: 0.88,
    manufacturabilityScore: 0.78,
    manufacturabilityRisks: ["Bias cut needs careful grain control and hanging."],
    unknowns: ["Final drape at the target fabric weight."],
    distinctionNote:
      "a narrow sleeveless v-neck column that skims to a midi hem",
    priceFactor: 1,
  },
  {
    suffix: "B",
    productName: "Isla Draped A-Line Dress",
    conceptTitle: "Short-sleeve draped a-line",
    silhouette: "a-line",
    fit: "relaxed",
    length: "midi",
    neckline: "scoop",
    collar: null,
    sleeveLength: "short",
    sleeveShape: "cap",
    waistConstruction: "seamed waist",
    hem: "flared midi hem",
    closures: ["keyhole button"],
    pockets: ["side"],
    seamDetails: ["released pleats at the waist"],
    constructionDetails: ["seamed waist with released pleats", "cap sleeves"],
    fibreRequirement: "airy cotton-lawn",
    gsmMin: 100,
    gsmMax: 130,
    handFeel: "soft, dry",
    drape: "swingy",
    stretch: "none",
    opacity: "opaque",
    trims: ["keyhole button", "self-covered loop"],
    colourways: [
      { name: "Clay", hex: "#B08463", role: "primary" },
      { name: "Ivory", hex: "#EDE6D6", role: "secondary" },
    ],
    brandFitScore: 0.84,
    climateFitScore: 0.9,
    manufacturabilityScore: 0.86,
    manufacturabilityRisks: ["Even pleat release across sizes needs grading."],
    unknowns: ["Sleeve cap volume preference."],
    distinctionNote:
      "a scoop-neck a-line that flares from a seamed waist, with short cap sleeves and side pockets",
    priceFactor: 0.94,
  },
  {
    suffix: "C",
    productName: "Isla Wrap Midi Dress",
    conceptTitle: "Elbow-sleeve wrap dress",
    silhouette: "wrap",
    fit: "relaxed",
    length: "knee",
    neckline: "v-neck",
    collar: null,
    sleeveLength: "elbow",
    sleeveShape: "flutter",
    waistConstruction: "self-tie wrap waist",
    hem: "knee-length wrap hem",
    closures: ["self-tie wrap"],
    pockets: [],
    seamDetails: ["wrap front overlap"],
    constructionDetails: ["true wrap front", "inner waist stay"],
    fibreRequirement: "soft rayon-linen",
    gsmMin: 120,
    gsmMax: 150,
    handFeel: "soft, cool",
    drape: "fluid",
    stretch: "none",
    opacity: "opaque",
    trims: ["self-tie belt", "inner tie"],
    colourways: [
      { name: "Sea-salt", hex: "#A9C4CE", role: "primary" },
      { name: "Palm Shadow", hex: "#4B5B4A", role: "accent" },
    ],
    brandFitScore: 0.83,
    climateFitScore: 0.88,
    manufacturabilityScore: 0.85,
    manufacturabilityRisks: ["Wrap coverage and gape need a fit sample."],
    unknowns: ["Wrap depth for modest coverage."],
    distinctionNote:
      "a true wrap front with a v-neck, elbow flutter sleeves and a shorter knee-length hem",
    priceFactor: 1.04,
  },
];

const OUTERWEAR_RECIPES: ConceptRecipe[] = [
  {
    suffix: "A",
    productName: "Isla Camp-Collar Overshirt",
    conceptTitle: "Boxy long-sleeve overshirt",
    silhouette: "boxy",
    fit: "relaxed",
    length: "hip",
    neckline: "camp collar",
    collar: "camp collar",
    sleeveLength: "long",
    sleeveShape: "drop shoulder",
    waistConstruction: null,
    hem: "straight hip hem",
    closures: ["button placket"],
    pockets: ["patch"],
    seamDetails: ["felled seams"],
    constructionDetails: ["twin chest patch pockets", "one-piece camp collar"],
    fibreRequirement: "light unlined linen blend",
    gsmMin: 150,
    gsmMax: 190,
    handFeel: "dry, airy",
    drape: "soft with body",
    stretch: "none",
    opacity: "opaque",
    trims: ["corozo buttons", "hanging loop"],
    colourways: [
      { name: "Stone", hex: "#B9AE97", role: "primary" },
      { name: "Ink", hex: "#23303A", role: "accent" },
    ],
    brandFitScore: 0.9,
    climateFitScore: 0.9,
    manufacturabilityScore: 0.85,
    manufacturabilityRisks: ["Unlined seams must be clean-finished inside."],
    unknowns: ["Final weight that stays crisp but breathable."],
    distinctionNote:
      "a boxy hip-length overshirt with a camp collar, long drop-shoulder sleeves and twin patch pockets",
    priceFactor: 1,
  },
  {
    suffix: "B",
    productName: "Isla Longline Duster",
    conceptTitle: "Longline open-front duster",
    silhouette: "straight",
    fit: "relaxed",
    length: "longline",
    neckline: "notch lapel",
    collar: "notch lapel",
    sleeveLength: "long",
    sleeveShape: "straight",
    waistConstruction: null,
    hem: "longline hem with centre-back vent",
    closures: ["open front", "self tie belt"],
    pockets: ["patch"],
    seamDetails: ["centre-back vent"],
    constructionDetails: ["notch lapel", "patch hip pockets", "self belt"],
    fibreRequirement: "fluid tencel twill",
    gsmMin: 160,
    gsmMax: 200,
    handFeel: "cool, smooth",
    drape: "fluid",
    stretch: "none",
    opacity: "opaque",
    trims: ["self belt", "hanging loop"],
    colourways: [
      { name: "Sand", hex: "#D8C7A9", role: "primary" },
      { name: "Palm Shadow", hex: "#4B5B4A", role: "accent" },
    ],
    brandFitScore: 0.83,
    climateFitScore: 0.86,
    manufacturabilityScore: 0.8,
    manufacturabilityRisks: ["Longline drape can twist without correct grain."],
    unknowns: ["Belt vs. beltless preference for the customer."],
    distinctionNote:
      "a much longer open-front duster with a notch lapel and a self belt — no button placket",
    priceFactor: 1.06,
  },
  {
    suffix: "C",
    productName: "Isla Cropped Shell Jacket",
    conceptTitle: "Cropped short-sleeve shell",
    silhouette: "boxy",
    fit: "relaxed",
    length: "cropped",
    neckline: "stand collar",
    collar: "stand collar",
    sleeveLength: "short",
    sleeveShape: "raglan",
    waistConstruction: null,
    hem: "banded cropped hem",
    closures: ["zip"],
    pockets: ["welt"],
    seamDetails: ["raglan sleeve seams"],
    constructionDetails: ["stand collar", "raglan sleeves", "welt hip pockets"],
    fibreRequirement: "crisp cotton-nylon shell",
    gsmMin: 120,
    gsmMax: 150,
    handFeel: "dry, papery",
    drape: "structured",
    stretch: "none",
    opacity: "opaque",
    trims: ["matte zip", "rib hem band"],
    colourways: [
      { name: "Palm Shadow", hex: "#4B5B4A", role: "primary" },
      { name: "Stone", hex: "#B9AE97", role: "accent" },
    ],
    brandFitScore: 0.8,
    climateFitScore: 0.85,
    manufacturabilityScore: 0.83,
    manufacturabilityRisks: ["Zip and rib hem sourcing to confirm."],
    unknowns: ["Crop length over higher-rise bottoms."],
    distinctionNote:
      "a cropped zip-front shell with a stand collar and short raglan sleeves — the shortest, sportiest layer",
    priceFactor: 0.98,
  },
];

const RECIPES_BY_CATEGORY: Record<DesignCategory, ConceptRecipe[]> = {
  top: TOP_RECIPES,
  bottom: BOTTOM_RECIPES,
  dress: DRESS_RECIPES,
  outerwear: OUTERWEAR_RECIPES,
  knitwear: TOP_RECIPES,
  accessory: TOP_RECIPES,
};

const CATEGORY_ORDER: DesignCategory[] = [
  "top",
  "bottom",
  "dress",
  "outerwear",
];

function conceptFromRecipe(
  slot: CollectionSlot,
  recipe: ConceptRecipe,
  otherSlots: CollectionSlot[],
): GarmentDesignSpec {
  const marginFraction = clampMarginFraction(slot.targetMarginPercent / 100);
  const costs = slotCosts(
    slot.targetRetailPrice * recipe.priceFactor,
    marginFraction,
  );
  const coordinatesWith = otherSlots.map((s) => s.provisionalStyleId);

  return {
    styleId: `${slot.provisionalStyleId}-${recipe.suffix}`,
    productName: recipe.productName,
    conceptTitle: recipe.conceptTitle,
    category: slot.category,
    role: slot.role,
    silhouette: recipe.silhouette,
    fit: recipe.fit,
    length: recipe.length,
    neckline: recipe.neckline,
    collar: recipe.collar,
    sleeveLength: recipe.sleeveLength,
    sleeveShape: recipe.sleeveShape,
    waistConstruction: recipe.waistConstruction,
    hem: recipe.hem,
    closures: recipe.closures,
    pockets: recipe.pockets,
    seamDetails: recipe.seamDetails,
    constructionDetails: recipe.constructionDetails,
    primaryMaterialRequirement: {
      fibreRequirement: recipe.fibreRequirement,
      targetWeightGsmMin: recipe.gsmMin,
      targetWeightGsmMax: recipe.gsmMax,
      handFeel: recipe.handFeel,
      drape: recipe.drape,
      stretch: recipe.stretch,
      opacity: recipe.opacity,
      verificationNeeded: true,
    },
    trims: recipe.trims,
    colourways: recipe.colourways,
    targetRetailPrice: costs.targetRetailPrice,
    targetFullyLoadedCost: costs.targetFullyLoadedCost,
    estimatedMarginPercent: costs.targetMarginPercent,
    coordinatesWithSlotIds: coordinatesWith,
    brandFitReason: `Fits the brand's understated, climate-smart voice: ${recipe.distinctionNote}.`,
    trendReason:
      "Leans into elevated warm-weather dressing with restrained volume and natural texture.",
    climateReason: `Chosen for a hot, humid climate — ${recipe.handFeel} ${recipe.fibreRequirement} with ${recipe.drape} drape for airflow.`,
    commercialReason: `Sits at the slot's target price of ${costs.targetRetailPrice} SGD and coordinates with ${coordinatesWith.join(", ") || "the rest of the capsule"}.`,
    manufacturabilityRisks: recipe.manufacturabilityRisks,
    unknowns: recipe.unknowns,
    originalityCheck: {
      avoidsDirectCopy: true,
      notes:
        "Built from generic apparel blocks; no named-brand, designer, or copyrighted references.",
    },
    imagePromptFacts: {
      garmentOnly: true,
      frontBackSheet: true,
      background: "neutral warm-white studio",
      visualStyle:
        "clean premium fashion product-development render, garment only, front and back",
    },
    brandFitScore: recipe.brandFitScore,
    climateFitScore: recipe.climateFitScore,
    manufacturabilityScore: recipe.manufacturabilityScore,
  };
}

function slotIndexFor(slot: CollectionSlot, explicit?: number): number {
  if (typeof explicit === "number" && Number.isInteger(explicit) && explicit >= 0) {
    return explicit;
  }
  const idx = CATEGORY_ORDER.indexOf(slot.category);
  return idx >= 0 ? idx : 0;
}

function buildConceptSet(input: CreateConceptSetInput): ConceptSet {
  const { slot, otherSlots } = input;
  const recipes = RECIPES_BY_CATEGORY[slot.category] ?? TOP_RECIPES;
  const concepts = recipes.map((recipe) =>
    conceptFromRecipe(slot, recipe, otherSlots),
  );
  const recommended = concepts[0];

  return {
    slotIndex: slotIndexFor(slot, input.slotIndex),
    provisionalStyleId: slot.provisionalStyleId,
    concepts,
    recommendedStyleId: recommended.styleId,
    recommendationReason: `${recommended.productName} is the strongest brand and climate fit for this slot — ${recipes[0].distinctionNote} — and the most repeat-wearable of the three.`,
  };
}

// ---------------------------------------------------------------------------
// Visual QA — an accepting, usable verdict derived from the spec facts
// ---------------------------------------------------------------------------

function buildVisualQa(spec: GarmentDesignSpec): VisualQa {
  const present: string[] = [`category: ${spec.category}`, `length: ${spec.length}`, `silhouette: ${spec.silhouette}`];
  if (spec.neckline) present.push(`neckline: ${spec.neckline}`);
  if (spec.collar) present.push(`collar: ${spec.collar}`);
  present.push(`sleeves: ${spec.sleeveLength ?? "sleeveless"}`);
  if (spec.closures.length > 0) present.push(`closure: ${spec.closures[0]}`);
  if (spec.pockets.length > 0) present.push(`pockets: ${spec.pockets.join("/")}`);

  return {
    categoryMatches: true,
    frontBackConsistent: true,
    keyDetailsPresent: present,
    keyDetailsMissing: [],
    forbiddenElements: [],
    imageUsable: true,
    confidence: 0.9,
    recommendation: "accept",
    explanation: `Deterministic mock QA: the concept sheet shows a garment-only ${spec.category} matching the specified silhouette, neckline, sleeves and closures, with a consistent front and back and no people, mannequin, text or logos.`,
  };
}

// ---------------------------------------------------------------------------
// Collection review — coherent review with outfits from the selected designs
// ---------------------------------------------------------------------------

function buildCollectionReview(
  input: ReviewCollectionInput,
): CollectionReview {
  const { selectedDesigns } = input;
  const allIds = selectedDesigns.map((d) => d.styleId);
  const byCategory = (category: DesignCategory): string | null =>
    selectedDesigns.find((d) => d.category === category)?.styleId ?? null;

  const topId = byCategory("top");
  const bottomId = byCategory("bottom");
  const dressId = byCategory("dress");
  const layerId = byCategory("outerwear");

  const orZero = (id: string | null): string[] => (id ? [id] : []);
  const nonEmpty = (ids: string[]): string[] =>
    ids.length > 0 ? ids : allIds.slice(0, Math.min(2, allIds.length));

  const recommendedOutfits = [
    {
      title: "Workday Column",
      designIds: nonEmpty([...orZero(topId), ...orZero(bottomId), ...orZero(layerId)]),
      occasion: "Work",
      reason:
        "The core top and trouser make a tonal daytime column; the layer adds coverage for over-cooled offices.",
    },
    {
      title: "Evening Ease",
      designIds: nonEmpty([...orZero(dressId), ...orZero(layerId)]),
      occasion: "Dinner",
      reason:
        "The draped dress carries the evening on its own, with the light layer thrown over for the walk out.",
    },
    {
      title: "Weekend Layers",
      designIds: nonEmpty([...orZero(topId), ...orZero(bottomId)]),
      occasion: "Weekend",
      reason:
        "The two core pieces dress down cleanly for a relaxed, breathable weekend look.",
    },
  ];

  const scores = {
    brandCoherence: 88,
    categoryBalance: 92,
    colourStory: 86,
    climateSuitability: 90,
    priceArchitecture: 84,
    outfitCompatibility: 89,
    manufacturability: 82,
    productionBudgetFit: 85,
    duplicateRisk: 16,
  };
  // overallScore is the mean of the positive dimensions plus the INVERSE of
  // duplicate risk (a lower risk should lift the score), computed here — never
  // by the model.
  const positives = [
    scores.brandCoherence,
    scores.categoryBalance,
    scores.colourStory,
    scores.climateSuitability,
    scores.priceArchitecture,
    scores.outfitCompatibility,
    scores.manufacturability,
    scores.productionBudgetFit,
    100 - scores.duplicateRisk,
  ];
  const overallScore = Math.round(
    positives.reduce((sum, value) => sum + value, 0) / positives.length,
  );

  return {
    overallScore,
    ...scores,
    strengths: [
      "A tight, tonal palette that reads as one considered capsule.",
      "Two breathable core pieces plus a directional dress and light layer cover work, weekend and evening.",
      "Prices form a clean ladder from the core top up to the directional dress.",
    ],
    blockingIssues: [],
    recommendedOutfits,
    recommendation: "approve",
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

class MockFashionProvider implements FashionReasoningProvider {
  readonly isLive = false;

  async createCollectionPlan(
    input: CreateCollectionPlanInput,
  ): Promise<CollectionPlanResult> {
    const plan = collectionPlanSchema.parse(buildMeridianPlan(input));
    return { plan, usage: mockUsage() };
  }

  async createConceptSet(
    input: CreateConceptSetInput,
  ): Promise<ConceptSetResult> {
    const conceptSet = conceptSetSchema.parse(buildConceptSet(input));
    return { conceptSet, usage: mockUsage() };
  }

  async runVisualQa(input: RunVisualQaInput): Promise<VisualQaResult> {
    const qa = visualQaSchema.parse(buildVisualQa(input.spec));
    return { qa, usage: mockUsage() };
  }

  async reviewCollection(
    input: ReviewCollectionInput,
  ): Promise<CollectionReviewResult> {
    const review = collectionReviewSchema.parse(buildCollectionReview(input));
    return { review, usage: mockUsage() };
  }
}

const mockFashionProvider = new MockFashionProvider();

/** The singleton deterministic mock provider (state-free, safe to share). */
export function getMockFashionProvider(): FashionReasoningProvider {
  return mockFashionProvider;
}
