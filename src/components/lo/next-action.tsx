"use client";

import type { ActionLink } from "./action";
import { Button } from "./button";
import { Icon, type IconName } from "./icon";
import { cn } from "@/lib/utils";

/**
 * The recurring accent-tinted "Next action" hero band (`.lo-hero`): an eyebrow,
 * a bold title, one line of help, and a primary CTA with a trailing arrow on
 * the right. `size="lg"` is the taller dashboard variant with a leading icon
 * tile; `md` (default) is the in-studio band.
 */
export interface NextActionProps {
  eyebrow?: string;
  title: React.ReactNode;
  help?: React.ReactNode;
  action?: ActionLink;
  /** Optional leading icon tile (accent-filled). */
  icon?: IconName;
  size?: "md" | "lg";
  className?: string;
}

export function NextAction({
  eyebrow = "Next action",
  title,
  help,
  action,
  icon,
  size = "md",
  className,
}: NextActionProps) {
  const lg = size === "lg";
  return (
    <div
      className={cn(
        "lo-hero flex items-center gap-5",
        lg ? "px-6 py-5" : "px-[22px] py-[18px]",
        className,
      )}
    >
      {icon ? (
        <div
          className={cn(
            "flex flex-none items-center justify-center rounded-[14px] bg-accent text-white shadow-[0_6px_16px_-4px_rgba(10,132,255,0.6)]",
            lg ? "size-[52px]" : "size-11",
          )}
        >
          <Icon name={icon} size={lg ? 26 : 22} />
        </div>
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="text-[11.5px] font-bold uppercase tracking-[0.05em] text-accent">
          {eyebrow}
        </div>
        <div
          className={cn(
            "mt-0.5 font-bold tracking-[-0.01em] text-ink",
            lg ? "text-[19px]" : "text-[17px]",
          )}
        >
          {title}
        </div>
        {help ? (
          <div className="mt-0.5 text-[12.5px] leading-snug text-ink3">{help}</div>
        ) : null}
      </div>

      {action ? (
        action.href && !action.disabled ? (
          <a
            href={action.href}
            className="inline-flex h-11 flex-none items-center justify-center gap-2 whitespace-nowrap rounded-[12px] bg-accent px-5 text-[14px] font-[650] text-white shadow-[0_4px_12px_-3px_rgba(10,132,255,0.6)] transition hover:brightness-[0.96]"
          >
            {action.label}
            <Icon name="arrow-right" size={16} strokeWidth={2} />
          </a>
        ) : (
          <Button
            className="flex-none"
            onClick={action.onClick}
            disabled={action.disabled}
            loading={action.loading}
          >
            {action.label}
            <Icon name="arrow-right" size={16} strokeWidth={2} />
          </Button>
        )
      ) : null}
    </div>
  );
}
