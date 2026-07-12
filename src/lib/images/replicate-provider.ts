import "server-only";
import Replicate from "replicate";
import { getEnv } from "@/lib/env";
import type {
  GenerateImageInput,
  ImageGenerationProvider,
  ProviderImage,
  ProviderImageStatus,
} from "./provider";
import { buildConceptSheetPrompt, buildPackshotPrompt } from "./prompt-builder";

/**
 * Replicate FLUX image provider (image spec §19). Creates asynchronous
 * predictions and returns immediately with a prediction id; the orchestration
 * layer polls {@link ReplicateImageProvider.getJob} and, on success, copies the
 * output into Supabase Storage. The model slug comes from REPLICATE_MODEL so the
 * app is never coupled to one permanent version. The token is server-only and
 * never returned to the browser or logged.
 */
export class ReplicateImageProvider implements ImageGenerationProvider {
  readonly kind = "replicate" as const;
  readonly isLive = true;
  private readonly client: Replicate;
  private readonly model: string;

  constructor() {
    const env = getEnv();
    if (!env.REPLICATE_API_TOKEN) {
      throw new ReplicateNotConfiguredError();
    }
    this.client = new Replicate({ auth: env.REPLICATE_API_TOKEN });
    this.model = env.REPLICATE_MODEL;
  }

  async generate(input: GenerateImageInput): Promise<ProviderImage> {
    const prompt =
      input.imageType === "concept_sheet"
        ? buildConceptSheetPrompt(input.spec)
        : buildPackshotPrompt(input.spec, input.side ?? "front");

    try {
      const prediction = await this.client.predictions.create({
        model: this.model,
        input: {
          prompt,
          aspect_ratio: input.imageType === "concept_sheet" ? "3:2" : "4:5",
          output_format: "webp",
          output_quality: 90,
          ...(input.seed != null ? { seed: input.seed } : {}),
        },
      });
      return this.toProviderImage(prediction, input.seed ?? null);
    } catch (error) {
      return failed(error, input.seed ?? null);
    }
  }

  async getJob(providerJobId: string): Promise<ProviderImage> {
    try {
      const prediction = await this.client.predictions.get(providerJobId);
      return this.toProviderImage(prediction, null);
    } catch (error) {
      return failed(error, null);
    }
  }

  private toProviderImage(
    prediction: { id: string; status: string; output?: unknown; error?: unknown },
    seed: number | null,
  ): ProviderImage {
    const status = mapStatus(prediction.status);
    return {
      status,
      providerJobId: prediction.id,
      imageUrl: status === "ready" ? firstOutputUrl(prediction.output) : null,
      contentType: "image/webp",
      seed,
      error:
        status === "failed"
          ? typeof prediction.error === "string"
            ? prediction.error
            : "Image generation failed at the provider."
          : null,
    };
  }
}

export class ReplicateNotConfiguredError extends Error {
  constructor() {
    super(
      "Replicate image generation is not configured. Set IMAGE_PROVIDER=replicate and REPLICATE_API_TOKEN, or keep IMAGE_PROVIDER=mock for deterministic SVG concepts.",
    );
    this.name = "ReplicateNotConfiguredError";
  }
}

function mapStatus(s: string): ProviderImageStatus {
  switch (s) {
    case "succeeded":
      return "ready";
    case "failed":
    case "canceled":
      return "failed";
    default:
      // starting | processing
      return "generating";
  }
}

/** FLUX output may be a single URL, a FileOutput, or an array of them. */
function firstOutputUrl(output: unknown): string | null {
  if (!output) return null;
  const pick = Array.isArray(output) ? output[0] : output;
  if (typeof pick === "string") return pick;
  if (pick && typeof pick === "object" && "url" in pick) {
    const u = (pick as { url: unknown }).url;
    return typeof u === "function" ? String((pick as { url: () => unknown }).url()) : String(u);
  }
  return null;
}

function failed(error: unknown, seed: number | null): ProviderImage {
  const message = error instanceof Error ? error.message : "Image provider request failed.";
  return {
    status: "failed",
    providerJobId: null,
    imageUrl: null,
    contentType: "image/webp",
    seed,
    error: message.replace(/r8_[A-Za-z0-9]+/g, "[redacted]"),
  };
}
