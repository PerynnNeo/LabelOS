import type {
  BrandProfile,
  CollectionBrief,
  GarmentCategory,
  QuotePayload,
} from "@/lib/domain/schemas";

/**
 * LabelOS demo dataset — one fictional Singapore contemporary brand.
 *
 * Everything here is invented for the demo: brand, products, SKUs, prices,
 * suppliers, and quotes. Suppliers are marked verification_status "demo" and
 * must never be treated as real factories.
 */

// ---------------------------------------------------------------------------
// Brand
// ---------------------------------------------------------------------------

export const SEED_BRAND_PROFILE = {
  audience:
    "Urban professionals and students aged 20-35 living in hot, humid Southeast Asian cities who want polished, breathable everyday clothing.",
  personality: ["modern", "understated", "tactile", "climate-smart"],
  colours: ["ivory", "sand", "palm green", "charcoal", "sea-salt blue"],
  prohibitedStyles: [
    "heavy knitwear",
    "fur and faux fur",
    "logo-driven streetwear",
    "formal eveningwear",
  ],
  climate: "tropical-city",
  typicalPriceRange: { min: 39, max: 189, currency: "SGD" },
  targetGrossMargin: 0.7,
  defaultSeason: "Tropical Resort 2026",
} satisfies BrandProfile;

export const SEED_BRAND = {
  name: "Meridian Atelier",
  slug: "meridian-atelier",
  currency: "SGD",
  market: "Singapore",
  profile: SEED_BRAND_PROFILE,
} as const;

// ---------------------------------------------------------------------------
// Products — 15 items: tops(4) / bottoms(3) / dresses(3) / outerwear(2) /
// accessories(3). The Wide-Leg Linen Trousers are deliberately overstocked
// (inventory 60) and act as the hero product in the demo brief.
// ---------------------------------------------------------------------------

export interface SeedProduct {
  sku: string;
  title: string;
  description: string;
  productType: string;
  category: GarmentCategory;
  price: number;
  inventoryQuantity: number;
  colorHex: string;
  colorName: string;
}

export const HERO_PRODUCT_SKU = "MA-BOT-001";

