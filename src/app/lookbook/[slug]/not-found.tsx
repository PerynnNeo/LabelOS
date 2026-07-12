import Link from "next/link";

/**
 * Tasteful 404 for the public lookbook, in the same warm editorial palette as
 * the lookbook itself. Rendered when the collection does not exist, is not
 * public, or the backend is unavailable — it deliberately says nothing about
 * the app's internal state (a public page must not leak setup hints).
 */
export default function LookbookNotFound() {
  return (
    <div className="flex min-h-dvh items-center bg-[#F7F5F1]">
      <main className="mx-auto w-full max-w-[640px] px-6 py-24 text-center">
        <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-[#A08D74]">
          Lookbook
        </p>
        <h1 className="mt-6 font-display text-[40px] leading-tight tracking-[-0.01em] text-[#1D1D1F] sm:text-[52px]">
          This lookbook isn&rsquo;t available.
        </h1>
        <p className="mx-auto mt-6 max-w-[420px] text-[15px] leading-relaxed text-[#6E6E73]">
          The collection you&rsquo;re looking for may have been unpublished, or
          the link may be incorrect.
        </p>
        <div className="mt-10">
          <Link
            href="/"
            className="inline-flex h-11 items-center gap-2 rounded-[12px] bg-[#1D1D1F] px-6 text-[14px] font-semibold tracking-wide text-white transition-opacity hover:opacity-90"
          >
            Back to LabelOS
          </Link>
        </div>
      </main>
    </div>
  );
}
