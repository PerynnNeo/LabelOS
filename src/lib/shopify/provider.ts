import "server-only";
import { getEnv, isShopifyLive } from "@/lib/env";
import { collectUserErrors, ShopifyError, shopifyGraphql } from "./client";
import { getMockShopifyProvider } from "./mock-provider";
import {
  COLLECTION_ADD_PRODUCTS,
  COLLECTION_CREATE,
  PRODUCT_CREATE,
  PRODUCT_VARIANTS_BULK_CREATE,
  PUBLISHABLE_PUBLISH,
} from "./mutations";
import {
  COLLECTIONS_BY_TITLE_QUERY,
  PRODUCTS_QUERY,
  PUBLICATIONS_QUERY,
  SHOP_QUERY,
} from "./queries";
import {
  collectionAddProductsDataSchema,
  collectionCreateDataSchema,
  collectionsByTitleDataSchema,
  productCreateDataSchema,
  productsPageDataSchema,
  productVariantsBulkCreateDataSchema,
  publicationsDataSchema,
  publishablePublishDataSchema,
  shopQueryDataSchema,
  type ShopifyProductNode,
} from "./schemas";

/**
 * Shopify provider abstraction (spec sections 10, 21, 25).
 *
 * Routes call `getShopifyProvider()` and never touch the raw client, so the
 * mock and the real store are interchangeable. All Shopify writes remain
 * approval-gated at the route layer — the provider only executes.
 */

/** A catalog product imported from Shopify (or fabricated by the mock). */
export interface ImportedProduct {
  /** Shopify product GID, e.g. "gid://shopify/Product/123". Canonical key for upsert. */
  externalId: string;
  /** Alias of externalId (same GID) for callers that prefer this name. */
  gid: string;
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  tags: string[];
  /** HTML description as served by Shopify (descriptionHtml). */
  description: string;
  imageUrl: string | null;
  sku: string | null;
  price: number | null;
  inventoryQuantity: number | null;
  /** Raw provider node for raw_metadata storage. */
  raw: unknown;
}

/** Input for creating a DRAFT product (built from the approved listing). */
export interface DraftProductInput {
  title: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  tags: string[];
  price: number;
  /** One variant per size. Empty → a single "One Size" variant is created. */
  sizeOptions: string[];
  /** Public image URL Shopify can fetch, or null for no media. */
  imageUrl: string | null;
  metafields?: Array<{
    namespace: string;
    key: string;
    type: string;
    value: string;
  }>;
}

