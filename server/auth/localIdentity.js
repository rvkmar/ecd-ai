/**
 * Local identity resolution (SSO-ready seam).
 *
 * Today every account is authProvider "local" (or unset = local). Login accepts
 * username OR profile.emisId OR profile.udiseId with the same password check.
 *
 * When an OIDC IdP is wired (ADR 0005 / TN requirement):
 * - federated users get authProvider: "oidc" and no (or unused) local password
 * - assertPasswordLoginAllowed() refuses password login for those rows
 * - local admins and any remaining local accounts keep working unchanged
 */

export function normalizeLoginIdentifier(raw) {
  return String(raw ?? "").trim();
}

/**
 * Find a user by username, EMIS id, or UDISE id (case-sensitive for ids as
 * stored; username also tried case-insensitively for convenience).
 */
export function findUserByLoginIdentifier(users, identifier) {
  const id = normalizeLoginIdentifier(identifier);
  if (!id) return null;
  const lower = id.toLowerCase();

  return (
    users.find((u) => u.username === id) ||
    users.find((u) => String(u.username || "").toLowerCase() === lower) ||
    users.find((u) => u.profile?.emisId && u.profile.emisId === id) ||
    users.find((u) => u.profile?.udiseId && u.profile.udiseId === id) ||
    null
  );
}

/** Effective provider: missing field means local (backward compatible). */
export function effectiveAuthProvider(user) {
  return user?.authProvider || "local";
}

/**
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
export function assertPasswordLoginAllowed(user) {
  const provider = effectiveAuthProvider(user);
  if (provider !== "local") {
    return {
      ok: false,
      status: 401,
      error:
        "This account uses single sign-on. Sign in with your organisation identity provider.",
    };
  }
  if (!user?.password) {
    return {
      ok: false,
      status: 401,
      error: "Invalid username or password",
    };
  }
  return { ok: true };
}
