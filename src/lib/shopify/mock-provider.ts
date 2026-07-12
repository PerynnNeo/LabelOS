import { createHash } from "node:crypto";
import type {
  DraftProductInput,
  ImportedProduct,
  ShopifyProvider,
} from "./provider";

/**
 * Mock Shopify provider (spec section 25) — a high-quality simulation, not an
 * empty stub. Supports connection test, product import, draft product
 * creation, collection upsert, publication listing, and publish.
 *
 * Determinism guarantees:
 * - Fake GIDs are derived from input via sha1, so the same design always maps
 *   to the same GID (idempotent draft creation).
 * - Imported garments are a fixed, plausible set of 8 — stable across calls.
 * - Only the simulated latency involves timers; all VALUES are deterministic.
 *
 * State lives in module-level Maps so repeated calls within one server
 * process behave like a real store (e.g. publish state is remembered).
 * NOTE: type-only import from ./provider — no runtime cycle.
 */

const MOCK_SHOP = {
  shopName: "LabelOS Demo Store (mock)",
  domain: "labelos-demo.myshopify.com",
  currency: "SGD",
} as const;

export const MOCK_PUBLICATION = {
  id: "gid://shopify/Publication/mock-online-store",
  name: "Online Store",
} as const;

/** Stable 12-hex-char id derived from any seed string. */
function stableId(seed: string): string {
  return createHash("sha1").update(seed).digest("hex").slice(0, 12);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Deterministic, self-contained product image: an SVG swatch data URI. */
function swatchDataUri(label: string, hex: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="750" viewBox="0 0 600 750">` +
    `<rect width="600" height="750" fill="${hex}"/>` +
    `<rect x="24" y="24" width="552" height="702" fill="none" stroke="#1f1f1f" stroke-opacity="0.15" stroke-width="2"/>` +
    `<text x="300" y="385" font-family="Georgia, serif" font-size="34" fill="#1f1f1f" text-anchor="middle">${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

interface MockGarmentSeed {
  title: string;
  handle: string;
  productType: string;
  tags: string[];
  description: string;
  colourHex: string;
  price: number;
  inventoryQuantity: number;
}

/** 8 plausible garments for a Singapore contemporary label (deterministic). */
const MOCK_GARMENTS: readonly MockGarmentSeed[] = [
  {
    title: "Air Linen Shirt",
    handle: "air-linen-shirt",
    productType: "Shirt",
    tags: ["linen", "tropical", "core", "top"],
    description:
      "<p>A breathable relaxed-fit linen shirt in off-white, cut for humid city days. Mother-of-pearl buttons and a soft washed finish.</p>",
    colourHex: "#f2ede3",
    price: 79,
    inventoryQuantity: 24,
  },
  {
    title: "Breeze Linen Trousers",
    handle: "breeze-linen-trousers",
    productType: "Trousers",
    tags: ["linen", "tropical", "overstock", "bottom"],
    description:
      "<p>Wide, fluid linen trousers in warm sand with an elasticated back waist. Our most-stocked style this season.</p>",
    colourHex: "#e5d5b8",
    price: 98,
    inventoryQuantity: 62,
  },
  {
    title: "Boxy Cotton Tee",
    handle: "boxy-cotton-tee",
    productType: "T-Shirt",
    tags: ["cotton", "core", "top"],
    description:
      "<p>A heavyweight boxy tee in washed black. Dropped shoulders and a clean ribbed neck.</p>",
    colourHex: "#c9c9c9",
    price: 39,
    inventoryQuantity: 40,
  },
  {
    title: "Tropic Midi Dress",
    handle: "tropic-midi-dress",
    productType: "Dress",
    tags: ["viscose", "print", "dress", "occasion"],
    description:
      "<p>A bias-cut midi dress in a muted palm print. Adjustable straps and a side slit for movement.</p>",
    colourHex: "#cfe0cf",
    price: 129,
    inventoryQuantity: 15,
  },
  {
    title: "City Bomber Jacket",
    handle: "city-bomber-jacket",
    productType: "Jacket",
    tags: ["outerwear", "transitional", "evening"],
    description:
      "<p>A lightweight bomber in olive with a matte finish, packable for air-conditioned commutes and evening rain.</p>",
    colourHex: "#d3d8c4",
    price: 159,
    inventoryQuantity: 12,
  },
  {
    title: "Wide-Leg Poplin Pant",
    handle: "wide-leg-poplin-pant",
    productType: "Trousers",
    tags: ["cotton", "tailored", "bottom"],
    description:
      "<p>Crisp cotton-poplin trousers in ivory with a pressed front crease and extended waist tab.</p>",
    colourHex: "#f4f1ea",
    price: 89,
    inventoryQuantity: 20,
  },
  {
    title: "Ribbed Knit Tank",
    handle: "ribbed-knit-tank",
    productType: "Knitwear",
    tags: ["knit", "layering", "top"],
    description:
      "<p>A fine ribbed tank in sage, made to layer under shirts or wear alone on the hottest days.</p>",
    colourHex: "#dbe4d8",
    price: 49,
    inventoryQuantity: 30,
  },
  {
    title: "Woven Market Tote",
    handle: "woven-market-tote",
    productType: "Accessory",
    tags: ["accessory", "natural", "everyday"],
    description:
      "<p>A structured woven tote in natural straw tones with cotton-canvas lining and an interior pocket.</p>",
    colourHex: "#ead9bd",
    price: 59,
    inventoryQuantity: 26,
  },
];

function buildImportedProduct(
  seed: MockGarmentSeed,
  index: number,
): ImportedProduct {
  const gid = `gid://shopify/Product/mock-${stableId(seed.handle)}`;
  const sku = `LBD-${String(index + 1).padStart(4, "0")}`;
  const raw = {
    id: gid,
    title: seed.title,
    handle: seed.handle,
    vendor: "LabelOS Demo",
    productType: seed.productType,
    tags: seed.tags,
    descriptionHtml: seed.description,
    status: "ACTIVE",
    variants: {
      nodes: [
        {
          id: `gid://shopify/ProductVariant/mock-${stableId(`${seed.handle}-v1`)}`,
          sku,
          price: seed.price.toFixed(2),
          inventoryQuantity: seed.inventoryQuantity,
        },
      ],
    },
    mock: true,
  };
  return {
    externalId: gid,
    gid,
    title: seed.title,
    handle: seed.handle,
    vendor: "LabelOS Demo",
    productType: seed.productType,
    tags: seed.tags,
    description: seed.description,
    imageUrl: swatchDataUri(seed.title, seed.colourHex),
    sku,
    price: seed.price,
    inventoryQuantity: seed.inventoryQuantity,
    raw,
  };
}

// ---------------------------------------------------------------------------
// Module-level state — mirrors what a real store would remember
// ---------------------------------------------------------------------------

interface MockDraftRecord {
  productGid: string;
  input: DraftProductInput;
  createdCount: number;
}

const draftsByKey = new Map<string, MockDraftRecord>();
const collectionsByTitle = new Map<
  string,
  { collectionGid: string; descriptionHtml: string }
>();
const collectionProducts = new Map<string, Set<string>>();
const publishedProducts = new Map<string, Set<string>>();

/** Test helper — clears all simulated store state. */
export function resetMockShopifyState(): void {
  draftsByKey.clear();
  collectionsByTitle.clear();
  collectionProducts.clear();
  publishedProducts.clear();
}

/** Read-only snapshot for tests and debug UIs (no secrets — it is all fake). */
export function inspectMockShopifyState(): {
  drafts: Array<{ key: string; productGid: string; createdCount: number }>;
  collections: Array<{ title: string; collectionGid: string; productGids: string[] }>;
  published: Array<{ productGid: string; publicationIds: string[] }>;
} {
  return {
    drafts: [...draftsByKey.entries()].map(([key, record]) => ({
      key,
      productGid: record.productGid,
      createdCount: record.createdCount,
    })),
    collections: [...collectionsByTitle.entries()].map(([title, record]) => ({
      title,
      collectionGid: record.collectionGid,
      productGids: [...(collectionProducts.get(record.collectionGid) ?? [])],
    })),
    published: [...publishedProducts.entries()].map(
      ([productGid, publicationIds]) => ({
        productGid,
        publicationIds: [...publicationIds],
      }),
    ),
  };
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

const mockProvider: ShopifyProvider = {
  mode: "mock",

  async testConnection() {
    await sleep(60);
    return { ...MOCK_SHOP };
  },

  async importProducts(limit: number) {
    await sleep(140);
    const count = Math.max(0, Math.min(limit, MOCK_GARMENTS.length));
    return MOCK_GARMENTS.slice(0, count).map((seed, index) =>
      buildImportedProduct(seed, index),
    );
  },

  async createDraftProduct(input: DraftProductInput) {
    await sleep(120);
    // Same design (title + vendor) → same GID, exactly like an idempotent
    // real integration keyed on an idempotency check.
    const key = `${input.title}|${input.vendor}`;
    const existing = draftsByKey.get(key);
    if (existing) {
      existing.createdCount += 1;
      return { productGid: existing.productGid, adminUrl: null };
    }
    const productGid = `gid://shopify/Product/mock-${stableId(key)}`;
    draftsByKey.set(key, { productGid, input, createdCount: 1 });
    return { productGid, adminUrl: null };
  },

  async upsertCollection(input: { title: string; descriptionHtml: string }) {
    await sleep(90);
    const existing = collectionsByTitle.get(input.title);
    if (existing) {
      existing.descriptionHtml = input.descriptionHtml;
      return { collectionGid: existing.collectionGid };
    }
    const collectionGid = `gid://shopify/Collection/mock-${stableId(input.title)}`;
    collectionsByTitle.set(input.title, {
      collectionGid,
      descriptionHtml: input.descriptionHtml,
    });
    collectionProducts.set(collectionGid, new Set());
    return { collectionGid };
  },

  async addProductsToCollection(collectionGid: string, productGids: string[]) {
    await sleep(80);
    const members =
      collectionProducts.get(collectionGid) ??
      collectionProducts.set(collectionGid, new Set()).get(collectionGid)!;
    for (const gid of productGids) {
      members.add(gid);
    }
  },

  async listPublications() {
    await sleep(50);
    return [{ id: MOCK_PUBLICATION.id, name: MOCK_PUBLICATION.name }];
  },

  async publishProduct(productGid: string, publicationId: string) {
    await sleep(100);
    const publications =
      publishedProducts.get(productGid) ??
      publishedProducts.set(productGid, new Set()).get(productGid)!;
    publications.add(publicationId);
  },
};

/** The singleton mock provider. State persists for the process lifetime. */
export function getMockShopifyProvider(): ShopifyProvider {
  return mockProvider;
}
