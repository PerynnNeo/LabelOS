import { z } from "zod";
import type { CollectionBrief } from "@/lib/domain/schemas";
import {
  AGENT_SCHEMA_NAMES,
  MARKER_TAGS,
  PROMPT_VERSIONS,
  marker,
  withGrounding,
} from "./common";

/**
 * LabelOS Collection Curator — STORY ONLY (spec section 15).
 *
 * The six final outfits are selected deterministically in domain code
 * (curation.ts); Claude's only job here is to write the short editorial story
 * and a collection title. It never picks or reorders outfits.
 */

export const collectionStorySchema = z.object({
  story: z.string(),
  title: z.string(),
});
export type CollectionStory = z.infer<typeof collectionStorySchema>;

const COLLECTION_CURATOR_ROLE = `You are the LabelOS Collection Storyteller. Write a short, editorial collection
story (2-4 sentences) and a concise collection title for an already-curated
capsule. Match the brand's understated, climate-smart voice. Describe the mood
and how the looks work together — do not invent products, prices, materials, or
sustainability claims, and do not reorder or re-select the outfits (they are
already chosen).`;

export const COLLECTION_CURATOR_SYSTEM = withGrounding(COLLECTION_CURATOR_ROLE);

/** Marker payload the mock storyteller reads to write without a model. */
interface StoryMarker {
  season: string;
  market: string;
  outfitCount: number;
}

export interface StoryOutfit {
  id?: string;
  name: string;
  occasion?: string;
}

export interface StoryRequest {
  system: string;
  user: string;
  schemaName: string;
  promptVersion: string;
}

export function buildStoryRequest(input: {
  brief: CollectionBrief;
  finalOutfits: StoryOutfit[];
  labels?: Record<string, string>;
}): StoryRequest {
  const { brief, finalOutfits, labels } = input;

  const outfitLines = finalOutfits
    .map((outfit, index) => {
      const label = outfit.id && labels ? labels[outfit.id] : undefined;
      const parts = [
        `${index + 1}. ${outfit.name}`,
        outfit.occasion ? `(${outfit.occasion})` : "",
        label ? `— ${label}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      return parts;
    })
    .join("\n");

  const payload: StoryMarker = {
    season: brief.season,
    market: brief.market,
    outfitCount: finalOutfits.length,
  };

  const user = [
    `Write the collection story and title for this ${brief.season} capsule for ${brief.market}.`,
    `Audience: ${brief.audience}. Climate: ${brief.climate}.`,
    `Commercial objective: ${brief.commercialObjective}`,
    "",
    "Final looks (already curated — do not change them):",
    outfitLines || "(no outfits supplied)",
    "",
    `  ${marker(MARKER_TAGS.story, payload)}`,
    "",
    "Return a JSON object with a `title` and a `story` (2-4 sentences).",
  ].join("\n");

  return {
    system: COLLECTION_CURATOR_SYSTEM,
    user,
    schemaName: AGENT_SCHEMA_NAMES.collectionStory,
    promptVersion: PROMPT_VERSIONS.collectionCurator,
  };
}
