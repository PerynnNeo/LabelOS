import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Root landing — the outermost iOS "window" framing (bg-window) with a single
 * centered card. Instrument-Serif wordmark, a one-line description, and the
 * primary way in (Enter workspace → /login). The public read-only lookbook is
 * mentioned but not linked (no login required, but the slug is per-collection).
 *
 * Pure Server Component: the CTA is a styled <Link>, so no client boundary is
 * needed here.
 */
export const metadata: Metadata = {
  title: "LabelOS — operating system for one-person fashion labels",
  description:
    "Take a real catalog from garment analysis and seasonal styling through product development and sourcing to a draft in your own Shopify store. Agents propose; you approve.",
};

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-window px-6 py-16">
      <div className="w-full max-w-[420px]">
        <div className="lo-card px-8 py-10 text-center shadow-raise">
          <div
            aria-hidden
            className="mx-auto mb-6 flex size-12 items-center justify-center rounded-[13px] bg-accent text-[22px] font-extrabold text-white shadow-[0_3px_8px_-1px_rgba(10,132,255,0.5)]"
          >
            L
          </div>

          <h1 className="font-display text-5xl leading-none tracking-[-0.01em] text-ink">
            LabelOS
          </h1>
          <p className="mx-auto mt-4 max-w-[320px] text-[14px] leading-relaxed text-ink3">
            The operating system for one-person fashion labels — catalog to
            collection to a draft in your own Shopify store. Agents propose; you
            approve.
          </p>

          <div className="mt-8">
            <Link
              href="/login"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-accent px-5 text-[14px] font-[650] text-white shadow-[0_4px_12px_-3px_rgba(10,132,255,0.6)] transition hover:brightness-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              Enter workspace
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>

          <p className="mt-4 text-[12px] text-muted">
            Runs in demo mode with no external credentials. Human approval gates
            every public or financial action.
          </p>
        </div>

        <p className="mx-auto mt-5 max-w-[380px] text-center text-[12px] leading-relaxed text-muted">
          Every published collection also gets a public, read-only lookbook at{" "}
          <span className="font-mono text-ink2">/lookbook/&lt;collection&gt;</span>{" "}
          — no login required.
        </p>
      </div>
    </main>
  );
}
