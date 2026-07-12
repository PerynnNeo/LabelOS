/**
 * Route-level skeleton for the Collection Studio. Mirrors the shell: frosted
 * header, the 6-step tracker card, a next-action band, and two content cards.
 */
function Bar({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-line/70 ${className ?? ""}`} />;
}

export default function CollectionStudioLoading() {
  return (
    <div className="flex min-h-full flex-col" aria-busy="true" aria-live="polite">
      <div className="lo-header flex items-center gap-3.5 px-[30px] pb-[18px] pt-[22px]">
        <div className="min-w-0 flex-1">
          <Bar className="h-[22px] w-40" />
          <Bar className="mt-2 h-3 w-72 max-w-full" />
        </div>
        <Bar className="h-[34px] w-24 rounded-[9px]" />
      </div>

      <div className="flex-1 px-[30px] pb-10 pt-[18px]">
        <div className="lo-card mb-4 flex items-center gap-4 px-[26px] py-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-2.5">
              <Bar className="size-[30px] rounded-full" />
              <Bar className="h-3 w-14" />
            </div>
          ))}
        </div>

        <Bar className="mb-[18px] h-[86px] w-full rounded-2xl" />

        <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[1.3fr_1fr]">
          <Bar className="h-72 rounded-2xl" />
          <Bar className="h-72 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
