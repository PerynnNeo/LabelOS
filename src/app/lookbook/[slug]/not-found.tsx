import Link from "next/link";

/**
 * Tasteful 404 for the public lookbook (spec section 22).
 *
 * Rendered when the collection does not exist, is not public, or the backend
 * is unavailable. Deliberately says nothing about the app's internal state —
 * a public page must not leak setup hints.
 */
export default function LookbookNotFound() {
  return (
    <div className="flex min-h-dvh flex-1 items-center bg-paper">
      <main className="mx-auto w-full max-w-2xl px-6 py-24 text-center">
        <p className="eyebrow">Lookbook</p>
        <h1 className="mt-6 font-display text-4xl leading-tight text-ink sm:text-5xl">
          This lookbook isn&rsquo;t available.
        </h1>
        <p className="mx-auto mt-6 max-w-md text-lg leading-relaxed text-muted">
          The collection you&rsquo;re looking for may have been unpublished, or
          the link may be incorrect.
        </p>
        <div className="mt-10">
          <Link
            href="/"
            className="inline-flex items-center bg-ink px-6 py-3 text-sm font-medium tracking-wide text-paper transition-colors hover:bg-accent"
          >
            Back to LabelOS
          </Link>
        </div>
      </main>
    </div>
  );
}
