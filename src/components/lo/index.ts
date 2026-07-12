/**
 * LabelOS shared iOS component kit. Screens import from "@/components/lo".
 * Design tokens and status Tone maps live in "@/lib/ui/tokens"; helpers
 * (cn, money, pct, formatDate, formatRelative) live in "@/lib/utils".
 */

export type { ActionLink } from "./action";

export { Icon, AgentAvatar } from "./icon";
export type { IconName, IconProps, AgentAvatarProps } from "./icon";

export { Pill, Chip } from "./pill";
export type { PillProps, ChipProps } from "./pill";

export { Button, IconButton } from "./button";
export type {
  ButtonProps,
  ButtonVariant,
  ButtonSize,
  IconButtonProps,
} from "./button";

export { Card, CardHeader, CardTitle, CardRow } from "./card";
export type { CardProps, CardRowProps } from "./card";

export { PageHeader } from "./page-header";
export type { PageHeaderProps } from "./page-header";

export { NextAction } from "./next-action";
export type { NextActionProps } from "./next-action";

export { StudioTracker, SourcingSequence, StudioFooter } from "./tracker";
export type {
  StepState,
  StudioStep,
  StudioTrackerProps,
  SourcingStep,
  SourcingSequenceProps,
  StudioFooterProps,
} from "./tracker";

export { Swatch } from "./swatch";
export type { SwatchProps, SwatchAspect } from "./swatch";

export { StatCell } from "./stat-cell";
export type { StatCellProps } from "./stat-cell";

export { ProductCard } from "./product-card";
export type { ProductCardProps, ProductSummary } from "./product-card";

export { OutfitCard } from "./outfit-card";
export type {
  OutfitCardProps,
  OutfitSummary,
  OutfitItemSummary,
  OutfitCardActions,
} from "./outfit-card";

export { ConfirmModal, Drawer } from "./modal";
export type {
  ConfirmModalProps,
  DrawerProps,
  ModalTone,
} from "./modal";

export { Toggle } from "./toggle";
export type { ToggleProps } from "./toggle";

export { ScoreBar, ScoreBreakdown } from "./score-bar";
export type { ScoreBarProps, ScoreBreakdownProps } from "./score-bar";

export { EmptyState, SetupCard } from "./empty-state";
export type { EmptyStateProps, SetupCardProps } from "./empty-state";

export { AgentTrace } from "./agent-trace";
export type { AgentTraceEntry, AgentTraceProps } from "./agent-trace";
