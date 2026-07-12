import type {
  ActivityLogRow,
  ProductRow,
} from "@/lib/supabase/repositories";
import type { ProductCardData } from "@/components/product-card";
import type { AgentTraceEntry } from "@/components/agent-trace";

/**
 * Presentational mappers from database rows to component data shapes. Pure and
 * client-safe: every import above is type-only, so no server module is bundled.
 */

/** Map a product row to the ProductCard data shape. */
export function toProductCard(
  product: ProductRow,
  currency: string,
): ProductCardData {
  return {
    id: product.id,
    title: product.title,
    sku: product.sku || undefined,
    price: product.price,
    currency,
    inventoryQuantity: product.inventory_quantity,
    imageUrl: product.public_image_url,
    category: product.analysis?.category ?? null,
    analysisStatus: product.analysis_status,
  };
}

/** Map an activity-log row to the AgentTrace entry shape. */
export function toAgentTraceEntry(row: ActivityLogRow): AgentTraceEntry {
  const usage = row.usage ?? {};
  return {
    id: row.id,
    actor: row.actor,
    action: row.action,
    entityType: row.entity_type,
    provider: row.provider,
    model: row.model,
    inputSummary: row.input_summary || undefined,
    outputSummary: row.output_summary || undefined,
    usage: {
      inputTokens: typeof usage.inputTokens === "number" ? usage.inputTokens : 0,
      outputTokens:
        typeof usage.outputTokens === "number" ? usage.outputTokens : 0,
      webSearchRequests:
        typeof usage.webSearchRequests === "number"
          ? usage.webSearchRequests
          : 0,
      durationMs: typeof usage.durationMs === "number" ? usage.durationMs : 0,
    },
    createdAt: row.created_at,
  };
}
