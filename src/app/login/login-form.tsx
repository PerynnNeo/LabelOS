"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { ApiResult } from "@/lib/api";

interface LoginFormProps {
  /** Sanitised internal path to navigate to after a successful login. */
  nextPath: string;
}

function messageFromResult(result: ApiResult<{ ok: true }>): string {
  if (result.ok) return "";
  // Server messages are already owner-friendly and never reveal secrets.
  return result.error.message;
}

export function LoginForm({ nextPath }: LoginFormProps) {
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode }),
      });
      const result = (await response.json()) as ApiResult<{ ok: true }>;

      if (result.ok) {
        // Full navigation so the proxy sees the fresh session cookie.
        window.location.assign(nextPath);
        return;
      }

      const message = messageFromResult(result);
      setError(message);
      toast.error(message);
      setSubmitting(false);
    } catch {
      const message =
        "Could not reach the server. Check your connection and try again.";
      setError(message);
      toast.error(message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <label
        htmlFor="access-code"
        className="block text-xs font-medium uppercase tracking-widest text-muted"
      >
        Access code
      </label>
      <input
        id="access-code"
        name="accessCode"
        type="password"
        autoComplete="current-password"
        autoFocus
        required
        value={accessCode}
        onChange={(event) => setAccessCode(event.target.value)}
        className="mt-2 w-full border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-accent"
        placeholder="Your private access code"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "login-error" : undefined}
      />

      {error ? (
        <p id="login-error" role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting || accessCode.length === 0}
        className="mt-6 w-full bg-ink px-4 py-2.5 text-sm font-medium tracking-wide text-paper transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Checking…" : "Log in"}
      </button>
    </form>
  );
}
