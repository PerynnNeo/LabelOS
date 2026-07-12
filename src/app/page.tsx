import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
          <span className="font-display text-xl tracking-tight text-ink">
            LabelOS
          </span>
          <Link
            href="/login"
            className="text-sm text-muted transition-colors hover:text-ink"
          >
            Log in
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center">
        <div className="mx-auto w-full max-w-5xl px-6 py-24">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">
            Agentic studio · MVP
          </p>
          <h1 className="mt-6 max-w-3xl font-display text-4xl leading-tight text-ink sm:text-5xl">
            LabelOS — the operating system for one-person fashion labels.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
            Take a real catalog from garment analysis and seasonal styling
            through product development and sourcing, and finish with a draft
            product in your own Shopify store. Agents propose; you approve.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-6">
            <Link
              href="/login"
              className="bg-ink px-6 py-3 text-sm font-medium tracking-wide text-paper transition-colors hover:bg-accent"
            >
              Enter the studio
            </Link>
            <p className="text-sm text-muted">
              Each published collection also gets a public, read-only lookbook
              at{" "}
              <span className="font-medium text-ink">
                /lookbook/&lt;collection&gt;
              </span>{" "}
              — no login required.
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 px-6 py-5">
          <p className="text-xs text-muted">
            Hackathon MVP. Runs in demo mode without external credentials.
          </p>
          <p className="text-xs text-muted">
            Human approval gates every public or financial action.
          </p>
        </div>
      </footer>
    </div>
  );
}
