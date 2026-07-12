/**
 * Shopify Admin GraphQL mutation documents (API version 2026-07).
 *
 * Shapes verified against shopify.dev latest docs:
 * - productCreate(product: ProductCreateInput!, media: [CreateMediaInput!])
 *   — creates the product and its options; only the initial variant.
 * - productVariantsBulkCreate(productId, variants, strategy) — creates one
 *   variant per size; REMOVE_STANDALONE_VARIANT replaces the auto-created
 *   default variant.
 * - collectionCreate(input: CollectionInput!) — `input` is deprecated in
 *   favour of `collection: CollectionCreateInput!` but remains served; we use
 *   `input` because it is valid on every recent version.
 * - collectionAddProductsV2(id, productIds) — deprecated (superseded by
 *   collectionUpdate inclusion rules) but still served in 2026-07 and far
 *   simpler for the MVP.
 * - publishablePublish(id, input: [PublicationInput!]!).
 *
 * Every mutation selects operation-level userErrors { field message }.
 * Field selections match the Zod schemas in ./schemas.ts one-to-one.
 */

/** Create a DRAFT product with options and optional media (spec section 21). */
export const PRODUCT_CREATE = /* GraphQL */ `
  mutation LabelosProductCreate(
    $product: ProductCreateInput!
    $media: [CreateMediaInput!]
  ) {
    productCreate(product: $product, media: $media) {
      product {
        id
        title
        handle
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Create one variant per size option. REMOVE_STANDALONE_VARIANT removes the
 * default variant Shopify auto-creates for the first option value, so all
 * sizes (including the first) come from this call with the intended price.
 */
export const PRODUCT_VARIANTS_BULK_CREATE = /* GraphQL */ `
  mutation LabelosProductVariantsBulkCreate(
    $productId: ID!
    $variants: [ProductVariantsBulkInput!]!
  ) {
    productVariantsBulkCreate(
      productId: $productId
      variants: $variants
      strategy: REMOVE_STANDALONE_VARIANT
    ) {
      productVariants {
        id
        title
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/** Create a custom (manual) collection. Unpublished by default. */
export const COLLECTION_CREATE = /* GraphQL */ `
  mutation LabelosCollectionCreate($input: CollectionInput!) {
    collectionCreate(input: $input) {
      collection {
        id
        title
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/** Add products to a manual collection. Runs as a background job. */
export const COLLECTION_ADD_PRODUCTS = /* GraphQL */ `
  mutation LabelosCollectionAddProducts($id: ID!, $productIds: [ID!]!) {
    collectionAddProductsV2(id: $id, productIds: $productIds) {
      job {
        id
        done
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/** Publish a publishable resource to a sales channel (spec section 21). */
export const PUBLISHABLE_PUBLISH = /* GraphQL */ `
  mutation LabelosPublishablePublish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      publishable {
        ... on Product {
          id
          status
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;
