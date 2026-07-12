import "server-only";
import { getEnv, isImageProviderLive } from "@/lib/env";
import type { GarmentDesignSpec, ImageType } from "@/lib/domain/design-schemas";
import { MockImageProvider } from "./mock-provider";
import { ReplicateImageProvider } from "./replicate-provider";

/**
 * Garment image-generation provider abstraction (image spec §7, §19).
 *
 * Two implementations selected by env:
 *  - {@link getMockImageProvider} — deterministic SVG concept sheets, no network.
 *  - the Replicate FLUX adapter — real text-to-image, async predictions.
 *
 * The provider only *produces* an image (data URI or a temporary provider URL);
 * persisting it into Supabase Storage and running visual QA is the job of the
 * orchestration layer (`image-jobs.ts`), so creating an image never publishes it.
 */

export interface GenerateImageInput {
  spec: GarmentDesignSpec;
  imageType: ImageType;
  /** front/back for packshots; ignored for concept sheets. */
  side?: "front" | "back";
  /** Stable seed for reproducible regeneration (Replicate); mock ignores it. */
  seed?: number | null;
}

export type ProviderImageStatus = "ready" | "generating" | "failed";

export interface ProviderImage {
  status: ProviderImageStatus;
  /** Replicate prediction id; null for the synchronous mock. */
  providerJobId: string | null;
  /** data: URI (mock) or the provider's temporary output URL (live, pre-storage). */
  imageUrl: string | null;
  contentType: string;
  seed: number | null;
  /** Safe error string (never a token) when status is "failed". */
  error: string | null;
}

export interface ImageGenerationProvider {
  readonly kind: "mock" | "replicate";
  readonly isLive: boolean;
  /** Start (or, for mock, immediately produce) an image for a design spec. */
  generate(input: GenerateImageInput): Promise<ProviderImage>;
  /** Poll a live prediction. Mock jobs are already "ready". */
  getJob(providerJobId: string): Promise<ProviderImage>;
}

let mockProvider: ImageGenerationProvider | null = null;
let replicateProvider: ImageGenerationProvider | null = null;

export function getImageProvider(): ImageGenerationProvider {
  const env = getEnv();
  if (isImageProviderLive(env)) {
    if (!replicateProvider) replicateProvider = new ReplicateImageProvider();
    return replicateProvider;
  }
  if (!mockProvider) mockProvider = new MockImageProvider();
  return mockProvider;
}

/** Test/reset hook. */
export function resetImageProviders(): void {
  mockProvider = null;
  replicateProvider = null;
}
