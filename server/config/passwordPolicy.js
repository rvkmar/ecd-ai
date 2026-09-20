// D92 — stated password + lockout policy (T-AUTH-02).
// Enforced on create and reset; login rate-limit / lockout already live in
// usersRoutes.js and are the decided numbers below, not a D93 rebuild.

/** Minimum length for new or reset passwords. */
const PASSWORD_MIN_LENGTH = 12;

/**
 * Human-readable policy statement. Surfaced in docs/security/session-policy.md
 * and returned by validation errors so operators see the same rule the code uses.
 */
export const PASSWORD_POLICY_STATEMENT =
  `Passwords must be at least ${PASSWORD_MIN_LENGTH} characters and include ` +
  "at least one letter and one digit. Login is limited to 10 attempts per " +
  "IP per minute; after 5 failed attempts for a username the account locks " +
  "for 15 minutes.";

/**
 * @param {unknown} password
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validatePassword(password) {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    };
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return {
      ok: false,
      error: "Password must include at least one letter and one digit.",
    };
  }
  return { ok: true };
}
