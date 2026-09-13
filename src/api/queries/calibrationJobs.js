// src/api/queries/calibrationJobs.js
// React Query hooks for /api/calibrationJobs. The D65 console consumes
// these; they ship now because the seven-artefact contract requires the
// hooks on the same day as the collection (D48 lesson).

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../apiClient";
import { useAuth } from "../../auth/AuthProvider";
import { evidenceModelsKey } from "./evidenceModels";

export const calibrationJobsKey = ["calibrationJobs"];
export const calibrationJobKey = (id) => ["calibrationJobs", id];

export function useCalibrationJobs(filters = {}, options = {}) {
  const { auth } = useAuth() || {};
  const params = new URLSearchParams();
  if (filters.evidenceModelId) params.set("evidenceModelId", filters.evidenceModelId);
  if (filters.status) params.set("status", filters.status);
  if (filters.kind) params.set("kind", filters.kind);
  const qs = params.toString() ? `?${params}` : "";
  return useQuery({
    queryKey: [...calibrationJobsKey, filters],
    queryFn: () => apiFetch(`/api/calibrationJobs${qs}`, {}, auth),
    ...options,
  });
}

export function useCalibrationJob(id, options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: calibrationJobKey(id),
    queryFn: () => apiFetch(`/api/calibrationJobs/${id}`, {}, auth),
    enabled: Boolean(id),
    ...options,
  });
}

export function useEnqueueCalibrationJob() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      apiFetch("/api/calibrationJobs", { method: "POST", body: JSON.stringify(payload) }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: calibrationJobsKey }),
  });
}

export function useCancelCalibrationJob() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      apiFetch(`/api/calibrationJobs/${id}/cancel`, { method: "POST" }, auth),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: calibrationJobsKey });
      queryClient.invalidateQueries({ queryKey: calibrationJobKey(id) });
    },
  });
}

export function useRetryCalibrationJob() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      apiFetch(`/api/calibrationJobs/${id}/retry`, { method: "POST" }, auth),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: calibrationJobsKey });
      queryClient.invalidateQueries({ queryKey: calibrationJobKey(id) });
    },
  });
}

// Compose sets CALIBRATION_QUEUE_AUTORUN=1 so enqueue kicks the worker.
// Local npm run dev and tests leave autorun off; the D65 console therefore
// exposes Process (POST /:id/process) as an explicit operator action.
export function useProcessCalibrationJob() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      apiFetch(`/api/calibrationJobs/${id}/process`, { method: "POST" }, auth),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: calibrationJobsKey });
      queryClient.invalidateQueries({ queryKey: calibrationJobKey(id) });
    },
  });
}

export function useIngestCalibrationJob() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      apiFetch(`/api/calibrationJobs/${id}/ingest`, { method: "POST" }, auth),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: calibrationJobsKey });
      queryClient.invalidateQueries({ queryKey: calibrationJobKey(id) });
      // Ingest appends statisticalModels[].parameterSets[]; refresh EMs
      // so an open Evidence Model workspace sees the new set.
      queryClient.invalidateQueries({ queryKey: evidenceModelsKey });
    },
  });
}
