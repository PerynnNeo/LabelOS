import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Search,
  Compass,
  LayoutGrid,
  Sparkles,
  Boxes,
  Store,
  Check,
  ShieldCheck,
  Brain,
  ImageIcon,
} from "lucide-react";
import { renderConceptSheet, svgToDataUri } from "@/lib/images/concept-svg";
import type { GarmentDesignSpec } from "@/lib/domain/design-schemas";

/**
 * Public landing page (/) — explains the full LabelOS process and shows the
 * actual product output: real garment concept sheets rendered by the design
 * engine's deterministic SVG renderer (the same code that produces mock-mode
 * concepts inside the app). Pure Server Component in the iOS visual language.
 */
export const metadata: Metadata = {
  title: "LabelOS — design a brand-new fashion collection with AI",
  description:
    "LabelOS studies your brand, then designs a brand-new seasonal collection — planning the garments, generating the actual concept images, and preparing them for sourcing and store launch. You approve every important decision.",
};

// ---------------------------------------------------------------------------
// Demo garment specs → rendered concept sheets used as the page visuals.
// ---------------------------------------------------------------------------

function makeSpec(o: Partial<GarmentDesignSpec>): GarmentDesignSpec {
  return {
    styleId: "TOP-NEW-001",
    productName: "New Garment",
    conceptTitle: "Concept",
    category: "top",
    role: "core",
    silhouette: "relaxed",
    fit: "regular",
    length: "hip",
    neckline: "crew",
    collar: null,
    sleeveLength: "short",
    sleeveShape: "straight",
    waistConstruction: null,
    hem: "straight",
    closures: [],
    pockets: [],
    seamDetails: [],
    constructionDetails: [],
    primaryMaterialRequirement: {
      fibreRequirement: "breathable woven",
      targetWeightGsmMin: 160,
      targetWeightGsmMax: 220,
      handFeel: "soft",
      drape: "fluid",
      stretch: "none",
      opacity: "opaque",
      verificationNeeded: true,
    },
    trims: [],
    colourways: [{ name: "Sand", hex: "#D9CDB8", role: "primary" }],
    targetRetailPrice: 120,
    targetFullyLoadedCost: 36,
    estimatedMarginPercent: 70,
    coordinatesWithSlotIds: [],
    brandFitReason: "",
    trendReason: "",
    climateReason: "",
    commercialReason: "",
    manufacturabilityRisks: [],
    unknowns: [],
    originalityCheck: { avoidsDirectCopy: true, notes: "" },
    imagePromptFacts: {
      garmentOnly: true,
      frontBackSheet: true,
      background: "warm white",
      visualStyle: "clean product render",
    },
    brandFitScore: 0.86,
    climateFitScore: 0.82,
    manufacturabilityScore: 0.78,
    ...o,
  };
}

const SHOWCASE: Array<{ spec: GarmentDesignSpec; label: string }> = [
  {
    label: "TOP · Core",
    spec: makeSpec({
      styleId: "TOP-NEW-001",
      productName: "Camp Collar Shirt",
      category: "top",
      silhouette: "boxy",
      collar: "camp collar",
      sleeveLength: "short",
      length: "hip",
      closures: ["button placket"],
      pockets: ["patch"],
      colourways: [{ name: "Bone", hex: "#E7E0D2", role: "primary" }],
    }),
  },
  {
    label: "BOTTOM · Core",
    spec: makeSpec({
      styleId: "BOTTOM-NEW-001",
      productName: "Wide-Leg Trouser",
      category: "bottom",
      silhouette: "wide",
      length: "full",
      waistConstruction: "pleated",
      seamDetails: ["pleat"],
      pockets: ["side"],
      colourways: [{ name: "Clay", hex: "#B8A48C", role: "primary" }],
    }),
  },
  {
    label: "DRESS · Directional",
    spec: makeSpec({
      styleId: "DRESS-NEW-001",
      productName: "Draped Midi Dress",
      category: "dress",
      silhouette: "a-line",
      neckline: "v-neck",
      sleeveLength: "sleeveless",
      length: "midi",
      colourways: [{ name: "Sage", hex: "#CFD9D2", role: "primary" }],
    }),
  },
  {
    label: "LAYER · Directional",
    spec: makeSpec({
      styleId: "LAYER-NEW-001",
      productName: "Lightweight Overshirt",
      category: "outerwear",
      silhouette: "boxy",
      collar: "collar",
      sleeveLength: "long",
      length: "hip",
      closures: ["button placket"],
      pockets: ["patch"],
      colourways: [{ name: "Sand", hex: "#D9CDB8", role: "primary" }],
    }),
  },
];

