"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/lo";
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
        className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted"
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
        className="mt-2 h-11 w-full rounded-[10px] border border-[rgba(0,0,0,0.12)] bg-surface px-3.5 text-[14px] text-ink outline-none transition-colors placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20"
        placeholder="Your private access code"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "login-error" : undefined}
      />

      {error ? (
        <p
          id="login-error"
          role="alert"
          className="mt-3 text-[13px] text-[#C4271B]"
        >
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        loading={submitting}
        disabled={accessCode.length === 0}
        className="mt-6 w-full"
      >
        {submitting ? "Checking…" : "Log in"}
      </Button>
    </form>
  );
}
