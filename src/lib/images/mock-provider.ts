import "server-only";
import type {
  GenerateImageInput,
  ImageGenerationProvider,
  ProviderImage,
} from "./provider";
import {
  renderConceptSheet,
  renderTechnicalFlat,
  svgToDataUri,
} from "./concept-svg";

/**
 * Deterministic SVG image provider (image spec §17). Produces recognisable
 * garment concept sheets and packshots with no network call, so the whole
 * new-collection flow demonstrates truthfully in mock mode. Every image is
 * labelled a mock concept inside the SVG itself.
 */
export class MockImageProvider implements ImageGenerationProvider {
  readonly kind = "mock" as const;
  readonly isLive = false;

  async generate(input: GenerateImageInput): Promise<ProviderImage> {
    const svg =
      input.imageType === "technical_flat_back"
        ? renderTechnicalFlat(input.spec, "back")
        : input.imageType === "technical_flat_front"
          ? renderTechnicalFlat(input.spec, "front")
          : input.imageType === "final_packshot_back"
            ? renderTechnicalFlat(input.spec, "back")
            : input.imageType === "final_packshot_front"
              ? renderTechnicalFlat(input.spec, "front")
              : renderConceptSheet(input.spec);

    return {
      status: "ready",
      providerJobId: null,
      imageUrl: svgToDataUri(svg),
      contentType: "image/svg+xml",
      seed: input.seed ?? null,
      error: null,
    };
  }

  async getJob(): Promise<ProviderImage> {
    // Mock generation is synchronous; there is no pending job to poll.
    return {
      status: "ready",
      providerJobId: null,
      imageUrl: null,
      contentType: "image/svg+xml",
      seed: null,
      error: null,
    };
  }

  /** Raw SVG string for a concept sheet — used when storing to Supabase. */
  conceptSvg(input: GenerateImageInput): string {
    return input.imageType.startsWith("technical_flat") ||
      input.imageType.startsWith("final_packshot")
      ? renderTechnicalFlat(input.spec, input.side ?? "front")
      : renderConceptSheet(input.spec);
  }
}
