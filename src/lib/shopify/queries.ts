/**
 * Shopify Admin GraphQL query documents (API version 2026-07).
 *
 * Field selections match the Zod schemas in ./schemas.ts one-to-one — change
 * them together. No secrets in this module.
 */

/** Connection test — spec section 10. */
export const SHOP_QUERY = /* GraphQL */ `
  query LabelosShop {
    shop {
      name
      myshopifyDomain
      currencyCode
    }
  }
`;

/**
 * Catalog import page with cursor pagination — spec section 9.
 * `featuredMedia.preview.image.url` is the current (non-deprecated) way to
 * read the primary image.
 */
export const PRODUCTS_QUERY = /* GraphQL */ `
  query LabelosProducts($first: Int!, $cursor: String) {
    products(first: $first, after: $cursor, sortKey: CREATED_AT) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        handle
        vendor
        productType
        tags
        descriptionHtml
        status
        featuredMedia {
          preview {
            image {
              url
            }
          }
        }
        variants(first: 10) {
          nodes {
            id
            sku
            price
            inventoryQuantity
          }
        }
      }
    }
  }
`;

/**
 * Sales-channel publications — used to find the Online Store publication ID
 * before publishablePublish. `name` is deprecated in favour of catalog
 * metadata but is still served in 2026-07.
 */
export const PUBLICATIONS_QUERY = /* GraphQL */ `
  query LabelosPublications {
    publications(first: 10) {
      nodes {
        id
        name
      }
    }
  }
`;

/**
 * Find an existing collection by exact title (used by upsertCollection).
 * The $query value uses Shopify search syntax, e.g. title:'Tropical Capsule'.
 */
export const COLLECTIONS_BY_TITLE_QUERY = /* GraphQL */ `
  query LabelosCollectionsByTitle($query: String!) {
    collections(first: 1, query: $query) {
      nodes {
        id
        title
      }
    }
  }
`;
