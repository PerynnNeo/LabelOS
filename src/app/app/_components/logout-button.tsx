"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { apiRequest, errorMessage } from "@/app/app/_lib/api-client";

/**
 * Sidebar/top-bar logout control. Clears the session cookie via
 * POST /api/auth/logout, then navigates to /login with a full reload so the
 * proxy immediately re-evaluates the (now absent) session.
 */
export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    if (loading) return;
    setLoading(true);
    try {
      await apiRequest<{ ok: true }>("/api/auth/logout", { method: "POST" });
      // Full navigation so the proxy sees the cleared cookie.
      window.location.assign("/login");
    } catch (error) {
      toast.error(errorMessage(error));
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className={cn(
        "inline-flex items-center gap-2 whitespace-nowrap text-sm font-medium text-muted transition-colors hover:text-ink disabled:opacity-50",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        className,
      )}
    >
      <LogOut aria-hidden className="size-4 shrink-0" />
      {loading ? "Signing out…" : "Log out"}
    </button>
  );
}
