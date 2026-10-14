// src/api/queries/bulkDownload.js
//
// Counterpart to bulkUpload.js: backs every Settings > Data > Download card.
//
// Each entity type gets a fetcher that returns a plain JSON array shaped
// exactly like the file its matching Bulk Upload card accepts, so a file
// downloaded here can be edited and fed straight back into the uploader
// (on this or another deployment) without hand-reshaping. Two consequences
// of that round-trip goal are worth knowing:
//   - competency models are exported with their competencies nested under
//     each model (the upload shape), not as the two flat collections the
//     GET endpoints expose;
//   - users are exported WITHOUT passwords, because the API never returns
//     password hashes; a re-upload needs a `password` added per row.

import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "../apiClient";
import { useAuth } from "../../auth/AuthProvider";

const fetchers = {
  users: async (auth) => (await apiFetch("/api/users", {}, auth)) || [],

  policies: async (auth) => (await apiFetch("/api/policies", {}, auth)) || [],

  curricularPolicies: async (auth) =>
    (await apiFetch("/api/curricularPolicies", {}, auth)) || [],

  // Re-nest competencies under their model so the file matches what
  // POST /api/competencies/models/bulk consumes.
  competencyModels: async (auth) => {
    const [models, competencies] = await Promise.all([
      apiFetch("/api/competencies/models", {}, auth),
      apiFetch("/api/competencies", {}, auth),
    ]);
    return (models || []).map((m) => ({
      ...m,
      competencies: (competencies || []).filter((c) => c.modelId === m.id),
    }));
  },

  evidenceModels: async (auth) => (await apiFetch("/api/evidenceModels", {}, auth)) || [],

  taskModels: async (auth) => (await apiFetch("/api/taskModels", {}, auth)) || [],

  items: async (auth) => (await apiFetch("/api/items", {}, auth)) || [],

  designPatterns: async (auth) =>
    (await apiFetch("/api/designPatterns", {}, auth)) || [],
};

// Trigger a browser download of `rows` as pretty-printed JSON. Uses an
// object URL + synthetic anchor click (revoked straight after) rather than
// a data: URI so large exports don't hit URL-length limits.
export function downloadJson(filename, rows) {
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Date-stamped, collision-friendly file name, e.g. "evidenceModels-2026-08-21.json".
export function exportFileName(kind) {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${kind}-${stamp}.json`;
}

export function useBulkDownload(kind) {
  const { auth } = useAuth() || {};
  return useMutation({
    mutationFn: async () => {
      const fetcher = fetchers[kind];
      if (!fetcher) throw new Error(`Unknown export type: ${kind}`);
      const rows = await fetcher(auth);
      return Array.isArray(rows) ? rows : [];
    },
  });
}
