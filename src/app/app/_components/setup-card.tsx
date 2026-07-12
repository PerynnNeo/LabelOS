import Link from "next/link";
import { DatabaseZap } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

/**
 * Friendly zero-config state shown when Supabase is not configured or the
 * migration has not been run. Never a crash — the whole app stays browsable in
 * this state so the owner can wire credentials from the Integrations screen.
 */
export function SetupCard({
  title = "Connect Supabase to continue",
  description = "This screen reads from your database. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, run the migration, then reload.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <EmptyState
      icon={DatabaseZap}
      title={title}
      description={description}
      action={
        <Link href="/app/integrations">
          <Button variant="secondary" size="sm">
            Open Integrations
          </Button>
        </Link>
      }
    />
  );
}