const STEPS = [
  {
    icon: Search,
    n: "01",
    title: "Learn your brand",
    body: "Your existing catalog is analysed as reference — colours, silhouettes, price architecture and material patterns become your brand DNA. Existing products are learning input, never the output.",
  },
  {
    icon: Compass,
    n: "02",
    title: "Trend & customer direction",
    body: "Trend evidence is filtered through your market, climate and audience into a few honest directions — clearly labelled demo or live research. You pick the ones to build on.",
  },
  {
    icon: LayoutGrid,
    n: "03",
    title: "Plan the new collection",
    body: "A four-slot capsule blueprint: one new top, bottom, dress and light layer — each with a role, target price, margin and a reason it belongs. Checked against your catalog so nothing duplicates.",
  },
  {
    icon: Sparkles,
    n: "04",
    title: "Design the garments — with real images",
    body: "For every slot, three genuinely different concepts are designed and their actual concept images generated (FLUX when configured, deterministic SVG in demo). You select one per slot; the four are reviewed as one collection.",
    highlight: true,
  },
  {
    icon: Boxes,
    n: "05",
    title: "Source, sample & prepare",
    body: "Draft specifications, costing and supplier comparison — then a simulated sample request and measurement review for the hero product. Nothing is ordered; no supplier is contacted.",
  },
  {
    icon: Store,
    n: "06",
    title: "Store draft & launch",
    body: "Titles, descriptions, variants and a public lookbook for the new collection. Drafts are created hidden first; publishing to your store is a separate action you confirm.",
  },
];

function Sheet({ spec }: { spec: GarmentDesignSpec }) {
  const uri = svgToDataUri(renderConceptSheet(spec));
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={uri}
      alt={`${spec.productName} concept sheet — front and back`}
      className="h-auto w-full"
      loading="lazy"
    />
  );
}

