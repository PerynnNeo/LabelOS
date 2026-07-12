import { Icon, type IconName } from "./icon";
import { cn } from "@/lib/utils";

/**
 * Centered empty state — an optional icon, a title, a description and an
 * optional action slot. Used when a filter matches nothing or a list is empty.
 */
export interface EmptyStateProps {
  icon?: IconName;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center px-5 py-[70px] text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-3 flex size-11 items-center justify-center rounded-[12px] bg-[rgba(120,120,128,0.1)] text-muted">
          <Icon name={icon} size={22} />
        </div>
      ) : null}
      <div className="text-[15px] font-semibold text-ink2">{title}</div>
      {description ? (
        <div className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted">
          {description}
        </div>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/**
 * Friendly setup card a Server Component renders when a backend service isn't
 * configured (e.g. `SupabaseNotConfiguredError`) — instead of crashing the
 * page. Honest and non-alarming: it explains what's missing and how to enable
 * live data.
 */
export interface SetupCardProps {
  /** Service name, e.g. "Supabase", "Shopify", "Anthropic". */
  service: string;
  message?: React.ReactNode;
  className?: string;
}

export function SetupCard({ service, message, className }: SetupCardProps) {
  return (
    <div
      className={cn(
        "lo-card flex items-start gap-3.5 p-[18px]",
        className,
      )}
    >
      <div className="flex size-10 flex-none items-center justify-center rounded-[11px] bg-[rgba(255,149,0,0.13)] text-[#B25000]">
        <Icon name="alert-triangle" size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-[650] text-ink">
          {service} isn&rsquo;t configured yet
        </div>
        <div className="mt-1 text-[12.5px] leading-relaxed text-ink3">
          {message ?? (
            <>
              Add the required environment variables and run the database
              migration to enable live data. Until then this screen has nothing
              to show — the rest of LabelOS still runs in demo mode.
            </>
          )}
        </div>
      </div>
    </div>
  );
}
