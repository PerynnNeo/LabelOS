import "server-only";
import { SupabaseNotConfiguredError } from "@/lib/supabase/admin";
import { isMissingMigrationError } from "@/lib/supabase/repositories";

/**
 * Server-only helpers shared by the private app's Server Components.
 *
 * The MVP must never crash when Supabase is unconfigured or the migration has
 * not been run — pages catch these with {@link isSetupError} and render a
 * friendly setup card instead.
 */

/** True when the error means "Supabase is not set up yet" (never a real bug). */
export function isSetupError(error: unknown): boolean {
  return (
    error instanceof SupabaseNotConfiguredError ||
    isMissingMigrationError(error)
  );
}