export default function Home() {
  return (
    <main className="min-h-dvh bg-canvas text-ink">
      {/* Nav */}
      <header className="lo-header">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-4">
          <div className="flex size-8 items-center justify-center rounded-[9px] bg-accent text-[15px] font-extrabold text-white shadow-[0_3px_8px_-1px_rgba(10,132,255,0.5)]">
            L
          </div>
          <span className="flex-1 font-display text-[22px] tracking-[0.01em]">
            LabelOS
          </span>
          <Link
            href="/app/dashboard"
            className="inline-flex h-9 items-center gap-1.5 rounded-[9px] bg-accent px-4 text-[13px] font-semibold text-white transition hover:brightness-[0.96]"
          >
            Enter the studio
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-gradient-to-b from-[rgba(10,132,255,0.08)] to-transparent"
        />
        <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-10 text-center">
          <div className="text-[12px] font-semibold uppercase tracking-[0.2em] text-accent">
            The AI workforce for a fashion label
          </div>
          <h1 className="mx-auto mt-5 max-w-4xl font-display text-6xl leading-[1.03] tracking-[-0.01em] sm:text-7xl">
            Design a brand-new
            <br />
            <span className="italic">seasonal collection.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-[16px] leading-relaxed text-ink3">
            LabelOS studies your brand, then creates the actual visual concepts
            for a new clothing collection — planning the garments, generating the
            concept images, and preparing them for sourcing, sampling and store
            launch. You approve every important decision.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/app/dashboard"
              className="inline-flex h-12 items-center gap-2 rounded-[13px] bg-accent px-6 text-[15px] font-[650] text-white shadow-[0_6px_16px_-4px_rgba(10,132,255,0.6)] transition hover:brightness-[0.96]"
            >
              Start a collection
              <ArrowRight aria-hidden className="size-[18px]" />
            </Link>
            <Link
              href="/app/catalog"
              className="inline-flex h-12 items-center gap-2 rounded-[13px] border border-[rgba(0,0,0,0.12)] bg-surface px-6 text-[15px] font-semibold text-ink transition hover:bg-[#fafafa]"
            >
              See the reference catalog
            </Link>
          </div>
          <p className="mt-4 text-[12.5px] text-muted">
            Runs fully in demo mode — no external services contacted. Add an
            image key for live FLUX renders.
          </p>

          {/* Hero visual — the generated concept sheets */}
          <div className="mt-14 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {SHOWCASE.map((s) => (
              <div
                key={s.spec.styleId}
                className="lo-card overflow-hidden p-3"
              >
                <div className="overflow-hidden rounded-[10px] bg-[#F6F4EF]">
                  <Sheet spec={s.spec} />
                </div>
                <div className="flex items-center justify-between px-1 pt-3">
                  <span className="text-[12.5px] font-[650]">
                    {s.spec.productName}
                  </span>
                  <span className="font-mono text-[10.5px] text-muted">
                    {s.spec.styleId}
                  </span>
                </div>
                <div className="mt-2 px-1">
                  <span className="inline-block rounded-full bg-[rgba(255,149,0,0.13)] px-2.5 py-1 text-[10.5px] font-semibold text-[#B25000]">
                    AI concept — not production approved
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-5 max-w-2xl text-[13px] text-muted">
            Real output: front-and-back garment concept sheets generated for each
            new collection slot — always clearly labelled, never passed off as a
            finished product.
          </p>
        </div>
      </section>

      {/* Process */}
      <section className="border-t border-[rgba(0,0,0,0.06)] bg-surface py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <div className="text-[12px] font-semibold uppercase tracking-[0.2em] text-accent">
              The process
            </div>
            <h2 className="mx-auto mt-3 max-w-3xl font-display text-4xl leading-tight tracking-[-0.01em] sm:text-5xl">
              From your catalog to a launched collection
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-ink3">
              Six stages, each with its own AI specialist doing the work and a
              clear place for your approval before anything costly or public.
            </p>
          </div>

          <ol className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <li
                  key={step.n}
                  className={
                    "rounded-[16px] border p-6 " +
                    (step.highlight
                      ? "border-[rgba(10,132,255,0.28)] bg-[linear-gradient(120deg,rgba(10,132,255,0.07),rgba(10,132,255,0.02))]"
                      : "border-[rgba(0,0,0,0.07)] bg-canvas")
                  }
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={
                        "flex size-11 items-center justify-center rounded-[13px] " +
                        (step.highlight
                          ? "bg-accent text-white shadow-[0_6px_16px_-4px_rgba(10,132,255,0.6)]"
                          : "bg-[rgba(10,132,255,0.1)] text-accent")
                      }
                    >
                      <Icon aria-hidden className="size-[22px]" strokeWidth={1.9} />
                    </div>
                    <span className="font-mono text-[13px] font-semibold text-muted">
                      {step.n}
                    </span>
                  </div>
                  <h3 className="mt-4 text-[17px] font-[680] tracking-[-0.01em]">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-ink3">
                    {step.body}
                  </p>
                  {step.highlight ? (
                    <span className="mt-4 inline-block rounded-full bg-accent/10 px-3 py-1 text-[11px] font-semibold text-accent">
                      The visual heart of LabelOS
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* Two engines */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <div className="text-[12px] font-semibold uppercase tracking-[0.2em] text-accent">
              How it works
            </div>
            <h2 className="mx-auto mt-3 max-w-3xl font-display text-4xl leading-tight tracking-[-0.01em] sm:text-5xl">
              Two engines, one workflow
            </h2>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            <div className="lo-card p-8">
              <div className="flex size-12 items-center justify-center rounded-[13px] bg-[#D97757] text-white">
                <Brain aria-hidden className="size-6" strokeWidth={1.9} />
              </div>
              <h3 className="mt-5 text-[19px] font-[680]">Claude reasons</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink3">
                Analyses your catalog, extracts brand DNA, plans the assortment,
                writes structured garment design specifications, critiques the
                generated images, reviews the collection for coherence, and
                drafts specs and store copy. Every machine-read output is
                schema-validated.
              </p>
            </div>
            <div className="lo-card p-8">
              <div className="flex size-12 items-center justify-center rounded-[13px] bg-accent text-white">
                <ImageIcon aria-hidden className="size-6" strokeWidth={1.9} />
              </div>
              <h3 className="mt-5 text-[19px] font-[680]">
                The image engine renders
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink3">
                A separate image provider creates the actual garment concept
                visuals — FLUX via Replicate when configured, and deterministic
                SVG concept sheets in demo mode. Deterministic technical flats and
                a Claude visual-QA pass keep every render honest and consistent.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Control / trust */}
      <section className="border-t border-[rgba(0,0,0,0.06)] bg-surface py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="flex size-12 items-center justify-center rounded-[13px] bg-[rgba(52,199,89,0.14)] text-[#248A3D]">
                <ShieldCheck aria-hidden className="size-6" strokeWidth={1.9} />
              </div>
              <h2 className="mt-5 font-display text-4xl leading-tight tracking-[-0.01em] sm:text-5xl">
                You stay in control
              </h2>
              <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-ink3">
                The agents analyse, draft, score and recommend — but the word
                &ldquo;approved&rdquo; is reserved for you. Nothing gets ordered,
                published, or sent to a supplier without an explicit human
                decision.
              </p>
            </div>
            <ul className="grid gap-3">
              {[
                "Approve the collection plan before any garment is designed",
                "Select one concept per slot — the rest stay unselected",
                "Approve the collection review before sourcing begins",
                "Choose a sampling supplier; no supplier is ever contacted in demo",
                "Create hidden store drafts, then confirm publication separately",
                "Materials read from an image are shown as visual guesses, not fact",
              ].map((t) => (
                <li
                  key={t}
                  className="flex items-start gap-3 rounded-[12px] border border-[rgba(0,0,0,0.06)] bg-canvas px-4 py-3"
                >
                  <span className="mt-0.5 flex size-5 flex-none items-center justify-center rounded-full bg-[rgba(52,199,89,0.15)] text-[#248A3D]">
                    <Check aria-hidden className="size-3.5" strokeWidth={3} />
                  </span>
                  <span className="text-[13.5px] leading-snug text-ink2">{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="font-display text-5xl leading-[1.05] tracking-[-0.01em] sm:text-6xl">
            Ready to design your
            <br />
            <span className="italic">next collection?</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-ink3">
            Open the studio — it&rsquo;s pre-loaded with a demo brand so you can
            walk the whole flow from catalog to launch right now.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/app/dashboard"
              className="inline-flex h-12 items-center gap-2 rounded-[13px] bg-accent px-7 text-[15px] font-[650] text-white shadow-[0_6px_16px_-4px_rgba(10,132,255,0.6)] transition hover:brightness-[0.96]"
            >
              Enter the studio
              <ArrowRight aria-hidden className="size-[18px]" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[rgba(0,0,0,0.06)] py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-6 text-[12px] text-muted">
          <span className="font-display text-[15px] text-ink">LabelOS</span>
          <span>·</span>
          <span>
            A hackathon MVP. Concept images and draft specifications require
            sampling and human validation before production.
          </span>
          <span className="ml-auto">
            Published collections get a public lookbook at{" "}
            <span className="font-mono text-ink2">/lookbook/&lt;slug&gt;</span>
          </span>
        </div>
      </footer>
    </main>
  );
}
