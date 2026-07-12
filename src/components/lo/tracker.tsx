"use client";

import type { ActionLink } from "./action";
import { Icon } from "./icon";
import { cn } from "@/lib/utils";

/**
 * The 6-step Collection Studio tracker: numbered circles joined by connecting
 * lines, the current step ringed in accent, done steps checked. Lives in a
 * white card. Each step can navigate (`href`) or run a handler; `onSelect` is a
 * catch-all fired for any step lacking its own `onClick`/`href`.
 */
export type StepState = "done" | "current" | "todo";

export interface StudioStep {
  id: number;
  name: string;
  state: StepState;
  href?: string;
  onClick?: () => void;
}

export interface StudioTrackerProps {
  steps: StudioStep[];
  onSelect?: (step: StudioStep) => void;
  className?: string;
}

const ACCENT = "#0A84FF";
const LINE = "#E5E5E7";

function StepNode({
  step,
  first,
  last,
  onSelect,
}: {
  step: StudioStep;
  first: boolean;
  last: boolean;
  onSelect?: (step: StudioStep) => void;
}) {
  const { state } = step;
  // Progress fill: the segment leading INTO a done/current node is filled; the
  // segment leading OUT is filled only once the node itself is done.
  const leftFill = state === "done" || state === "current" ? ACCENT : LINE;
  const rightFill = state === "done" ? ACCENT : LINE;

  const circle =
    state === "done"
      ? "border-transparent bg-accent text-white"
      : state === "current"
        ? "border-2 border-accent bg-surface text-accent shadow-[0_0_0_4px_rgba(10,132,255,0.16)]"
        : "border-transparent bg-[rgba(120,120,128,0.1)] text-muted";

  const nameCls =
    state === "current"
      ? "font-semibold text-ink"
      : state === "done"
        ? "text-ink2"
        : "text-muted";

  const interactive = Boolean(step.href || step.onClick || onSelect);
  const handleClick = step.onClick ?? (onSelect ? () => onSelect(step) : undefined);

  const inner = (
    <>
      <div className="flex w-full items-center">
        <div
          className="h-0.5 flex-1"
          style={{ background: first ? "transparent" : leftFill }}
        />
        <div
          className={cn(
            "flex size-[30px] flex-none items-center justify-center rounded-full text-[13px] font-semibold",
            circle,
          )}
        >
          {state === "done" ? (
            <Icon name="check" size={15} strokeWidth={2.6} />
          ) : (
            step.id
          )}
        </div>
        <div
          className="h-0.5 flex-1"
          style={{ background: last ? "transparent" : rightFill }}
        />
      </div>
      <div className={cn("text-center text-[12px] leading-tight", nameCls)}>
        {step.name}
      </div>
    </>
  );

  const shared = "flex flex-1 flex-col items-center gap-[9px]";

  if (step.href && interactive) {
    return (
      <a
        href={step.href}
        className={shared}
        aria-current={state === "current" ? "step" : undefined}
      >
        {inner}
      </a>
    );
  }
  if (interactive) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={cn(shared, "cursor-pointer")}
        aria-current={state === "current" ? "step" : undefined}
      >
        {inner}
      </button>
    );
  }
  return (
    <div className={shared} aria-current={state === "current" ? "step" : undefined}>
      {inner}
    </div>
  );
}

