import "server-only";
import sharp from "sharp";
import {
  HERO_PRODUCT_SKU,
  SEED_BRAND,
  SEED_BRAND_PROFILE,
  SEED_COLLECTION,
  SEED_COLLECTION_BRIEF,
  SEED_PRODUCTS,
  SEED_SUPPLIERS,
} from "@/lib/seed/seed-data";
import { generateGarmentSvg } from "@/lib/seed/garment-svg";
import { uploadPrivateAsset } from "@/lib/supabase/storage";
import {
  getCollectionBySlug,
  getProductBySku,
  insertCollection,
  insertProduct,
  insertSupplier,
  isMissingMigrationError,
  listSuppliers,
  upsertAppSettings,
  type CollectionInsert,
  type ProductInsert,
  type SupplierInsert,
} from "@/lib/supabase/repositories";
import { collectionBriefSchema } from "@/lib/domain/schemas";
import { logActivity } from "@/lib/logging/activity";

/**
 * Idempotent demo seeder.
 *
 * Runnable from both the CLI (`npm run seed`) and the authenticated
 * `POST /api/seed` route. Safe to run repeatedly: existing rows are detected
 * and skipped rather than duplicated.
 *
 * Steps:
 *  1. Upsert the single app_settings brand row.
 *  2. For each seed product missing by SKU: render a placeholder SVG, rasterise
 *     it to PNG, upload to the private catalog bucket, insert the product row.
 *  3. Insert any missing demo suppliers (matched by name).
 *  4. Insert the sample collection if its slug is not present, wiring the hero
 *     product's real UUID into the brief.
 *
 * If the database tables are missing (migration not yet run) the underlying
 * error is caught and re-thrown with an actionable message.
 */

export interface SeedResult {
  productsInserted: number;
  productsSkipped: number;
  suppliersInserted: number;
  collectionInserted: boolean;
  settingsUpserted: boolean;
}

const MIGRATION_MESSAGE =
  "LabelOS database tables are missing. Run supabase/migrations/001_initial.sql " +
  "in the Supabase SQL editor (or via the Supabase CLI) before seeding, then try again.";

export async function runSeed(): Promise<SeedResult> {
  try {
    return await seedAll();
  } catch (error) {
    if (isMissingMigrationError(error)) {
      throw new Error(MIGRATION_MESSAGE, { cause: error });
    }
    throw error;
  }
}

async function seedAll(): Promise<SeedResult> {
  // 1. Brand settings (single-row upsert).
  await upsertAppSettings({
    brand_name: SEED_BRAND.name,
    brand_slug: SEED_BRAND.slug,
    brand_profile: SEED_BRAND_PROFILE,
    currency: SEED_BRAND.currency,
    market: SEED_BRAND.market,
  });
  const settingsUpserted = true;

  // 2. Products — skip any SKU that already exists.
  let productsInserted = 0;
  let productsSkipped = 0;
  for (let i = 0; i < SEED_PRODUCTS.length; i += 1) {
    const product = SEED_PRODUCTS[i];
    const existing = await getProductBySku(product.sku);
    if (existing) {
      productsSkipped += 1;
      continue;
    }

    const svg = generateGarmentSvg(product.category, product.colorHex, i);
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    const imagePath = await uploadPrivateAsset(
      `seed/${product.sku}.png`,
      png,
      "image/png",
    );

    const insert: ProductInsert = {
      source: "seed",
      title: product.title,
      description: product.description,
      vendor: SEED_BRAND.name,
      product_type: product.productType,
      sku: product.sku,
      price: product.price,
      inventory_quantity: product.inventoryQuantity,
      image_path: imagePath,
      status: "active",
      analysis_status: "pending",
      raw_metadata: {
        seed: true,
        category: product.category,
        colorName: product.colorName,
        colorHex: product.colorHex,
      },
    };
    await insertProduct(insert);
    productsInserted += 1;
  }

  // 3. Suppliers — insert any missing demo supplier, matched by name.
  const existingSuppliers = await listSuppliers();
  const existingNames = new Set(
    existingSuppliers.map((supplier) => supplier.name.trim().toLowerCase()),
  );
  let suppliersInserted = 0;
  for (const supplier of SEED_SUPPLIERS) {
    if (existingNames.has(supplier.name.trim().toLowerCase())) continue;
    const insert: SupplierInsert = {
      name: supplier.name,
      country: supplier.country,
      capabilities: [...supplier.capabilities],
      minimum_order_quantity: supplier.minimumOrderQuantity,
      sample_lead_days: supplier.sampleLeadDays,
      production_lead_days: supplier.productionLeadDays,
      email: supplier.email,
      verification_status: "demo",
      details: { ...supplier.details },
    };
    await insertSupplier(insert);
    suppliersInserted += 1;
  }

  // 4. Sample collection — insert only if the slug is not present.
  let collectionInserted = false;
  const existingCollection = await getCollectionBySlug(SEED_COLLECTION.slug);
  if (!existingCollection) {
    const hero = await getProductBySku(HERO_PRODUCT_SKU);
    const brief = collectionBriefSchema.parse({
      ...SEED_COLLECTION_BRIEF,
      heroProductIds: hero ? [hero.id] : [],
    });
    const insert: CollectionInsert = {
      name: SEED_COLLECTION.name,
      slug: SEED_COLLECTION.slug,
      status: SEED_COLLECTION.status,
      brief,
    };
    await insertCollection(insert);
    collectionInserted = true;
  }

  const result: SeedResult = {
    productsInserted,
    productsSkipped,
    suppliersInserted,
    collectionInserted,
    settingsUpserted,
  };

  await logActivity({
    actor: "seed",
    action: "seed.run",
    inputSummary: `Seed dataset: ${SEED_PRODUCTS.length} products, ${SEED_SUPPLIERS.length} suppliers, 1 collection`,
    outputSummary:
      `products +${productsInserted} (skipped ${productsSkipped}), ` +
      `suppliers +${suppliersInserted}, ` +
      `collection ${collectionInserted ? "created" : "already present"}`,
    rawMetadata: { ...result },
  });

  return result;
}