export interface ShopifyProvider {
  readonly mode: "mock" | "client_credentials";
  testConnection(): Promise<{
    shopName: string;
    domain: string;
    currency: string;
  }>;
  importProducts(limit: number): Promise<ImportedProduct[]>;
  createDraftProduct(
    input: DraftProductInput,
  ): Promise<{ productGid: string; adminUrl: string | null }>;
  upsertCollection(input: {
    title: string;
    descriptionHtml: string;
  }): Promise<{ collectionGid: string }>;
  addProductsToCollection(
    collectionGid: string,
    productGids: string[],
  ): Promise<void>;
  listPublications(): Promise<Array<{ id: string; name: string }>>;
  publishProduct(productGid: string, publicationId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Real provider — composes token + client + queries + mutations
// ---------------------------------------------------------------------------

const IMPORT_PAGE_SIZE = 25;

function mapProductNode(node: ShopifyProductNode): ImportedProduct {
  const firstVariant = node.variants.nodes[0];
  const parsedPrice = firstVariant ? Number.parseFloat(firstVariant.price) : NaN;
  return {
    externalId: node.id,
    gid: node.id,
    title: node.title,
    handle: node.handle,
    vendor: node.vendor,
    productType: node.productType,
    tags: node.tags,
    description: node.descriptionHtml,
    imageUrl: node.featuredMedia?.preview?.image?.url ?? null,
    sku: firstVariant?.sku ?? null,
    price: Number.isFinite(parsedPrice) ? parsedPrice : null,
    inventoryQuantity: firstVariant?.inventoryQuantity ?? null,
    raw: node,
  };
}

/** Escape a value for Shopify search syntax: title:'...'. */
function escapeSearchValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** gid://shopify/Product/123 → https://admin.shopify.com/store/{shop}/products/123 */
function adminUrlForProductGid(gid: string): string | null {
  const env = getEnv();
  const numericId = gid.split("/").pop() ?? "";
  if (!env.SHOPIFY_SHOP || !/^\d+$/.test(numericId)) return null;
  return `https://admin.shopify.com/store/${env.SHOPIFY_SHOP}/products/${numericId}`;
}

class ClientCredentialsShopifyProvider implements ShopifyProvider {
  readonly mode = "client_credentials" as const;

  async testConnection(): Promise<{
    shopName: string;
    domain: string;
    currency: string;
  }> {
    const { data } = await shopifyGraphql({
      query: SHOP_QUERY,
      schema: shopQueryDataSchema,
    });
    return {
      shopName: data.shop.name,
      domain: data.shop.myshopifyDomain,
      currency: data.shop.currencyCode,
    };
  }

  async importProducts(limit: number): Promise<ImportedProduct[]> {
    const products: ImportedProduct[] = [];
    let cursor: string | null = null;

    while (products.length < limit) {
      const first = Math.min(IMPORT_PAGE_SIZE, limit - products.length);
      const { data } = await shopifyGraphql({
        query: PRODUCTS_QUERY,
        variables: { first, cursor },
        schema: productsPageDataSchema,
      });

      for (const node of data.products.nodes) {
        if (products.length >= limit) break;
        products.push(mapProductNode(node));
      }

      const { hasNextPage, endCursor } = data.products.pageInfo;
      if (!hasNextPage || !endCursor) break;
      cursor = endCursor;
    }

    return products;
  }

  async createDraftProduct(
    input: DraftProductInput,
  ): Promise<{ productGid: string; adminUrl: string | null }> {
    const sizes =
      input.sizeOptions.length > 0 ? input.sizeOptions : ["One Size"];

    const product: Record<string, unknown> = {
      title: input.title,
      descriptionHtml: input.descriptionHtml,
      vendor: input.vendor,
      productType: input.productType,
      tags: input.tags,
      status: "DRAFT",
      productOptions: [
        { name: "Size", values: sizes.map((size) => ({ name: size })) },
      ],
    };
    if (input.metafields && input.metafields.length > 0) {
      product.metafields = input.metafields;
    }

    const media = input.imageUrl
      ? [
          {
            originalSource: input.imageUrl,
            alt: input.title,
            mediaContentType: "IMAGE",
          },
        ]
      : undefined;

    const created = await shopifyGraphql({
      query: PRODUCT_CREATE,
      variables: { product, media },
      schema: productCreateDataSchema,
    });
    collectUserErrors(created.data.productCreate, "draft product creation");

    const createdProduct = created.data.productCreate?.product;
    if (!createdProduct) {
      throw new ShopifyError(
        "graphql_error",
        "Shopify did not return the created product — the draft may not have been created.",
      );
    }

    // One variant per size at the listed price. The Decimal scalar is sent
    // as a string to avoid float formatting surprises.
    const variants = sizes.map((size) => ({
      price: input.price.toFixed(2),
      optionValues: [{ optionName: "Size", name: size }],
    }));
    const variantResult = await shopifyGraphql({
      query: PRODUCT_VARIANTS_BULK_CREATE,
      variables: { productId: createdProduct.id, variants },
      schema: productVariantsBulkCreateDataSchema,
    });
    collectUserErrors(
      variantResult.data.productVariantsBulkCreate,
      "variant creation",
    );

    return {
      productGid: createdProduct.id,
      adminUrl: adminUrlForProductGid(createdProduct.id),
    };
  }

  async upsertCollection(input: {
    title: string;
    descriptionHtml: string;
  }): Promise<{ collectionGid: string }> {
    // Find-or-create by exact title. Note: an existing collection's
    // description is left untouched (collectionUpdate is out of MVP scope).
    const existing = await shopifyGraphql({
      query: COLLECTIONS_BY_TITLE_QUERY,
      variables: { query: `title:'${escapeSearchValue(input.title)}'` },
      schema: collectionsByTitleDataSchema,
    });
    const match = existing.data.collections.nodes.find(
      (node) => node.title === input.title,
    );
    if (match) {
      return { collectionGid: match.id };
    }

    const created = await shopifyGraphql({
      query: COLLECTION_CREATE,
      variables: {
        input: {
          title: input.title,
          descriptionHtml: input.descriptionHtml,
        },
      },
      schema: collectionCreateDataSchema,
    });
    collectUserErrors(created.data.collectionCreate, "collection creation");

    const collection = created.data.collectionCreate?.collection;
    if (!collection) {
      throw new ShopifyError(
        "graphql_error",
        "Shopify did not return the created collection.",
      );
    }
    return { collectionGid: collection.id };
  }

  async addProductsToCollection(
    collectionGid: string,
    productGids: string[],
  ): Promise<void> {
    if (productGids.length === 0) return;
    const { data } = await shopifyGraphql({
      query: COLLECTION_ADD_PRODUCTS,
      variables: { id: collectionGid, productIds: productGids },
      schema: collectionAddProductsDataSchema,
    });
    collectUserErrors(
      data.collectionAddProductsV2,
      "adding products to the collection",
    );
  }

  async listPublications(): Promise<Array<{ id: string; name: string }>> {
    const { data } = await shopifyGraphql({
      query: PUBLICATIONS_QUERY,
      schema: publicationsDataSchema,
    });
    return data.publications.nodes.map((node) => ({
      id: node.id,
      name: node.name ?? "Publication",
    }));
  }

  async publishProduct(
    productGid: string,
    publicationId: string,
  ): Promise<void> {
    const { data } = await shopifyGraphql({
      query: PUBLISHABLE_PUBLISH,
      variables: { id: productGid, input: [{ publicationId }] },
      schema: publishablePublishDataSchema,
    });
    collectUserErrors(data.publishablePublish, "publishing the product");
  }
}

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

let realProvider: ClientCredentialsShopifyProvider | null = null;

/**
 * Real provider when SHOPIFY_MODE=client_credentials AND all credentials are
 * present; otherwise the deterministic mock (spec: missing credentials must
 * never crash the app — the mock path is always available).
 */
export function getShopifyProvider(): ShopifyProvider {
  const env = getEnv();
  if (env.SHOPIFY_MODE === "client_credentials" && isShopifyLive(env)) {
    if (!realProvider) {
      realProvider = new ClientCredentialsShopifyProvider();
    }
    return realProvider;
  }
  return getMockShopifyProvider();
}
