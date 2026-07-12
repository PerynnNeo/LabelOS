import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth/require-session";
import { LoginForm } from "./login-form";

/**
 * Login — a centered iOS card on the outermost window framing (bg-window).
 * Single-owner hackathon auth: one access code from the environment. The POST
 * /api/auth/login flow lives in <LoginForm>; on success it navigates to
 * /app/dashboard (or the sanitised `next` path).
 */
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
    <main className="flex min-h-dvh flex-col items-center justify-center bg-window px-6 py-16">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 rounded-[10px] px-1 py-1"
          >
            <span
              aria-hidden
              className="flex size-8 items-center justify-center rounded-[9px] bg-accent text-[15px] font-extrabold text-white shadow-[0_3px_8px_-1px_rgba(10,132,255,0.5)]"
            >
              L
            </span>
            <span className="font-display text-3xl leading-none tracking-[-0.01em] text-ink">
              LabelOS
            </span>
          </Link>
        </div>

        <div className="lo-card px-7 py-8 shadow-raise">
          <h1 className="text-[19px] font-bold leading-tight tracking-[-0.01em] text-ink">
            Enter the studio
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink3">
            Log in with the private access code from your environment
            configuration.
          </p>
          <div className="mt-6">
            <LoginForm nextPath={nextPath} />
          </div>
        </div>

        <p className="mx-auto mt-5 max-w-[320px] text-center text-[11.5px] leading-relaxed text-muted">
          Single-owner hackathon authentication — one seat, one access code.
          Replace with proper user accounts before commercial use.
        </p>
      </div>
    </main>
  );
}
