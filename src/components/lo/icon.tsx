"use client";

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Image as ImageIcon,
  Info,
  Layers,
  LayoutGrid,
  Package,
  Plug,
  Plus,
  RefreshCw,
  Ruler,
  Send,
  ShoppingBag,
  Tag,
  Trash2,
  User,
  X,
} from "lucide-react";
import { agentColor, initials } from "@/lib/ui/tokens";
import { cn } from "@/lib/utils";

/**
 * Small typed wrapper over lucide-react. Screens reference icons by a stable
 * semantic name (`<Icon name="arrow-right" />`) instead of importing lucide
 * directly, so the icon vocabulary the mockup uses lives in one place.
 */
const ICONS = {
  dashboard: LayoutGrid,
  grid: LayoutGrid,
  tag: Tag,
  layers: Layers,
  ruler: Ruler,
  tool: Ruler,
  box: Package,
  package: Package,
  cart: ShoppingBag,
  "shopping-bag": ShoppingBag,
  user: User,
  plug: Plug,
  activity: Activity,
  "arrow-right": ArrowRight,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  check: Check,
  x: X,
  close: X,
  "alert-triangle": AlertTriangle,
  info: Info,
  eye: Eye,
  "refresh-cw": RefreshCw,
  refresh: RefreshCw,
  send: Send,
  plus: Plus,
  image: ImageIcon,
  trash: Trash2,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  /** Pixel size (width & height). Defaults to 18. */
  size?: number;
  strokeWidth?: number;
  className?: string;
  /**
   * Accessible label. When provided the SVG is exposed to assistive tech;
   * otherwise it is hidden (decorative, the default for icons beside text).
   */
  label?: string;
}

export function Icon({
  name,
  size = 18,
  strokeWidth = 1.9,
  className,
  label,
}: IconProps) {
  const Glyph = ICONS[name];
  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}

export interface AgentAvatarProps {
  /** Agent (or actor) name — drives colour and initials. */
  actor: string;
  /** Square pixel size. Defaults to 34 (activity-log size). */
  size?: number;
  className?: string;
}

/**
 * Coloured initials chip for an agent/actor, matching the mockup's activity
 * rows and analysis panels. Decorative: the actor name is always shown in text
 * next to it, so this is aria-hidden.
 */
export function AgentAvatar({ actor, size = 34, className }: AgentAvatarProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex flex-none items-center justify-center font-extrabold text-white",
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.29),
        fontSize: Math.max(10, Math.round(size * 0.34)),
        background: agentColor(actor),
      }}
    >
      {initials(actor)}
    </div>
  );
}
