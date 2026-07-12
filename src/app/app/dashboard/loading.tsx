import { PageHeader } from "@/components/lo";

/**
 * Dashboard skeleton — mirrors the Overview layout (hero, decision queue, the
 * catalog-analysis + collection column, activity) with muted pulsing blocks so
 * the frame stays stable while server data loads.
 */
function Block({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-[12px] bg-[rgba(0,0,0,0.06)] ${className ?? ""}`}
    />
  );
}

export default function DashboardLoading() {
  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle="Loading your studio…"
      />
      <div className="flex flex-col gap-[18px] px-[30px] pb-11 pt-[22px]">
        <Block className="h-[92px] rounded-[16px]" />
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Block className="h-[320px] rounded-[16px]" />
          <div className="flex flex-col gap-4">
            <Block className="h-[168px] rounded-[16px]" />
            <Block className="h-[184px] rounded-[16px]" />
          </div>
        </div>
        <Block className="h-[220px] rounded-[16px]" />
      </div>
    </div>
  );
}
