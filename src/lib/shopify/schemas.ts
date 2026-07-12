import { z } from "zod";

/**
 * Zod schemas for every external Shopify response LabelOS parses.
 *
 * Everything arriving from the network is `unknown` until validated here.
 * Schemas are deliberately defensive: fields Shopify marks nullable are
 * `.nullish()`, and unknown extra keys are stripped by default.
 *
 * Verified against the Admin GraphQL API docs for version 2026-07
 * (productCreate, productVariantsBulkCreate, collectionCreate,
 * collectionAddProductsV2, publishablePublish, publications).
 *
 * No secrets in this module — safe to import from tests.
 */

// ---------------------------------------------------------------------------
// Token endpoint (client-credentials exchange)
// ---------------------------------------------------------------------------

export const shopifyTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  /** Seconds until expiry. Defensive: Shopify sends it, but we default in code. */
  expires_in: z.number().positive().optional(),
  scope: z.string().optional(),
});
export type ShopifyTokenResponse = z.infer<typeof shopifyTokenResponseSchema>;

/** OAuth-style error body some failures return ({ error, error_description }). */
export const shopifyTokenErrorResponseSchema = z.object({
  error: z.string().optional(),
  error_description: z.string().optional(),
  errors: z.string().optional(),
});
export type ShopifyTokenErrorResponse = z.infer<
  typeof shopifyTokenErrorResponseSchema
>;

// ---------------------------------------------------------------------------
// GraphQL transport envelope
// ---------------------------------------------------------------------------

export const shopifyUserErrorSchema = z.object({
  field: z.array(z.string()).nullish(),
  message: z.string(),
});
export type ShopifyUserError = z.infer<typeof shopifyUserErrorSchema>;

export const shopifyGraphqlCostSchema = z.object({
  requestedQueryCost: z.number().optional(),
  actualQueryCost: z.number().nullish(),
  throttleStatus: z
    .object({
      maximumAvailable: z.number(),
      currentlyAvailable: z.number(),
      restoreRate: z.number(),
    })
    .optional(),
});
export type ShopifyGraphqlCost = z.infer<typeof shopifyGraphqlCostSchema>;

const graphqlErrorItemSchema = z.object({
  message: z.string(),
  extensions: z
    .object({
      code: z.string().optional(),
    })
    .nullish(),
});
export type ShopifyGraphqlErrorItem = z.infer<typeof graphqlErrorItemSchema>;

/** Top-level { data, errors, extensions } envelope of every GraphQL response. */
export const shopifyGraphqlEnvelopeSchema = z.object({
  data: z.unknown().optional(),
  errors: z.array(graphqlErrorItemSchema).optional(),
  extensions: z
    .object({
      cost: shopifyGraphqlCostSchema.optional(),
    })
    .nullish(),
});
export type ShopifyGraphqlEnvelope = z.infer<
  typeof shopifyGraphqlEnvelopeSchema
>;

// ---------------------------------------------------------------------------
// shop query (connection test)
// ---------------------------------------------------------------------------

export const shopQueryDataSchema = z.object({
  shop: z.object({
    name: z.string(),
    myshopifyDomain: z.string(),
    currencyCode: z.string(),
  }),
});
export type ShopQueryData = z.infer<typeof shopQueryDataSchema>;

// ---------------------------------------------------------------------------
// Product import page (cursor pagination)
// ---------------------------------------------------------------------------

export const shopifyProductNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  handle: z.string(),
  vendor: z.string(),
  productType: z.string(),
  tags: z.array(z.string()),
  descriptionHtml: z.string(),
  status: z.string(),
  featuredMedia: z
    .object({
      preview: z
        .object({
          image: z.object({ url: z.string() }).nullish(),
        })
        .nullish(),
    })
    .nullish(),
  variants: z.object({
    nodes: z.array(
      z.object({
        id: z.string(),
        sku: z.string().nullish(),
        /** Shopify Decimal scalar serialises as a string, e.g. "79.00". */
        price: z.string(),
        inventoryQuantity: z.number().nullish(),
      }),
    ),
  }),
});
export type ShopifyProductNode = z.infer<typeof shopifyProductNodeSchema>;

export const productsPageDataSchema = z.object({
  products: z.object({
    pageInfo: z.object({
      hasNextPage: z.boolean(),
      endCursor: z.string().nullish(),
    }),
    nodes: z.array(shopifyProductNodeSchema),
  }),
});
export type ProductsPageData = z.infer<typeof productsPageDataSchema>;

// ---------------------------------------------------------------------------
// productCreate
// ---------------------------------------------------------------------------

export const productCreateDataSchema = z.object({
  productCreate: z
    .object({
      product: z
        .object({
          id: z.string(),
          title: z.string(),
          handle: z.string().nullish(),
          status: z.string().nullish(),
        })
        .nullish(),
      userErrors: z.array(shopifyUserErrorSchema),
    })
    .nullish(),
});
export type ProductCreateData = z.infer<typeof productCreateDataSchema>;

// ---------------------------------------------------------------------------
// productVariantsBulkCreate
// ---------------------------------------------------------------------------

export const productVariantsBulkCreateDataSchema = z.object({
  productVariantsBulkCreate: z
    .object({
      productVariants: z
        .array(z.object({ id: z.string(), title: z.string().nullish() }))
        .nullish(),
      userErrors: z.array(shopifyUserErrorSchema),
    })
    .nullish(),
});
export type ProductVariantsBulkCreateData = z.infer<
  typeof productVariantsBulkCreateDataSchema
>;

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export const collectionCreateDataSchema = z.object({
  collectionCreate: z
    .object({
      collection: z
        .object({
          id: z.string(),
          title: z.string(),
          handle: z.string().nullish(),
        })
        .nullish(),
      userErrors: z.array(shopifyUserErrorSchema),
    })
    .nullish(),
});
export type CollectionCreateData = z.infer<typeof collectionCreateDataSchema>;

/** collections(first: 1, query: "title:'...'") lookup used for upsert. */
export const collectionsByTitleDataSchema = z.object({
  collections: z.object({
    nodes: z.array(z.object({ id: z.string(), title: z.string() })),
  }),
});
export type CollectionsByTitleData = z.infer<
  typeof collectionsByTitleDataSchema
>;

export const collectionAddProductsDataSchema = z.object({
  collectionAddProductsV2: z
    .object({
      job: z
        .object({ id: z.string(), done: z.boolean().nullish() })
        .nullish(),
      userErrors: z.array(shopifyUserErrorSchema),
    })
    .nullish(),
});
export type CollectionAddProductsData = z.infer<
  typeof collectionAddProductsDataSchema
>;

// ---------------------------------------------------------------------------
// Publications / publish
// ---------------------------------------------------------------------------

export const publicationsDataSchema = z.object({
  publications: z.object({
    nodes: z.array(
      z.object({
        id: z.string(),
        /** Deprecated in the Admin API but still served in 2026-07. */
        name: z.string().nullish(),
      }),
    ),
  }),
});
export type PublicationsData = z.infer<typeof publicationsDataSchema>;

export const publishablePublishDataSchema = z.object({
  publishablePublish: z
    .object({
      /** Inline fragment `... on Product { id }` → may be {} for other types. */
      publishable: z
        .object({ id: z.string().optional(), status: z.string().nullish() })
        .nullish(),
      userErrors: z.array(shopifyUserErrorSchema),
    })
    .nullish(),
});
export type PublishablePublishData = z.infer<
  typeof publishablePublishDataSchema
>;
