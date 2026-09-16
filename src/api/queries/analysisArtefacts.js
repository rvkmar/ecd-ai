// src/api/queries/analysisArtefacts.js
// React Query hooks for /api/analysisArtefacts. Read-only by design —
// artefacts are produced by calibration job ingest (D76), never authored.

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../apiClient";
import { useAuth } from "../../auth/AuthProvider";

export const analysisArtefactsKey = ["analysisArtefacts"];
export const analysisArtefactKey = (id) => ["analysisArtefacts", id];

export function useAnalysisArtefacts(filters = {}, options = {}) {
  const { auth } = useAuth() || {};
  const params = new URLSearchParams();
  if (filters.evidenceModelId) params.set("evidenceModelId", filters.evidenceModelId);
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.jobId) params.set("jobId", filters.jobId);
  const qs = params.toString() ? `?${params}` : "";
  return useQuery({
    queryKey: [...analysisArtefactsKey, filters],
    queryFn: () => apiFetch(`/api/analysisArtefacts${qs}`, {}, auth),
    ...options,
  });
}

export function useAnalysisArtefact(id, options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: analysisArtefactKey(id),
    queryFn: () => apiFetch(`/api/analysisArtefacts/${id}`, {}, auth),
    enabled: Boolean(id),
    ...options,
  });
}
