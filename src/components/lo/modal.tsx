"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, IconButton } from "./button";
import { Icon, type IconName } from "./icon";
import { cn } from "@/lib/utils";

/** SSR-safe portal to document.body (renders nothing until mounted). */
function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

/** Fire `onClose` on Escape while `open`. */
function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);
}

// ---------------------------------------------------------------------------
// ConfirmModal — centered confirmation card (publish, simulate sample, …).
// ---------------------------------------------------------------------------
export type ModalTone = "default" | "success" | "warning";

const TONE_STYLE: Record<
  ModalTone,
  { iconBg: string; iconFg: string; icon: IconName; confirm: "primary" | "success" }
> = {
  default: {
    iconBg: "rgba(10,132,255,0.14)",
    iconFg: "#0863C4",
    icon: "info",
    confirm: "primary",
  },
  success: {
    iconBg: "rgba(52,199,89,0.14)",
    iconFg: "#248A3D",
    icon: "check",
    confirm: "success",
  },
  warning: {
    iconBg: "rgba(255,149,0,0.14)",
    iconFg: "#B25000",
    icon: "alert-triangle",
    confirm: "primary",
  },
};

export interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  body?: React.ReactNode;
  tone?: ModalTone;
  /** Override the header icon. */
  icon?: IconName;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  loading?: boolean;
  /** Top-of-card content (e.g. a MOCK MODE pill) above the title. */
  header?: React.ReactNode;
}

export function ConfirmModal({
  open,
  onClose,
  title,
  body,
  tone = "default",
  icon,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  loading,
  header,
}: ConfirmModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEscape(open, onClose);
  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  if (!open) return null;
  const t = TONE_STYLE[tone];

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[60] animate-[lo-fade_0.18s_ease] bg-black/[0.34]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed left-1/2 top-1/2 z-[61] w-[460px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 animate-[lo-toast_0.24s_ease] rounded-[18px] bg-surface p-[26px] shadow-modal"
      >
        {header ? <div className="mb-3.5">{header}</div> : null}
        <div
          className="mb-3.5 flex size-12 items-center justify-center rounded-[13px]"
          style={{ background: t.iconBg, color: t.iconFg }}
        >
          <Icon name={icon ?? t.icon} size={26} />
        </div>
        <div className="text-[19px] font-bold tracking-[-0.01em] text-ink">
          {title}
        </div>
        {body ? (
          <div className="mt-2 text-[13.5px] leading-relaxed text-ink2">
            {body}
          </div>
        ) : null}
        <div className="mt-[22px] flex gap-2.5">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={t.confirm}
            className="flex-1"
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Portal>
  );
}

// ---------------------------------------------------------------------------
// Drawer — right-side sliding panel (product detail, etc.).
// ---------------------------------------------------------------------------
export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Content between the title and the close button (e.g. a status pill). */
  headerRight?: React.ReactNode;
  /** Sticky footer actions (white bar, top border). */
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** Panel width in px (default 466). */
  width?: number;
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  headerRight,
  footer,
  children,
  width = 466,
}: DrawerProps) {
  useEscape(open, onClose);
  if (!open) return null;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[50] animate-[lo-fade_0.18s_ease] bg-black/[0.28]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-y-0 right-0 z-[51] flex max-w-full animate-[lo-slide_0.22s_ease] flex-col bg-canvas shadow-drawer"
        style={{ width }}
      >
        <div className="flex items-center gap-3 border-b border-[rgba(0,0,0,0.07)] bg-surface px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[16px] font-bold tracking-[-0.01em] text-ink">
              {title}
            </div>
            {subtitle ? (
              <div className="truncate text-[12px] text-muted">{subtitle}</div>
            ) : null}
          </div>
          {headerRight}
          <IconButton label="Close" size={32} onClick={onClose}>
            <Icon name="x" size={16} strokeWidth={2} />
          </IconButton>
        </div>

        <div className="flex-1 overflow-auto px-5 py-[18px]">{children}</div>

        {footer ? (
          <div className="flex gap-2.5 border-t border-[rgba(0,0,0,0.07)] bg-surface px-5 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </Portal>
  );
}
