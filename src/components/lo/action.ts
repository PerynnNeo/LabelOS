/**
 * Shared shape for a call-to-action that may either navigate (`href`) or run a
 * handler (`onClick`). Used by NextAction, StudioFooter and the tracker so a
 * screen can wire a step to a route or a client callback interchangeably.
 */
export interface ActionLink {
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
}