export const SEED_PRODUCTS: readonly SeedProduct[] = [
  // Tops (4)
  {
    sku: "MA-TOP-001",
    title: "Camp Collar Poplin Shirt",
    description:
      "A relaxed camp-collar shirt in crisp cotton poplin with a straight hem and single chest pocket. Cut roomy through the body so air moves on humid afternoons.",
    productType: "Shirt",
    category: "top",
    price: 89,
    inventoryQuantity: 24,
    colorHex: "#EFE7D8",
    colorName: "ivory",
  },
  {
    sku: "MA-TOP-002",
    title: "Slub Cotton Relaxed Tee",
    description:
      "An easy crew-neck tee in airy slub cotton jersey with a slightly dropped shoulder. The everyday base layer for a tropical city.",
    productType: "T-Shirt",
    category: "top",
    price: 49,
    inventoryQuantity: 40,
    colorHex: "#A9C4CE",
    colorName: "sea-salt blue",
  },
  {
    sku: "MA-TOP-003",
    title: "Sleeveless Linen Shell Top",
    description:
      "A clean sleeveless shell in a linen blend with a high round neck and side slits. Layers under jackets or stands alone on the hottest days.",
    productType: "Top",
    category: "top",
    price: 69,
    inventoryQuantity: 18,
    colorHex: "#D9C9A6",
    colorName: "sand",
  },
  {
    sku: "MA-TOP-004",
    title: "Boxy Popover Shirt",
    description:
      "A boxy half-placket popover in featherweight cotton with a grandad collar. Wears polished for the office and loose for the weekend.",
    productType: "Shirt",
    category: "top",
    price: 95,
    inventoryQuantity: 15,
    colorHex: "#6E8B5D",
    colorName: "palm green",
  },
  // Bottoms (3) — MA-BOT-001 is the overstocked hero
  {
    sku: "MA-BOT-001",
    title: "Wide-Leg Linen Trousers",
    description:
      "High-rise, wide-leg trousers in midweight linen with a flat front waistband and deep side pockets. Breezy drape that keeps its line in the heat. Overstocked style the capsule must feature.",
    productType: "Trousers",
    category: "bottom",
    price: 119,
    inventoryQuantity: 60,
    colorHex: "#CBB893",
    colorName: "sand",
  },
  {
    sku: "MA-BOT-002",
    title: "Tailored Seersucker Shorts",
    description:
      "Above-the-knee tailored shorts in puckered seersucker that never sits flat against the skin. Clean front, side adjusters, no cargo pockets.",
    productType: "Shorts",
    category: "bottom",
    price: 79,
    inventoryQuantity: 22,
    colorHex: "#565B60",
    colorName: "charcoal",
  },
  {
    sku: "MA-BOT-003",
    title: "Drapey Barrel-Leg Pants",
    description:
      "Curved barrel-leg pants in a fluid twill with a cropped ankle. A directional silhouette that still reads easy in tropical humidity.",
    productType: "Trousers",
    category: "bottom",
    price: 129,
    inventoryQuantity: 14,
    colorHex: "#3E4247",
    colorName: "charcoal",
  },
  // Dresses (3)
  {
    sku: "MA-DRS-001",
    title: "Poplin Midi Shirt Dress",
    description:
      "A belted midi shirt dress in crisp cotton poplin with short sleeves and a full skirt. Desk-to-dinner in one piece.",
    productType: "Dress",
    category: "dress",
    price: 149,
    inventoryQuantity: 12,
    colorHex: "#EDE5D4",
    colorName: "ivory",
  },
  {
    sku: "MA-DRS-002",
    title: "Bias-Cut Slip Dress",
    description:
      "A bias-cut midi slip dress in a matte viscose blend with narrow straps and a gentle cowl. Skims rather than clings.",
    productType: "Dress",
    category: "dress",
    price: 139,
    inventoryQuantity: 10,
    colorHex: "#7B9367",
    colorName: "palm green",
  },
  {
    sku: "MA-DRS-003",
    title: "Sleeveless Column Dress",
    description:
      "A minimal sleeveless column dress in heavyweight jersey with a high neck and back vent. Quietly formal without any lining weight.",
    productType: "Dress",
    category: "dress",
    price: 159,
    inventoryQuantity: 9,
    colorHex: "#9FB9C4",
    colorName: "sea-salt blue",
  },
  // Outerwear (2)
  {
    sku: "MA-OUT-001",
    title: "Featherweight Chore Jacket",
    description:
      "An unlined chore jacket in a featherweight cotton-linen weave with three patch pockets. The air-conditioning answer that still breathes outdoors.",
    productType: "Jacket",
    category: "outerwear",
    price: 189,
    inventoryQuantity: 8,
    colorHex: "#C8B899",
    colorName: "sand",
  },
  {
    sku: "MA-OUT-002",
    title: "Packable Ripstop Anorak",
    description:
      "A packable half-zip anorak in matte ripstop with a stowable hood. Folds into its own chest pocket for sudden tropical downpours.",
    productType: "Jacket",
    category: "outerwear",
    price: 169,
    inventoryQuantity: 11,
    colorHex: "#44484D",
    colorName: "charcoal",
  },
  // Accessories (3)
  {
    sku: "MA-ACC-001",
    title: "Silk-Blend Square Scarf",
    description:
      "A 70 cm square scarf in a silk-cotton blend with a hand-rolled hem and tonal border print. Neck, hair, or bag — one piece, three jobs.",
    productType: "Scarf",
    category: "accessory",
    price: 59,
    inventoryQuantity: 30,
    colorHex: "#6F8F62",
    colorName: "palm green",
  },
  {
    sku: "MA-ACC-002",
    title: "Woven Raffia Tote",
    description:
      "A structured raffia-effect woven tote with cotton canvas lining and an interior zip pocket. Big enough for a laptop, light enough for 33°C.",
    productType: "Bag",
    category: "accessory",
    price: 99,
    inventoryQuantity: 16,
    colorHex: "#D4C29B",
    colorName: "sand",
  },
  {
    sku: "MA-ACC-003",
    title: "Anodised Hoop Earrings",
    description:
      "Lightweight anodised aluminium hoops with a brushed matte finish. Sweat-safe and featherlight for all-day wear.",
    productType: "Jewellery",
    category: "accessory",
    price: 39,
    inventoryQuantity: 35,
    colorHex: "#5A5E63",
    colorName: "charcoal",
  },
] as const;