export function StudioTracker({ steps, onSelect, className }: StudioTrackerProps) {
  return (
    <div
      className={cn(
        "flex items-start lo-card px-[26px] py-5",
        className,
      )}
    >
      {steps.map((step, i) => (
        <StepNode
          key={step.id}
          step={step}
          first={i === 0}
          last={i === steps.length - 1}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sourcing sequence — the smaller 9-step sampling→production stepper.
// ---------------------------------------------------------------------------
export interface SourcingStep {
  name: string;
  state?: StepState;
  /** Mark inside the circle (defaults to a check when done, else its number). */
  mark?: string;
}

export interface SourcingSequenceProps {
  /** Step names or full step objects. */
  steps: Array<string | SourcingStep>;
  /** Index of the current step (used to derive states when not given). */
  current?: number;
  className?: string;
}

export function SourcingSequence({
  steps,
  current = 0,
  className,
}: SourcingSequenceProps) {
  const normalized: SourcingStep[] = steps.map((s, i) => {
    const base: SourcingStep = typeof s === "string" ? { name: s } : { ...s };
    if (!base.state) {
      base.state = i < current ? "done" : i === current ? "current" : "todo";
    }
    return base;
  });

  return (
    <div className={cn("flex items-start overflow-x-auto pb-1", className)}>
      {normalized.map((step, i) => {
        const first = i === 0;
        const last = i === normalized.length - 1;
        const leftFill =
          step.state === "done" || step.state === "current" ? ACCENT : LINE;
        const rightFill = step.state === "done" ? ACCENT : LINE;
        const dot =
          step.state === "done"
            ? "border-transparent bg-accent text-white"
            : step.state === "current"
              ? "border-2 border-accent bg-surface text-accent"
              : "border-transparent bg-[rgba(120,120,128,0.1)] text-muted";
        const nameCls =
          step.state === "current"
            ? "font-semibold text-ink"
            : step.state === "done"
              ? "text-ink2"
              : "text-muted";
        return (
          <div
            key={`${step.name}-${i}`}
            className="flex min-w-[88px] flex-1 flex-col items-center gap-[7px]"
          >
            <div className="flex w-full items-center">
              <div
                className="h-0.5 flex-1"
                style={{ background: first ? "transparent" : leftFill }}
              />
              <div
                className={cn(
                  "flex size-6 flex-none items-center justify-center rounded-full text-[11px] font-bold",
                  dot,
                )}
              >
                {step.mark ??
                  (step.state === "done" ? (
                    <Icon name="check" size={12} strokeWidth={2.8} />
                  ) : (
                    i + 1
                  ))}
              </div>
              <div
                className="h-0.5 flex-1"
                style={{ background: last ? "transparent" : rightFill }}
              />
            </div>
            <div className={cn("text-center text-[10.5px] leading-tight", nameCls)}>
              {step.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Studio footer — sticky bottom bar: Back / stage label / Save draft / Continue.
// ---------------------------------------------------------------------------
export interface StudioFooterProps {
  currentId: number;
  total?: number;
  /** Stage name shown in the centre, e.g. "Trend Direction". */
  stageLabel: string;
  back?: ActionLink;
  next?: ActionLink;
  onSave?: () => void;
  saveLabel?: string;
  className?: string;
}

function Control({
  action,
  className,
  children,
}: {
  action: ActionLink;
  className: string;
  children: React.ReactNode;
}) {
  if (action.href && !action.disabled) {
    return (
      <a href={action.href} className={className}>
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      className={cn(className, "disabled:cursor-not-allowed disabled:opacity-50")}
    >
      {children}
    </button>
  );
}

export function StudioFooter({
  currentId,
  total = 6,
  stageLabel,
  back,
  next,
  onSave,
  saveLabel = "Save draft",
  className,
}: StudioFooterProps) {
  const secondary =
    "inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-[rgba(0,0,0,0.12)] bg-surface px-[15px] text-[13px] font-semibold text-ink transition hover:bg-[#FAFAFA]";
  const primary =
    "inline-flex h-9 items-center gap-1.5 rounded-[9px] bg-accent px-4 text-[13.5px] font-semibold text-white transition hover:brightness-[0.96]";

  return (
    <div
      className={cn(
        "sticky bottom-0 z-[6] flex items-center gap-3 border-t border-[rgba(0,0,0,0.08)] bg-[rgba(255,255,255,0.86)] px-[30px] py-[13px] backdrop-blur-xl backdrop-saturate-[1.8]",
        className,
      )}
    >
      {back ? (
        <Control action={back} className={cn(secondary, "pl-3")}>
          <Icon name="chevron-left" size={15} strokeWidth={2} />
          {back.label}
        </Control>
      ) : (
        <span className={cn(secondary, "pointer-events-none opacity-40")}>
          <Icon name="chevron-left" size={15} strokeWidth={2} />
          Back
        </span>
      )}

      <div className="flex-1 text-center text-[12.5px] text-muted">
        Stage {currentId} of {total} · {stageLabel}
      </div>

      {onSave ? (
        <button type="button" onClick={onSave} className={secondary}>
          {saveLabel}
        </button>
      ) : null}

      {next ? (
        <Control action={next} className={primary}>
          {next.label}
          <Icon name="arrow-right" size={15} strokeWidth={2} />
        </Control>
      ) : null}
    </div>
  );
}
