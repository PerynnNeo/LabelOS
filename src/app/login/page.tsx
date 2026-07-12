import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth/require-session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Log in — LabelOS",
  description: "Enter your access code to open the LabelOS studio.",
};

const DEFAULT_NEXT_PATH = "/app/dashboard";

function sanitizeNextPath(raw: string | undefined): string {
  // Only allow internal /app destinations to avoid open redirects.
  if (raw && raw.startsWith("/app") && !raw.startsWith("//")) {
    return raw;
  }
  return DEFAULT_NEXT_PATH;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const nextPath = sanitizeNextPath(
    typeof params.next === "string" ? params.next : undefined,
  );

  const session = await getSessionFromCookies();
  if (session.ok) {
    redirect(nextPath);
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <Link
            href="/"
            className="font-display text-3xl tracking-tight text-ink"
          >
            LabelOS
          </Link>
          <div className="mx-auto mt-4 h-px w-10 bg-accent" aria-hidden="true" />
          <p className="mt-4 text-sm text-muted">
            The operating system for one-person fashion labels.
          </p>
        </div>

        <div className="border border-line bg-surface p-8">
          <h1 className="font-display text-xl text-ink">Enter the studio</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Log in with the private access code from your environment
            configuration.
          </p>
          <div className="mt-6">
            <LoginForm nextPath={nextPath} />
          </div>
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-muted">
          Single-owner hackathon authentication. Replace with proper user
          accounts before commercial use.
        </p>
      </div>
    </main>
  );
}
