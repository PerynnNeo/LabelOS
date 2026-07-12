import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isRateLimited,
  recordFailure,
  recordSuccess,
  retryAfterSeconds,
  resetRateLimiter,
  MAX_FAILURES,
  FAILURE_WINDOW_MS,
  COOLDOWN_MS,
} from "@/lib/auth/rate-limit";

const KEY = "1.2.3.4";

beforeEach(() => {
  resetRateLimiter();
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
  resetRateLimiter();
});

describe("failed-login rate limiter", () => {
  it("allows the first MAX_FAILURES-1 attempts, then blocks on the MAX_FAILURES-th", () => {
    for (let i = 0; i < MAX_FAILURES - 1; i += 1) {
      recordFailure(KEY);
      expect(isRateLimited(KEY)).toBe(false);
    }
    // The 5th failure trips the cooldown; a 6th attempt would be blocked.
    recordFailure(KEY);
    expect(isRateLimited(KEY)).toBe(true);
    expect(retryAfterSeconds(KEY)).toBe(COOLDOWN_MS / 1000);
  });

  it("resets after the cooldown window elapses", () => {
    for (let i = 0; i < MAX_FAILURES; i += 1) recordFailure(KEY);
    expect(isRateLimited(KEY)).toBe(true);

    // Just before the cooldown ends → still blocked.
    vi.advanceTimersByTime(COOLDOWN_MS - 1);
    expect(isRateLimited(KEY)).toBe(true);

    // Once the cooldown elapses the key is cleared.
    vi.advanceTimersByTime(1);
    expect(isRateLimited(KEY)).toBe(false);
    expect(retryAfterSeconds(KEY)).toBe(0);
  });

  it("drops failures that fall outside the rolling window", () => {
    // Four failures, then wait out the window so they no longer count.
    for (let i = 0; i < MAX_FAILURES - 1; i += 1) recordFailure(KEY);
    vi.advanceTimersByTime(FAILURE_WINDOW_MS + 1);
    // A single fresh failure must not trip the limiter.
    recordFailure(KEY);
    expect(isRateLimited(KEY)).toBe(false);
  });

  it("a successful login clears the key", () => {
    for (let i = 0; i < MAX_FAILURES - 1; i += 1) recordFailure(KEY);
    recordSuccess(KEY);
    // Starting fresh: MAX_FAILURES-1 more failures must not block.
    for (let i = 0; i < MAX_FAILURES - 1; i += 1) recordFailure(KEY);
    expect(isRateLimited(KEY)).toBe(false);
  });

  it("tracks keys independently", () => {
    for (let i = 0; i < MAX_FAILURES; i += 1) recordFailure(KEY);
    expect(isRateLimited(KEY)).toBe(true);
    expect(isRateLimited("9.9.9.9")).toBe(false);
  });
});
