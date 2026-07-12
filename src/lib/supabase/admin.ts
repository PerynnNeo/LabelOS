import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocketImpl from "ws";
import { getEnv, isSupabaseConfigured } from "@/lib/env";

/**
 * Service-role Supabase client. Server only — never import from a Client
 * Component. All database access goes through this client; RLS is enabled on
 * every table with no anonymous policies.
 *
 * Node < 22 has no global WebSocket, which @supabase/supabase-js requires even
 * though LabelOS never uses realtime. Polyfill it once here (the single module
 * every Supabase access flows through) so both the app server and the CLI
 * scripts work on Node 20. This module is server-only, so `ws` never reaches a
 * browser or edge bundle.
 */
const globalWithWs = globalThis as { WebSocket?: unknown };
if (typeof globalWithWs.WebSocket === "undefined") {
  globalWithWs.WebSocket = WebSocketImpl;
}

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local, then run the migration in supabase/migrations/001_initial.sql.",
    );
    this.name = "SupabaseNotConfiguredError";
  }
}

let client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  const env = getEnv();
  if (!isSupabaseConfigured(env)) {
    throw new SupabaseNotConfiguredError();
  }
  if (!client) {
    client = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL!,
      env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
  }
  return client;
}

/** Test helper — drops the cached client. */
export function resetSupabaseAdmin(): void {
  client = null;
}
