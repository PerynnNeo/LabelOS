import { cn } from "@/lib/utils";

/**
 * Frosted sticky screen header (`.lo-header`): a 23px bold title, a muted
 * subtitle line, and an optional right-aligned actions slot. Every screen
 * opens with one of these.
 */
export interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right-aligned controls (buttons, mode chips, toggles). */
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "lo-header flex items-center gap-3.5 px-[30px] pt-[22px] pb-[18px]",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <h1 className="text-[23px] font-bold leading-tight tracking-[-0.02em] text-ink">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-none items-center gap-2.5">{actions}</div>
      ) : null}
    </header>
  );
}
