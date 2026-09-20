// src/config/release.js
// Build-time release tag for client error reports (D104).
// Vite injects VITE_RELEASE when set; otherwise package version.

export function appRelease() {
  const fromEnv =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_RELEASE) ||
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_APP_RELEASE) ||
    "";
  if (fromEnv) return String(fromEnv);
  return "1.0.0";
}
