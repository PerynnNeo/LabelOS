"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/lo";
import { LogoutButton } from "@/app/app/_components/logout-button";
import { cn } from "@/lib/utils";

/**
 * LabelOS application shell — the fixed 236px left rail + scrollable main, ported
 * from the design mockup (design-reference/LabelOS.dc.html). The kit does not ship
 * an AppShell, so the sidebar lives here and the server layout renders it around
 * every /app page.
 *
 * Client component: it reads the active route with usePathname for nav highlight.
 * Server-derived values (brand name, active collection id, badge counts, demo
 * flag) arrive as serialisable props from the layout — no functions cross the
 * boundary.
 */

interface NavDef {
  key: string;
  label: string;
  icon: IconName;
  href: string;
  /** Path prefixes that mark this item active. Empty = never independently active. */
  match: string[];
  badge?: number;
  badgeColor?: string;
}

export interface AppShellProps {
  brandName: string;
  /** Sidebar subtitle under the brand chip, e.g. "Singapore · SGD". */
  subtitle: string;
  /** Most-recent / active collection id, used to scope studio nav links. */
  activeCollectionId: string | null;
  demoMode: boolean;
  /** Count shown on the Dashboard nav item (decisions awaiting approval). */
  pendingCount: number;
  /** Count shown on the Catalog nav item (products needing attention). */
  needsAttentionCount: number;
  children: React.ReactNode;
}

function isActive(pathname: string, match: string[]): boolean {
  return match.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
}

export function AppShell({
  brandName,
  subtitle,
  activeCollectionId,
  demoMode,
  pendingCount,
  needsAttentionCount,
  children,
}: AppShellProps) {
  const pathname = usePathname() ?? "";
  const initial = (brandName.trim()[0] ?? "L").toUpperCase();

  // Studio stages (Collections + the three stage screens) are scoped to the
  // active collection; without one they fall back to the collections index.
  const studioHref = activeCollectionId
    ? `/app/collections/${activeCollectionId}`
    : "/app/collections";

  const workspace: NavDef[] = [
    {
      key: "dashboard",
      label: "Dashboard",
      icon: "dashboard",
      href: "/app/dashboard",
      match: ["/app/dashboard"],
      badge: pendingCount,
      badgeColor: "#FF9500",
    },
    {
      key: "catalog",
      label: "Catalog",
      icon: "tag",
      href: "/app/catalog",
      match: ["/app/catalog"],
      badge: needsAttentionCount,
      badgeColor: "#FF3B30",
    },
    {
      key: "collections",
      label: "Collections",
      icon: "layers",
      href: studioHref,
      match: ["/app/collections", "/app/designs"],
    },
    {
      key: "productdev",
      label: "Product Development",
      icon: "ruler",
      href: studioHref,
      match: [],
    },
    {
      key: "sourcing",
      label: "Production & Sourcing",
      icon: "package",
      href: studioHref,
      match: [],
    },
    {
      key: "publish",
      label: "Store & Publish",
      icon: "cart",
      href: studioHref,
      match: [],
    },
  ];

  const system: NavDef[] = [
    {
      key: "brand",
      label: "Brand Profile",
      icon: "user",
      href: "/app/brand",
      match: ["/app/brand"],
    },
    {
      key: "integrations",
      label: "Integrations",
      icon: "plug",
      href: "/app/integrations",
      match: ["/app/integrations"],
    },
    {
      key: "activity",
      label: "Activity Log",
      icon: "activity",
      href: "/app/activity",
      match: ["/app/activity"],
    },
  ];

  return (
    <div className="flex h-dvh">
      <aside className="flex w-[236px] flex-none flex-col overflow-y-auto border-r border-line bg-sidebar px-3 py-3.5">
        <Link
          href="/app/dashboard"
          className="flex items-center gap-[11px] rounded-[9px] px-2 pt-1.5 pb-4"
        >
          <div className="flex size-8 flex-none items-center justify-center rounded-[9px] bg-accent text-[15px] font-extrabold text-white shadow-[0_3px_8px_-1px_rgba(10,132,255,0.5)]">
            {initial}
          </div>
          <div className="min-w-0 leading-[1.15]">
            <div className="truncate text-[14.5px] font-bold tracking-[-0.01em] text-ink">
              {brandName}
            </div>
            <div className="truncate text-[11.5px] text-muted">{subtitle}</div>
          </div>
        </Link>

        <NavSection label="Workspace" items={workspace} pathname={pathname} />
        <NavSection
          label="System"
          items={system}
          pathname={pathname}
          className="pt-4"
        />

        <div className="mt-auto pt-4">
          {demoMode ? (
            <div className="mx-0.5 mb-2 flex items-center gap-2 rounded-[9px] bg-[rgba(255,149,0,0.12)] px-[11px] py-2 text-[11.5px] font-semibold text-[#9A6200]">
              <span className="size-[7px] flex-none rounded-full bg-[#FF9500] animate-[lo-pulse_1.8s_ease-in-out_infinite]" />
              Demo mode · mock data
            </div>
          ) : null}

          <Link
            href="/app/brand"
            className="flex items-center gap-2.5 rounded-[9px] px-2 py-[7px] transition hover:bg-[rgba(0,0,0,0.04)]"
          >
            <div className="flex size-[30px] flex-none items-center justify-center rounded-full bg-[#C9C3B8] text-white">
              <Icon name="user" size={16} />
            </div>
            <div className="min-w-0 flex-1 leading-[1.2]">
              <div className="text-[13px] font-semibold text-ink">Owner</div>
              <div className="text-[11px] text-muted">Single seat</div>
            </div>
            <Icon
              name="chevron-right"
              size={16}
              strokeWidth={2}
              className="flex-none text-[#C7C7CC]"
            />
          </Link>

          <div className="mt-1 px-2">
            <LogoutButton />
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-canvas">
        {children}
      </main>
    </div>
  );
}

function NavSection({
  label,
  items,
  pathname,
  className,
}: {
  label: string;
  items: NavDef[];
  pathname: string;
  className?: string;
}) {
  return (
    <>
      <div
        className={cn(
          "px-2.5 pb-1.5 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted",
          className,
        )}
      >
        {label}
      </div>
      {items.map((item) => {
        const active = isActive(pathname, item.match);
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "mb-0.5 flex items-center gap-[11px] rounded-[8px] px-2.5 py-2 text-[14px] font-medium transition",
              active
                ? "bg-accent text-white"
                : "text-[rgba(60,60,67,0.9)] hover:bg-[rgba(0,0,0,0.05)]",
            )}
          >
            <Icon name={item.icon} size={19} className="flex-none" />
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge && item.badge > 0 ? (
              <span
                className="inline-flex h-[18px] min-w-[18px] flex-none items-center justify-center rounded-[9px] px-[5px] text-[10.5px] font-bold text-white"
                style={{ background: item.badgeColor }}
              >
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </>
  );
}
