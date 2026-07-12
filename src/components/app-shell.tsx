"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Layers,
  Plug,
  Shirt,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Authenticated app frame: a persistent sidebar nav, an optional top-bar slot,
 * and a centered main container. Client component (reads the active route via
 * usePathname). The app layout renders this around each page.
 *
 *   <AppShell topBar={<PageActions />}>{children}</AppShell>
 */

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/catalog", label: "Catalog", icon: Shirt },
  { href: "/app/collections", label: "Collections", icon: Layers },
  { href: "/app/integrations", label: "Integrations", icon: Plug },
];

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface AppShellProps {
  children: React.ReactNode;
  /** Optional content rendered in the sticky top bar (title, actions, …). */
  topBar?: React.ReactNode;
  /** Brand wordmark shown at the top of the sidebar. */
  brandName?: string;
}

export function AppShell({
  children,
  topBar,
  brandName = "LabelOS",
}: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-line bg-surface md:w-60 md:border-b-0 md:border-r">
        <div className="px-6 py-5">
          <Link
            href="/app/dashboard"
            className="font-display text-xl tracking-tight text-ink"
          >
            {brandName}
          </Link>
        </div>
        <nav
          aria-label="Primary"
          className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:px-3 md:pb-4"
        >
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2.5 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent/10 text-accent"
                    : "text-muted hover:bg-ink/5 hover:text-ink",
                )}
              >
                <Icon aria-hidden className="size-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {topBar ? (
          <header className="sticky top-0 z-30 flex min-h-16 items-center gap-4 border-b border-line bg-paper/90 px-6 py-3 backdrop-blur">
            {topBar}
          </header>
        ) : null}
        <main className="flex-1">
          <div className="mx-auto w-full max-w-6xl px-6 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
