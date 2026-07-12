"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Accessible modal dialog with no external dependencies.
 *
 * Behaviour:
 * - Escape closes it.
 * - Clicking the backdrop closes it.
 * - Focus moves into the dialog on open and is restored to the trigger on
 *   close; Tab is trapped within the dialog.
 * - Body scroll is locked while open.
 *
 * Rendered through a portal on <body>. It only mounts its content while
 * `open` is true.
 */

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  /** Optional footer row (e.g. action buttons). */
  footer?: React.ReactNode;
  /** Hide the default close (X) button. */
  hideCloseButton?: boolean;
  /** Extra classes for the dialog panel. */
  className?: string;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  hideCloseButton = false,
  className,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Focus management + Escape + Tab trap while open. Depends only on `open`
  // (onClose is read through a ref) so a new handler identity each render
  // does not re-run this effect and steal focus.
  useEffect(() => {
    if (!open || !mounted) return;

    previouslyFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    // Move focus into the dialog after it renders.
    const panel = panelRef.current;
    const focusFirst = () => {
      if (!panel) return;
      const focusable = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (focusable ?? panel).focus();
    };
    focusFirst();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, mounted]);

  const onBackdropMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // Only close when the press starts on the backdrop itself.
      if (event.target === event.currentTarget) onClose();
    },
    [onClose],
  );

  if (!mounted || !open) return null;

  return createPortal(
    <div
      onMouseDown={onBackdropMouseDown}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/40 p-4"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          "relative my-8 w-full max-w-lg border border-line bg-surface shadow-xl outline-none",
          className,
        )}
      >
        {(title || !hideCloseButton) && (
          <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div className="flex flex-col gap-1">
              {title ? (
                <h2
                  id={titleId}
                  className="font-display text-lg leading-tight tracking-tight text-ink"
                >
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p
                  id={descriptionId}
                  className="text-sm leading-relaxed text-muted"
                >
                  {description}
                </p>
              ) : null}
            </div>
            {!hideCloseButton ? (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="-mr-1 -mt-0.5 inline-flex size-8 shrink-0 items-center justify-center text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <X aria-hidden className="size-4" />
              </button>
            ) : null}
          </div>
        )}

        <div className="px-6 py-5">{children}</div>

        {footer ? (
          <div className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
