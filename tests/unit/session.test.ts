import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SignJWT } from "jose";
import {
  createSessionToken,
  verifySessionToken,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/session";
import { resetEnvCache } from "@/lib/env";

/**
 * session.ts signs/verifies HS256 owner sessions with the SESSION_SECRET.
 * We stub a 32+ char secret and re-read the env cache before each assertion.
 */

const SECRET = "test-session-secret-that-is-at-least-32-chars";

function secretKey(secret = SECRET): Uint8Array {
  return new TextEncoder().encode(secret);
}

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", SECRET);
  resetEnvCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe("createSessionToken / verifySessionToken", () => {
  it("round-trips a freshly created token", async () => {
    const token = await createSessionToken();
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);
    await expect(verifySessionToken(token)).resolves.toBe(true);
  });

  it("rejects an empty token without throwing", async () => {
    await expect(verifySessionToken("")).resolves.toBe(false);
  });

  it("rejects an expired token", async () => {
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("owner")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 10 * SESSION_MAX_AGE_SECONDS)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(secretKey());
    await expect(verifySessionToken(expired)).resolves.toBe(false);
  });

  it("rejects a token signed with a different secret (tampered signature)", async () => {
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("owner")
      .setIssuedAt()
      .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
      .sign(secretKey("a-totally-different-secret-key-32-characters"));
    await expect(verifySessionToken(forged)).resolves.toBe(false);
  });

  it("rejects a structurally-mutated valid token", async () => {
    const token = await createSessionToken();
    const parts = token.split(".");
    // Flip the last character of the signature segment.
    const sig = parts[2];
    const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
    const mutated = `${parts[0]}.${parts[1]}.${flipped}`;
    await expect(verifySessionToken(mutated)).resolves.toBe(false);
  });

  it("rejects a correctly-signed token whose subject is not the owner", async () => {
    const wrongSubject = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("intruder")
      .setIssuedAt()
      .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
      .sign(secretKey());
    await expect(verifySessionToken(wrongSubject)).resolves.toBe(false);
  });

  it("refuses to sign when the secret is too short (defence in depth)", async () => {
    vi.stubEnv("SESSION_SECRET", "too-short");
    resetEnvCache();
    await expect(createSessionToken()).rejects.toThrow(/SESSION_SECRET/);
  });
});