// ---------------------------------------------------------------------------
// Suppliers — three fictional demo suppliers with example quote structures
// matching quotePayloadSchema. verification_status is always "demo".
// ---------------------------------------------------------------------------

export interface SeedSupplier {
  name: string;
  country: string;
  capabilities: string[];
  minimumOrderQuantity: number;
  sampleLeadDays: number;
  productionLeadDays: number;
  email: string | null;
  details: {
    sampleFee: number;
    currency: string;
    unitPriceTiers: Array<{ minQuantity: number; unitPrice: number }>;
    fabricResponsibility: string;
    packaging: string;
    paymentTerms: string;
    qualityProcess: string;
    defectPolicy: string;
    notes: string;
    /** Example quote in the exact shape of quotePayloadSchema. */
    exampleQuote: QuotePayload;
  };
}

export const SEED_SUPPLIERS: readonly SeedSupplier[] = [
  {
    name: "Straits Sample House",
    country: "Singapore",
    capabilities: [
      "small-batch wovens",
      "sampling and prototyping",
      "technical pattern making",
      "linen and cotton shirting",
    ],
    minimumOrderQuantity: 50,
    sampleLeadDays: 10,
    productionLeadDays: 30,
    email: null,
    details: {
      sampleFee: 120,
      currency: "SGD",
      unitPriceTiers: [
        { minQuantity: 50, unitPrice: 34 },
        { minQuantity: 150, unitPrice: 29 },
      ],
      fabricResponsibility: "Supplier sources fabric from approved local mills",
      packaging: "Individual polybag, recycled mailer on request",
      paymentTerms: "50% deposit, 50% on delivery",
      qualityProcess: "Inline check plus 100% final inspection on small runs",
      defectPolicy: "Replacement or credit for defects above 2%",
      notes:
        "Fictional demo supplier. Fast local sampling; premium unit cost; ideal for first runs under 200 units.",
      exampleQuote: {
        unitPrice: 32,
        currency: "SGD",
        minimumOrderQuantity: 50,
        sampleFee: 120,
        sampleLeadDays: 10,
        productionLeadDays: 30,
        fabricResponsibility: "Supplier-sourced from approved local mills",
        packagingIncluded: true,
        paymentTerms: "50% deposit, 50% on delivery",
        qualityProcess: "Inline check plus 100% final inspection",
        defectPolicy: "Replacement or credit for defects above 2%",
        communicationNotes: "Same-day replies during SGT business hours (demo data)",
        freightEstimatePerUnit: 0.4,
        dutyEstimatePerUnit: 0,
      },
    },
  },
  {
    name: "Lotus Thread Manufacturing",
    country: "Vietnam",
    capabilities: [
      "woven tops and dresses",
      "linen and cotton garments",
      "mid-volume production",
      "garment wash finishing",
    ],
    minimumOrderQuantity: 300,
    sampleLeadDays: 14,
    productionLeadDays: 45,
    email: null,
    details: {
      sampleFee: 80,
      currency: "SGD",
      unitPriceTiers: [
        { minQuantity: 300, unitPrice: 21 },
        { minQuantity: 800, unitPrice: 17.5 },
      ],
      fabricResponsibility: "Buyer nominates fabric; supplier can source on request",
      packaging: "Flat-pack polybag with size sticker",
      paymentTerms: "30% deposit, 70% against B/L copy",
      qualityProcess: "AQL 2.5 final inspection, third-party inspection welcome",
      defectPolicy: "Rework or discount negotiated per AQL result",
      notes:
        "Fictional demo supplier. Strong wovens capability and balanced pricing at MOQ 300.",
      exampleQuote: {
        unitPrice: 19.5,
        currency: "SGD",
        minimumOrderQuantity: 300,
        sampleFee: 80,
        sampleLeadDays: 14,
        productionLeadDays: 45,
        fabricResponsibility: "Buyer-nominated fabric, supplier sourcing optional",
        packagingIncluded: true,
        paymentTerms: "30% deposit, 70% against B/L copy",
        qualityProcess: "AQL 2.5 final inspection",
        defectPolicy: "Rework or discount negotiated per AQL result",
        communicationNotes: "Replies within 24h on weekdays; English spec sheets fine (demo data)",
        freightEstimatePerUnit: 1.1,
        dutyEstimatePerUnit: 0,
      },
    },
  },
  {
    name: "Coromandel Textiles Co.",
    country: "India",
    capabilities: [
      "linen weaving and garmenting",
      "garment dyeing",
      "trousers and shorts",
      "high-volume production",
    ],
    minimumOrderQuantity: 500,
    sampleLeadDays: 18,
    productionLeadDays: 60,
    email: null,
    details: {
      sampleFee: 60,
      currency: "SGD",
      unitPriceTiers: [
        { minQuantity: 500, unitPrice: 16 },
        { minQuantity: 1500, unitPrice: 13 },
      ],
      fabricResponsibility: "Vertically integrated: mill-to-garment in house",
      packaging: "Bulk carton, optional retail polybag at extra cost",
      paymentTerms: "LC at sight or 30/70 TT",
      qualityProcess: "In-house lab dips and AQL 2.5; buyer inspection encouraged",
      defectPolicy: "Credit note for confirmed defects above 3%",
      notes:
        "Fictional demo supplier. Lowest unit price with in-house linen weaving, but the longest lead times and highest MOQ.",
      exampleQuote: {
        unitPrice: 14.8,
        currency: "SGD",
        minimumOrderQuantity: 500,
        sampleFee: 60,
        sampleLeadDays: 18,
        productionLeadDays: 60,
        fabricResponsibility: "In-house woven linen, mill-to-garment",
        packagingIncluded: false,
        paymentTerms: "LC at sight or 30/70 TT",
        qualityProcess: "In-house lab dips and AQL 2.5 final inspection",
        defectPolicy: "Credit note for confirmed defects above 3%",
        communicationNotes: "Best on email with consolidated weekly calls (demo data)",
        freightEstimatePerUnit: 1.6,
        dutyEstimatePerUnit: 0.3,
      },
    },
  },
] as const;

