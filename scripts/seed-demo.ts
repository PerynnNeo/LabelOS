/**
 * LabelOS demo seeder — run with `npm run seed` (tsx).
 *
 * Loads .env.local and .env (tiny hand-rolled parser, no extra dependency),
 * then runs the shared idempotent `runSeed()` used by the API route too.
 *
 * Note on `server-only`: the seed pipeline imports server modules guarded by
 * the `server-only` marker package. Next.js activates that package's
 * `react-server` export condition so the marker is a no-op in the app runtime,
 * but a plain `tsx` process does not — its default export throws on import.
 * We neutralise it in the module cache before dynamically importing the
 * pipeline (a static import would be hoisted above this guard).
 *
 * Exit code: 0 on success; 1 if Supabase is unconfigured, the migration has
 * not been run, or seeding otherwise fails.
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Minimal .env parser: KEY=VALUE lines, "#" comments, optional `export `
// prefix, optional single/double quotes. Existing process.env keys win, so
// load .env.local first (it takes precedence) and let .env fill any gaps.
// ---------------------------------------------------------------------------
function loadDotEnvFile(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const unprefixed = line.startsWith("export ") ? line.slice(7) : line;
    const eq = unprefixed.indexOf("=");
    if (eq <= 0) continue;
    const key = unprefixed.slice(0, eq).trim();
    let value = unprefixed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    if (key.length > 0 && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  return true;
}

/** Replace the throwing `server-only` marker with an empty module. */
function neutralizeServerOnly(): void {
  try {
    const req = createRequire(import.meta.url);
    const soPath = req.resolve("server-only");
    (req.cache as Record<string, unknown>)[soPath] = {
      id: soPath,
      filename: soPath,
      loaded: true,
      exports: {},
    };
  } catch {
    // `server-only` not resolvable as a standalone module — nothing to do.
  }
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  const loadedLocal = loadDotEnvFile(resolve(cwd, ".env.local"));
  const loadedEnv = loadDotEnvFile(resolve(cwd, ".env"));

  console.log("LabelOS demo seeder");
  const sources = [
    loadedLocal ? ".env.local" : null,
    loadedEnv ? ".env" : null,
  ].filter(Boolean);
  console.log(
    sources.length > 0
      ? `  Loaded environment from ${sources.join(" and ")}`
      : "  No .env.local or .env found — using process environment only.",
  );

  neutralizeServerOnly();

  const { getEnv, isSupabaseConfigured } = await import("../src/lib/env");
  const env = getEnv();

  if (!isSupabaseConfigured(env)) {
    console.error(
      "\nSupabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "SUPABASE_SERVICE_ROLE_KEY in .env.local, then run the migration in " +
        "supabase/migrations/001_initial.sql before seeding.",
    );
    process.exit(1);
  }

  if (!env.DEMO_MODE) {
    console.log(
      "  Note: DEMO_MODE is off. The CLI seeds anyway; the /api/seed route stays gated on DEMO_MODE.",
    );
  }

  const { runSeed } = await import("../src/lib/seed/run-seed");

  try {
    console.log("  Seeding…\n");
    const result = await runSeed();
    console.log("Seed complete:");
    console.log(`  products inserted:        ${result.productsInserted}`);
    console.log(`  products skipped:         ${result.productsSkipped}`);
    console.log(`  suppliers inserted:       ${result.suppliersInserted}`);
    console.log(
      `  collection:               ${result.collectionInserted ? "created" : "already present"}`,
    );
    console.log(
      `  brand settings:           ${result.settingsUpserted ? "upserted" : "unchanged"}`,
    );
    process.exit(0);
  } catch (error) {
    console.error(
      "\nSeeding failed:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(
    "Unexpected seeder error:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
