/**
 * D94 — production CORS posture.
 *
 * Compose serves the SPA and `/api` same-origin through nginx, so production
 * must not enable CORS at all. Dev may pin an explicit Vite origin; never `*`.
 */

function shouldEnableCors(env = process.env) {
  return env.NODE_ENV !== "production";
}

function resolveCorsOrigin(env = process.env) {
  const origin = env.CORS_ORIGIN || "http://localhost:5173";
  if (origin === "*" || origin === "true" || origin === "false") {
    throw new Error(
      "CORS_ORIGIN must be an explicit origin (refusing *, true, false)"
    );
  }
  return origin;
}

/**
 * @returns {boolean} whether CORS middleware was mounted
 */
export function applyCors(app, cors, env = process.env) {
  if (!shouldEnableCors(env)) return false;
  app.use(cors({ origin: resolveCorsOrigin(env), credentials: true }));
  return true;
}