// ---------------------------------------------------------------------------
// Sample collection brief — six-look tropical-city capsule.
// heroProductIds is populated at seed time with the real UUID of the
// overstocked linen trousers (HERO_PRODUCT_SKU); Claude never invents IDs.
// ---------------------------------------------------------------------------

export const SEED_COLLECTION_BRIEF = {
  market: "Singapore",
  season: "Tropical Resort 2026",
  climate: "tropical-city",
  audience:
    "Customers aged 20-30 in Singapore: young professionals and students who commute in heat and humidity but spend the day in air-conditioning.",
  priceTier: "contemporary",
  commercialObjective:
    "Build a six-look tropical-city capsule that features the overstocked Wide-Leg Linen Trousers in two distinct looks, adds at most one new product, and protects a 70% target gross margin.",
  heroProductIds: [],
  prohibitedStyles: [
    "heavy knitwear",
    "fur and faux fur",
    "logo-driven streetwear",
    "formal eveningwear",
  ],
  allowUnavailableProducts: false,
  maxNewProducts: 1,
  targetGrossMargin: 0.7,
  notes:
    "Hero product: Wide-Leg Linen Trousers (SKU MA-BOT-001, inventory 60) must appear in two distinct looks. Any new design must unlock at least two outfits with existing products.",
} satisfies CollectionBrief;

export const SEED_COLLECTION = {
  name: "Tropical City Capsule",
  slug: "tropical-city-capsule",
  status: "draft",
  brief: SEED_COLLECTION_BRIEF,
} as const;
