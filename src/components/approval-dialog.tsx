"use client";

import { useEffect, useId, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JsonPreview } from "@/components/json-preview";

/**
 * Human-approval confirmation dialog for expensive or public actions
 * (create Shopify draft, publish, approve design, …).
 *
 * When `requireTypedWord` is set, the confirm button stays disabled until the
 * user types that exact word (e.g. "PUBLISH"). `onConfirm` is awaited: while it
 * runs the dialog shows a loading state, and a rejection surfaces its message
 * inline instead of closing.
 */

export interface ApprovalDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Rendered as a JSON payload preview (e.g. the exact Shopify fields). */
  payloadPreview?: unknown;
  /** Exact word the user must type to enable confirmation, e.g. "PUBLISH". */
  requireTypedWord?: string;
  confirmLabel?: string;
  confirmVariant?: ButtonVariant;
  onConfirm: () => Promise<void>;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong. Please try again.";
}

export function ApprovalDialog({
  open,
  onClose,
  title,
  description,
  payloadPreview,
  requireTypedWord,
  confirmLabel = "Confirm",
  confirmVariant = "primary",
  onConfirm,
}: ApprovalDialogProps) {
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  // Reset transient state whenever the dialog is (re)opened or closed.
  useEffect(() => {
    if (!open) return;
    setTyped("");
    setError(null);
    setLoading(false);
  }, [open]);

  const wordSatisfied = !requireTypedWord || typed === requireTypedWord;
  const canConfirm = wordSatisfied && !loading;

  async function handleConfirm() {
    if (!canConfirm) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  function handleClose() {
    if (loading) return;
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={confirmVariant}
            onClick={handleConfirm}
            loading={loading}
            disabled={!canConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {payloadPreview !== undefined ? (
          <JsonPreview data={payloadPreview} label="Payload preview" />
        ) : null}

        {requireTypedWord ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={inputId}>
              Type <span className="font-mono text-ink">{requireTypedWord}</span>{" "}
              to confirm
            </Label>
            <Input
              id={inputId}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              disabled={loading}
              autoComplete="off"
              spellCheck={false}
              aria-describedby={error ? `${inputId}-error` : undefined}
            />
          </div>
        ) : null}

        {error ? (
          <div
            id={`${inputId}-error`}
            role="alert"
            className="flex items-start gap-2 border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
