/**
 * LabelOS environment verifier — run with `npm run verify:env` (tsx).
 *
 * Loads .env.local (tiny hand-rolled parser, no extra dependency), validates
 * the environment with the shared Zod schema, and prints a status table.
 * Secret VALUES are never printed — only configured / missing status.
 *
 * Exit code:
 *   0 — auth is configured (APP_ACCESS_CODE >= 8 chars, SESSION_SECRET >= 32).
 *   1 — APP_ACCESS_CODE or SESSION_SECRET missing/too short, or the
 *       environment fails schema validation entirely.
 * Missing OPTIONAL providers (Anthropic / Supabase / Shopify) never fail the
 * script — the app is designed to run in demo/mock mode without them.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseEnv,
  isAnthropicConfigured,
  isAuthConfigured,
  isShopifyLive,
  isSupabaseConfigured,
  type Env,
} from "../src/lib/env";

// ---------------------------------------------------------------------------
// Minimal .env parser: KEY=VALUE lines, "#" comments, optional `export `
// prefix, optional single/double quotes. Existing process.env keys win.
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

interface Row {
  name: string;
  status: "configured" | "missing" | "off" | "on";
  note: string;
}

function printTable(rows: Row[]): void {
  const nameWidth = Math.max(...rows.map((r) => r.name.length), 4);
  const statusWidth = Math.max(...rows.map((r) => r.status.length), 6);
  const line = (a: string, b: string, c: string) =>
    `  ${a.padEnd(nameWidth)}  ${b.padEnd(statusWidth)}  ${c}`;
  console.log(line("Item", "Status", "Note"));
  console.log(line("-".repeat(nameWidth), "-".repeat(statusWidth), "----"));
  for (const row of rows) {
    console.log(line(row.name, row.status, row.note));
  }
}

function main(): void {
  const envLocalPath = resolve(process.cwd(), ".env.local");
  const loaded = loadDotEnvFile(envLocalPath);

  console.log("LabelOS environment check");
  console.log(
    loaded
      ? `  Loaded .env.local from ${envLocalPath}`
      : "  No .env.local found — using process environment only.",
  );
  console.log("");

  let env: Env;
  try {
    env = parseEnv(process.env);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Invalid environment.",
    );
    process.exit(1);
  }

  const accessCodeOk = env.APP_ACCESS_CODE.length >= 8;
  const sessionSecretOk = env.SESSION_SECRET.length >= 32;
  const authOk = isAuthConfigured(env);

  const rows: Row[] = [
    {
      name: "APP_ACCESS_CODE",
      status: accessCodeOk ? "configured" : "missing",
      note: accessCodeOk
        ? "length OK (value not shown)"
        : "required — at least 8 characters",
    },
    {
      name: "SESSION_SECRET",
      status: sessionSecretOk ? "configured" : "missing",
      note: sessionSecretOk
        ? "length OK (value not shown)"
        : "required — at least 32 characters",
    },
    {
      name: "DEMO_MODE",
      status: env.DEMO_MODE ? "on" : "off",
      note: env.DEMO_MODE
        ? "seeded demo data available"
        : "live providers expected",
    },
    {
      name: "Anthropic",
      status: isAnthropicConfigured(env) ? "configured" : "missing",
      note: isAnthropicConfigured(env)
        ? `model: ${env.ANTHROPIC_MODEL}`
        : "optional — mock analysis is used without it",
    },
    {
      name: "Claude web search",
      status: env.ENABLE_CLAUDE_WEB_SEARCH ? "on" : "off",
      note: `max ${env.MAX_TREND_SEARCH_USES} searches per trend run`,
    },
    {
      name: "Supabase",
      status: isSupabaseConfigured(env) ? "configured" : "missing",
      note: isSupabaseConfigured(env)
        ? "URL and service-role key present"
        : "optional for boot; required for catalog storage",
    },
    {
      name: "Shopify",
      status: isShopifyLive(env) ? "configured" : "missing",
      note: isShopifyLive(env)
        ? `live client_credentials, API ${env.SHOPIFY_API_VERSION}`
        : `mode: ${env.SHOPIFY_MODE} — mock provider is used`,
    },
  ];

  printTable(rows);
  console.log("");

  if (!authOk) {
    console.error(
      "FAIL: set APP_ACCESS_CODE (>= 8 chars) and SESSION_SECRET (>= 32 chars) in .env.local before logging in.",
    );
    process.exit(1);
  }

  console.log(
    "OK: authentication is configured. Missing optional providers only limit features; the app still boots.",
  );
  process.exit(0);
}

main();
