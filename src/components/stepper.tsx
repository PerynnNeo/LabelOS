"use client";

import { useCallback, useRef } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Horizontal five-stage stepper for the Collection Studio
 * (Brief → Trends → Outfits → Product & Production → Publish).
 *
 * Purely presentational: the caller supplies each step's `state`. When
 * `onSelect` is provided the steps become buttons with roving-tabindex
 * keyboard navigation (Arrow keys / Home / End move focus; Enter or Space
 * selects). Without `onSelect` the steps render as static markers.
 */

export type StepState = "done" | "active" | "todo" | "blocked";

export interface StepperStep {
  key: string;
  label: string;
  state: StepState;
}

export interface StepperProps {
  steps: StepperStep[];
  /** Called with the step key when a step is activated (click / Enter). */
  onSelect?: (key: string) => void;
  className?: string;
}

const CIRCLE_STYLES: Record<StepState, string> = {
  done: "border-accent bg-accent text-paper",
  active: "border-accent bg-accent/10 text-accent",
  todo: "border-line bg-surface text-muted",
  blocked: "border-danger bg-danger/10 text-danger",
};

const LABEL_STYLES: Record<StepState, string> = {
  done: "text-ink",
  active: "text-ink font-medium",
  todo: "text-muted",
  blocked: "text-danger font-medium",
};

export function Stepper({ steps, onSelect, className }: StepperProps) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusStep = useCallback((index: number) => {
    const clamped = (index + steps.length) % steps.length;
    buttonRefs.current[clamped]?.focus();
  }, [steps.length]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          event.preventDefault();
          focusStep(index + 1);
          break;
        case "ArrowLeft":
        case "ArrowUp":
          event.preventDefault();
          focusStep(index - 1);
          break;
        case "Home":
          event.preventDefault();
          focusStep(0);
          break;
        case "End":
          event.preventDefault();
          focusStep(steps.length - 1);
          break;
        default:
          break;
      }
    },
    [focusStep, steps.length],
  );

  // Roving tabindex baseline: the active step (or the first) is tabbable.
  const activeIndex = Math.max(
    0,
    steps.findIndex((s) => s.state === "active"),
  );

  return (
    <ol className={cn("flex items-center overflow-x-auto", className)}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const marker =
          step.state === "done" ? (
            <Check aria-hidden className="size-4" />
          ) : step.state === "blocked" ? (
            <TriangleAlert aria-hidden className="size-4" />
          ) : (
            <span className="text-sm font-medium">{index + 1}</span>
          );

        const inner = (
          <span className="inline-flex items-center gap-2.5">
            <span
              className={cn(
                "inline-flex size-8 shrink-0 items-center justify-center rounded-full border",
                CIRCLE_STYLES[step.state],
              )}
            >
              {marker}
            </span>
            <span
              className={cn(
                "whitespace-nowrap text-sm",
                LABEL_STYLES[step.state],
              )}
            >
              {step.label}
            </span>
          </span>
        );

        return (
          <li
            key={step.key}
            className={cn("flex items-center", !isLast && "flex-1")}
          >
            {onSelect ? (
              <button
                ref={(el) => {
                  buttonRefs.current[index] = el;
                }}
                type="button"
                onClick={() => onSelect(step.key)}
                onKeyDown={(event) => onKeyDown(event, index)}
                tabIndex={index === activeIndex ? 0 : -1}
                aria-current={step.state === "active" ? "step" : undefined}
                className="inline-flex items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {inner}
              </button>
            ) : (
              <span aria-current={step.state === "active" ? "step" : undefined}>
                {inner}
              </span>
            )}
            {!isLast ? (
              <span
                aria-hidden
                className={cn(
                  "mx-3 h-px flex-1",
                  step.state === "done" ? "bg-accent" : "bg-line",
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
