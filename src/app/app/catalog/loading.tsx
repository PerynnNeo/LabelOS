/**
 * Catalog route skeleton: a header shell, a filter-tab row, and a 4-up grid of
 * placeholder cards that mirror the real layout while products load.
 */
export default function CatalogLoading() {
  return (
    <div aria-busy className="animate-[lo-fade_0.2s_ease]">
      <div className="lo-header flex items-center gap-3.5 px-[30px] pb-[18px] pt-[22px]">
        <div className="min-w-0 flex-1">
          <div className="h-[23px] w-40 rounded-[6px] bg-black/[0.07]" />
          <div className="mt-2 h-[13px] w-64 rounded-[5px] bg-black/[0.05]" />
        </div>
        <div className="h-9 w-32 rounded-[9px] bg-black/[0.06]" />
        <div className="h-9 w-28 rounded-[9px] bg-black/[0.06]" />
      </div>

      <div className="px-[30px] pt-4 pb-11">
        <div className="mb-[18px] flex flex-wrap gap-[7px]">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[30px] w-24 rounded-full bg-black/[0.05]"
            />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[15px] border border-[rgba(0,0,0,0.07)] bg-surface p-[9px]"
            >
              <div
                className="animate-[lo-pulse_1.6s_ease-in-out_infinite] rounded-[10px] bg-black/[0.06]"
                style={{ aspectRatio: "4 / 5" }}
              />
              <div className="px-1.5 pb-[5px] pt-[11px]">
                <div className="h-[13px] w-3/4 rounded-[5px] bg-black/[0.07]" />
                <div className="mt-2 h-[11px] w-1/2 rounded-[5px] bg-black/[0.05]" />
                <div className="mt-[11px] flex items-center justify-between">
                  <div className="h-[11px] w-16 rounded-[5px] bg-black/[0.05]" />
                  <div className="h-[18px] w-20 rounded-full bg-black/[0.05]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
