/**
 * In-memory failed-login rate limiter.
 *
 * Policy: at most MAX_FAILURES failed attempts per key (client IP) inside a
 * rolling FAILURE_WINDOW_MS window. Once exceeded, the key is blocked for
 * COOLDOWN_MS before it may try again. A successful login clears the key.
 *
 * MVP CONTROL — NOT PRODUCTION AUTH INFRASTRUCTURE:
 * State lives in process memory, so it resets on redeploy/cold start and is
 * not shared across serverless instances. That is acceptable for a
 * single-owner hackathon MVP; a commercial version should use a shared store
 * (e.g. Redis/Upstash) and proper user accounts.
 *
 * All functions accept an optional `now` timestamp so tests can control time.
 */

export const MAX_FAILURES = 5;
export const FAILURE_WINDOW_MS = 15 * 60 * 1000;
export const COOLDOWN_MS = 15 * 60 * 1000;

interface LimiterEntry {
  /** Timestamps (ms) of recent failures inside the rolling window. */
  failureTimestamps: number[];
  /** When set, the key is blocked until this timestamp (ms). */
  blockedUntil: number | null;
}

const entries = new Map<string, LimiterEntry>();

/** True when the key is currently in its cooldown period. */
export function isRateLimited(key: string, now: number = Date.now()): boolean {
  const entry = entries.get(key);
  if (!entry || entry.blockedUntil === null) return false;
  if (now < entry.blockedUntil) return true;
  // Cooldown elapsed — the key starts with a clean slate.
  entries.delete(key);
  return false;
}

/**
 * Record a failed login attempt. When the failure count inside the rolling
 * window reaches MAX_FAILURES, the key enters a COOLDOWN_MS block.
 */
export function recordFailure(key: string, now: number = Date.now()): void {
  const entry = entries.get(key) ?? {
    failureTimestamps: [],
    blockedUntil: null,
  };
  entry.failureTimestamps = entry.failureTimestamps.filter(
    (t) => now - t < FAILURE_WINDOW_MS,
  );
  entry.failureTimestamps.push(now);
  if (entry.failureTimestamps.length >= MAX_FAILURES) {
    entry.blockedUntil = now + COOLDOWN_MS;
    entry.failureTimestamps = [];
  }
  entries.set(key, entry);
}

/** Clear all limiter state for a key (called after a successful login). */
export function recordSuccess(key: string): void {
  entries.delete(key);
}

/** Seconds until the key may retry; 0 when not blocked. */
export function retryAfterSeconds(
  key: string,
  now: number = Date.now(),
): number {
  const entry = entries.get(key);
  if (!entry || entry.blockedUntil === null) return 0;
  return Math.max(0, Math.ceil((entry.blockedUntil - now) / 1000));
}

/** Test helper — wipe all limiter state. */
export function resetRateLimiter(): void {
  entries.clear();
}
