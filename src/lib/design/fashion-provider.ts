import "server-only";
import type { ImageBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { getEnv, isAnthropicConfigured } from "@/lib/env";
import type { BrandProfile, CollectionBrief, Usage } from "@/lib/domain/schemas";
import type {
  BrandDna,
  CollectionPlan,
  CollectionReview,
  CollectionSlot,
  ConceptSet,
  GarmentDesignSpec,
  VisualQa,
} from "@/lib/domain/design-schemas";
import {
  collectionPlanSchema,
  collectionReviewSchema,
  conceptSetSchema,
  visualQaSchema,
} from "@/lib/domain/design-schemas";
import type { ProductRecordInput } from "@/lib/agents/common";
import { getAnthropicProvider } from "@/lib/anthropic/provider";
import { buildCollectionPlanRequest } from "@/lib/agents/collection-architect";
import { buildConceptSetRequest } from "@/lib/agents/garment-designer";
import { buildVisualQaRequest } from "@/lib/agents/design-critic";
import { buildCollectionReviewRequest } from "@/lib/agents/collection-curator-new";
import { getMockFashionProvider } from "./mock-fashion-provider";

/**
 * Fashion-reasoning provider abstraction (image-generation spec §7, §10).
 *
 * The four "fashion reasoning" agents for the new-collection flow — Collection
 * Architect (plan), Garment Designer (concepts), Design Critic (visual QA) and
 * Collection Curator (review) — behind one interface with two implementations:
 *
 *  - the LIVE provider drives {@link getAnthropicProvider} + `structuredCall`
 *    with the agent request builders, whenever an Anthropic key is configured;
 *  - the deterministic {@link getMockFashionProvider} otherwise, so the whole
 *    workflow is demonstrable with no external call.
 *
 * Every method returns the schema-validated value plus token usage.
 */

export interface CreateCollectionPlanInput {
  brief: CollectionBrief;
  brandProfile: BrandProfile;
  /** Existing catalog, for non-duplication context only — never reproduced. */
  referenceProducts: ProductRecordInput[];
  brandDna?: BrandDna | null;
  collectionId?: string | null;
}

export interface CreateConceptSetInput {
  slot: CollectionSlot;
  brief: CollectionBrief;
  brandProfile: BrandProfile;
  brandDna?: BrandDna | null;
  otherSlots: CollectionSlot[];
  /** Slot position in the plan; defaults to a category-derived index. */
  slotIndex?: number;
}

export interface RunVisualQaInput {
  spec: GarmentDesignSpec;
  /** The generated concept image as a base64 vision content block. */
  imageBlock: ImageBlockParam;
}

export interface ReviewCollectionInput {
  selectedDesigns: GarmentDesignSpec[];
  brief: CollectionBrief;
  brandProfile: BrandProfile;
  collectionId?: string | null;
}

export interface CollectionPlanResult {
  plan: CollectionPlan;
  usage: Usage;
}
export interface ConceptSetResult {
  conceptSet: ConceptSet;
  usage: Usage;
}
export interface VisualQaResult {
  qa: VisualQa;
  usage: Usage;
}
export interface CollectionReviewResult {
  review: CollectionReview;
  usage: Usage;
}

export interface FashionReasoningProvider {
  /** True for the real API-backed provider, false for the deterministic mock. */
  readonly isLive: boolean;
  createCollectionPlan(
    input: CreateCollectionPlanInput,
  ): Promise<CollectionPlanResult>;
  createConceptSet(input: CreateConceptSetInput): Promise<ConceptSetResult>;
  runVisualQa(input: RunVisualQaInput): Promise<VisualQaResult>;
  reviewCollection(
    input: ReviewCollectionInput,
  ): Promise<CollectionReviewResult>;
}

// ---------------------------------------------------------------------------
// Live provider — real Claude via the shared structuredCall entry point
// ---------------------------------------------------------------------------

class LiveFashionProvider implements FashionReasoningProvider {
  readonly isLive = true;

  async createCollectionPlan(
    input: CreateCollectionPlanInput,
  ): Promise<CollectionPlanResult> {
    const request = buildCollectionPlanRequest({
      brief: input.brief,
      brandProfile: input.brandProfile,
      referenceProducts: input.referenceProducts,
      brandDna: input.brandDna ?? null,
    });
    const { data, usage } = await getAnthropicProvider().structuredCall({
      schema: collectionPlanSchema,
      schemaName: request.schemaName,
      system: request.system,
      user: request.user,
      maxTokens: 6000,
      route: "collections.create-plan",
      entityId: input.collectionId ?? null,
    });
    return { plan: data, usage };
  }

  async createConceptSet(
    input: CreateConceptSetInput,
  ): Promise<ConceptSetResult> {
    const request = buildConceptSetRequest({
      slot: input.slot,
      brief: input.brief,
      brandProfile: input.brandProfile,
      brandDna: input.brandDna ?? null,
      otherSlots: input.otherSlots,
      slotIndex: input.slotIndex,
    });
    const { data, usage } = await getAnthropicProvider().structuredCall({
      schema: conceptSetSchema,
      schemaName: request.schemaName,
      system: request.system,
      user: request.user,
      maxTokens: 8192,
      route: "collection-slots.generate-concepts",
      entityId: input.slot.provisionalStyleId,
    });
    return { conceptSet: data, usage };
  }

  async runVisualQa(input: RunVisualQaInput): Promise<VisualQaResult> {
    const request = buildVisualQaRequest({
      spec: input.spec,
      imageBlock: input.imageBlock,
    });
    const { data, usage } = await getAnthropicProvider().structuredCall({
      schema: visualQaSchema,
      schemaName: request.schemaName,
      system: request.system,
      user: request.user,
      maxTokens: 2048,
      route: "designs.visual-qa",
      entityId: input.spec.styleId,
    });
    return { qa: data, usage };
  }

  async reviewCollection(
    input: ReviewCollectionInput,
  ): Promise<CollectionReviewResult> {
    const request = buildCollectionReviewRequest({
      selectedDesigns: input.selectedDesigns,
      brief: input.brief,
      brandProfile: input.brandProfile,
    });
    const { data, usage } = await getAnthropicProvider().structuredCall({
      schema: collectionReviewSchema,
      schemaName: request.schemaName,
      system: request.system,
      user: request.user,
      maxTokens: 4096,
      route: "collections.review-designs",
      entityId: input.collectionId ?? null,
    });
    return { review: data, usage };
  }
}

// ---------------------------------------------------------------------------
// Selection — mirrors getAnthropicProvider: real provider when the Anthropic
// key is present, deterministic mock otherwise (so a missing key never crashes
// the new-collection flow).
// ---------------------------------------------------------------------------

let liveProvider: LiveFashionProvider | null = null;

export function getFashionProvider(): FashionReasoningProvider {
  if (isAnthropicConfigured(getEnv())) {
    if (!liveProvider) liveProvider = new LiveFashionProvider();
    return liveProvider;
  }
  return getMockFashionProvider();
}
