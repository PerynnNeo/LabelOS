"use client";

import { cn } from "@/lib/utils";

/**
 * iOS switch (51×31): green track when on, grey when off, a sliding white knob.
 * Rendered as a real `role="switch"` button so it is keyboard- and
 * screen-reader-accessible. Pass `label` for the accessible name when there is
 * no adjacent visible label.
 */
export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
  className?: string;
}

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
  id,
  className,
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex flex-none items-center rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      style={{
        width: 51,
        height: 31,
        background: checked ? "#34C759" : "rgba(120,120,128,0.16)",
      }}
    >
      <span
        aria-hidden
        className="absolute top-[2px] rounded-full bg-white shadow-[0_2px_5px_rgba(0,0,0,0.25)] transition-[left] duration-200"
        style={{ width: 27, height: 27, left: checked ? 22 : 2 }}
      />
    </button>
  );
}
