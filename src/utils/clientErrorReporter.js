// src/utils/clientErrorReporter.js
// D104: ship caught render errors to the server with a release tag.
// Goes through apiFetch so the D46 raw-fetch guard stays green.

import { apiFetch } from "@/api/apiClient";
import { appRelease } from "@/config/release";

/**
 * @param {Error|unknown} error
 * @param {{ label?: string, componentStack?: string }} [meta]
 */
export async function reportClientError(error, meta = {}) {
  const err = error instanceof Error ? error : new Error(String(error));
  const payload = {
    release: appRelease(),
    label: meta.label || null,
    errorName: err.name || "Error",
    message: err.message || String(error),
    stack: [err.stack, meta.componentStack].filter(Boolean).join("\n"),
    href: typeof window !== "undefined" ? window.location?.href : null,
  };
  try {
    await apiFetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Never let reporting break the fallback UI.
  }
}
