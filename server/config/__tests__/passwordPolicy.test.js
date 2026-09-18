// server/config/__tests__/passwordPolicy.test.js
import { describe, it, expect } from "vitest";
import {
  validatePassword,
  PASSWORD_POLICY_STATEMENT,
} from "../passwordPolicy.js";

describe("passwordPolicy", () => {
  it("states a minimum length and lockout in the policy string", () => {
    expect(PASSWORD_POLICY_STATEMENT).toMatch(/12/);
    expect(PASSWORD_POLICY_STATEMENT).toMatch(/15 minutes/);
  });

  it("accepts WalkPass!2026-shaped secrets", () => {
    expect(validatePassword("WalkPass!2026").ok).toBe(true);
  });

  it("rejects short or letter-only / digit-only passwords", () => {
    expect(validatePassword("short").ok).toBe(false);
    expect(validatePassword("abcdefghijkl").ok).toBe(false);
    expect(validatePassword("123456789012").ok).toBe(false);
  });
});
