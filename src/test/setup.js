// src/test/setup.js
// Global Vitest setup — runs once before each test file.

import "@testing-library/jest-dom";

// server/config/jwt.js reads process.env.JWT_SECRET at *import* time and
// throws if it's missing/too short (that's the whole point of the Phase 1
// fix — no insecure fallback). Backend test files import that module
// (directly or transitively via authMiddleware.js/usersRoutes.js), so a
// safe test value has to exist before those imports run. Vitest loads
// setupFiles as their own module graph and fully evaluates them before it
// imports the actual test file, so setting these here — rather than at the
// top of each test file — is what makes the timing work.
process.env.JWT_SECRET ||=
  "test-only-secret-do-not-use-outside-automated-tests-please-thanks";
process.env.ACCESS_TOKEN_EXPIRES_IN ||= "15m";
process.env.REFRESH_TOKEN_EXPIRES_IN ||= "7d";
process.env.TOKEN_EXPIRES_IN ||= "15m";
process.env.DB_MODE ||= "json";

// D92: authenticateToken checks authEpoch. Route tests mint JWTs without
// going through login, so seed a zero epoch for the four walk accounts
// (and common role-named subjects). Dynamic import so jwt.js sees JWT_SECRET
// above (static imports would hoist before the env assignment).
const { setCachedAuthEpoch } = await import("../../server/utils/tokenService.js");
for (const u of [
  "admin1",
  "dist1",
  "teach1",
  "stud1",
  // Route tests mint `${role}1` (district1, teacher1, …), not the walk ids.
  "district1",
  "teacher1",
  "student1",
  "admin",
  "district",
  "teacher",
  "student",
]) {
  setCachedAuthEpoch(u, 0);
}

// Day 42 (Week 9): jsdom has no ResizeObserver at all, but cmdk (the
// Command-palette primitive the new Combobox is built on -- see
// src/components/ui/command.tsx) unconditionally observes element size in
// an effect that runs on every render, crashing any test that mounts it.
// A minimal no-op stub is standard practice for this exact gap (Radix's
// own test suite ships one) -- nothing under test here reads actual
// measured sizes, only that mounting/interacting doesn't throw.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom also has no scrollIntoView implementation at all (it throws
// "not a function", not just a no-op) -- cmdk calls it on the highlighted
// item whenever the active selection changes. Same rationale as above.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
