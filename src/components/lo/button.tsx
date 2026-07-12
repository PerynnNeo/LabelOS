"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/**
 * iOS-style buttons.
 *
 * - `primary`   accent fill, white label, soft accent shadow (main CTAs)
 * - `secondary` white surface with a hairline border (header / inline actions)
 * - `ghost`     transparent, tints on hover
 * - `danger`    white surface, red label (destructive, outline style per mockup)
 * - `success`   green fill, white label (publish confirm)
 *
 * Sizes: `md` ≈ 44px tall / 12px radius (heroes, modals); `sm` ≈ 36px / 9px
 * radius (headers, cards). A `loading` spinner reuses the shared `lo-spin`
 * keyframes and disables the button.
 */
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "success";
export type ButtonSize = "sm" | "md";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "border-transparent bg-accent font-[650] text-white shadow-[0_4px_12px_-3px_rgba(10,132,255,0.6)] hover:brightness-[0.96]",
  secondary:
    "border-[rgba(0,0,0,0.12)] bg-surface font-semibold text-ink hover:bg-[#FAFAFA]",
  ghost:
    "border-transparent bg-transparent font-semibold text-ink hover:bg-[rgba(0,0,0,0.05)]",
  danger:
    "border-[rgba(0,0,0,0.12)] bg-surface font-semibold text-[#C4271B] hover:bg-[#FFF5F5]",
  success:
    "border-transparent bg-[#248A3D] font-[650] text-white hover:brightness-[0.96]",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-9 rounded-[9px] px-[15px] text-[13px]",
  md: "h-11 rounded-[12px] px-5 text-[14px]",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    disabled,
    className,
    children,
    type,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap border transition disabled:cursor-not-allowed disabled:opacity-60",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden
          className="size-4 flex-none animate-[lo-spin_0.7s_linear_infinite] rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  );
});

/**
 * Square icon-only button (close, revise, remove …). `label` is required and
 * becomes the accessible name + tooltip. Defaults to a 34px secondary chip.
 */
export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: number;
  variant?: "secondary" | "ghost" | "danger";
}

const ICON_VARIANT: Record<NonNullable<IconButtonProps["variant"]>, string> = {
  secondary:
    "border border-[rgba(0,0,0,0.12)] bg-surface text-ink2 hover:bg-[#FAFAFA]",
  ghost:
    "border border-transparent bg-transparent text-ink2 hover:bg-[rgba(0,0,0,0.05)]",
  danger:
    "border border-[rgba(0,0,0,0.12)] bg-surface text-[#C4271B] hover:bg-[#FFF5F5]",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { label, size = 34, variant = "secondary", className, style, type, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        aria-label={label}
        title={label}
        style={{ width: size, height: size, ...style }}
        className={cn(
          "inline-flex flex-none items-center justify-center rounded-[9px] transition disabled:cursor-not-allowed disabled:opacity-60",
          ICON_VARIANT[variant],
          className,
        )}
        {...props}
      />
    );
  },
);
