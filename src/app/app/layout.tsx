import { AppShell } from "@/components/app-shell";
import { getAppSettings } from "@/lib/supabase/repositories";
import { isSetupError } from "@/app/app/_lib/server";
import { LogoutButton } from "@/app/app/_components/logout-button";

/**
 * Authenticated app frame. The proxy already gates /app/* on a valid session;
 * this layout adds the persistent sidebar (via AppShell), the brand wordmark
 * (from app_settings when available), and a logout control. Reading the brand
 * name must never crash the shell, so a setup/DB error falls back to "LabelOS".
 */
export const dynamic = "force-dynamic";

async function resolveBrandName(): Promise<string> {
  try {
    const settings = await getAppSettings();
    return settings?.brand_name?.trim() || "LabelOS";
  } catch (error) {
    if (isSetupError(error)) return "LabelOS";
    // Any other read failure still shouldn't take down the whole app shell.
    return "LabelOS";
  }
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const brandName = await resolveBrandName();

  return (
    <AppShell
      brandName={brandName}
      topBar={
        <div className="flex w-full items-center justify-between gap-4">
          <span className="eyebrow">The studio</span>
          <LogoutButton />
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
