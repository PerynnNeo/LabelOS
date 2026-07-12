import { describe, it, expect } from "vitest";
import {
  buildFlatSketchSvg,
  SKETCH_DISCLAIMER,
  type FlatSketchInput,
} from "@/lib/domain/flat-sketch";

function design(overrides: Partial<FlatSketchInput> = {}): FlatSketchInput {
  return {
    sketchTemplate: "top",
    colourHex: "#A9C4CE",
    neckline: "crew",
    sleeveLength: "short",
    garmentLength: "regular",
    name: "Featherweight Overshirt",
    ...overrides,
  };
}

const TEMPLATES: FlatSketchInput["sketchTemplate"][] = [
  "top",
  "trouser",
  "skirt",
  "dress",
  "jacket",
];

describe("buildFlatSketchSvg — valid output", () => {
  it("returns an SVG using the approved fill colour", () => {
    const svg = buildFlatSketchSvg(design());
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('viewBox="0 0 600 700"');
    expect(svg).toContain('fill="#A9C4CE"');
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it("renders a filled garment path for every template", () => {
    for (const sketchTemplate of TEMPLATES) {
      const svg = buildFlatSketchSvg(design({ sketchTemplate }));
      expect(svg).toContain("<svg");
      expect(svg).toContain("<path");
      // The garment body is filled with the approved colour.
      expect(svg).toContain('fill="#A9C4CE"');
      expect(svg).toContain(SKETCH_DISCLAIMER);
    }
  });
});

describe("buildFlatSketchSvg — invalid hex fallback", () => {
  it("falls back to the default fill for an invalid hex", () => {
    const svg = buildFlatSketchSvg(design({ colourHex: "not-a-colour" }));
    expect(svg).not.toContain("not-a-colour");
    expect(svg).toContain('fill="#d9d4cc"');
  });

  it("accepts a 3-digit hex", () => {
    const svg = buildFlatSketchSvg(design({ colourHex: "#0af" }));
    expect(svg).toContain('fill="#0af"');
  });
});

describe("buildFlatSketchSvg — disclaimer + safety", () => {
  it("always renders the communication-aid disclaimer", () => {
    const svg = buildFlatSketchSvg(design());
    expect(SKETCH_DISCLAIMER).toBe("Communication aid — not a technical drawing");
    expect(svg).toContain(SKETCH_DISCLAIMER);
  });

  it("escapes the design name into the title", () => {
    const svg = buildFlatSketchSvg(design({ name: "A & B <script>" }));
    expect(svg).toContain("A &amp; B &lt;script&gt;");
    expect(svg).not.toContain("<script>");
  });
});
