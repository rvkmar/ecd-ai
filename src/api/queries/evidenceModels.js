// src/api/queries/evidenceModels.js
//
// React Query hooks for /api/evidenceModels. This endpoint is fetched by
// id from four independent ItemWizard steps (Step2_ECDAlignment,
// Step4_InteractionStructure, Step5_ScoringMapping, Step7_TaskAlignment)
// each with their own useState/useEffect copy -- useEvidenceModel(id) below
// collapses all four onto one cached fetch per evidence model id.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../apiClient";
import { useAuth } from "../../auth/AuthProvider";

export const evidenceModelsKey = ["evidenceModels"];
export const evidenceModelKey = (id) => ["evidenceModels", id];

export function useEvidenceModels(options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: evidenceModelsKey,
    queryFn: () => apiFetch("/api/evidenceModels", {}, auth),
    ...options,
  });
}

export function useEvidenceModel(evidenceModelId, options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: evidenceModelKey(evidenceModelId),
    queryFn: () => apiFetch(`/api/evidenceModels/${evidenceModelId}`, {}, auth),
    enabled: !!evidenceModelId,
    ...options,
  });
}

export function useCreateEvidenceModel() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      apiFetch("/api/evidenceModels", { method: "POST", body: JSON.stringify(payload) }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: evidenceModelsKey }),
  });
}

export function useUpdateEvidenceModel() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) =>
      apiFetch(`/api/evidenceModels/${id}`, { method: "PUT", body: JSON.stringify(payload) }, auth),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: evidenceModelsKey });
      queryClient.invalidateQueries({ queryKey: evidenceModelKey(id) });
    },
  });
}

export function useConfirmEvidenceModel() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiFetch(`/api/evidenceModels/${id}/confirm`, { method: "POST" }, auth),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: evidenceModelsKey });
      queryClient.invalidateQueries({ queryKey: evidenceModelKey(id) });
    },
  });
}

export function useCloneEvidenceModel() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiFetch(`/api/evidenceModels/${id}/clone`, { method: "POST" }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: evidenceModelsKey }),
  });
}

export function useDeleteEvidenceModel() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiFetch(`/api/evidenceModels/${id}`, { method: "DELETE" }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: evidenceModelsKey }),
  });
}

export function useRecalibrateEvidenceModel() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) =>
      apiFetch(`/api/evidenceModels/${id}/recalibrate`, { method: "POST", body: JSON.stringify(payload) }, auth),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: evidenceModelsKey });
      queryClient.invalidateQueries({ queryKey: evidenceModelKey(id) });
    },
  });
}

export function useActivateParameterSet() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) =>
      apiFetch(`/api/evidenceModels/${id}/activate-parameter-set`, { method: "POST", body: JSON.stringify(payload) }, auth),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: evidenceModelsKey });
      queryClient.invalidateQueries({ queryKey: evidenceModelKey(id) });
    },
  });
}

export function useUpdateScoringBundles() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, scoringBundles }) =>
      apiFetch(
        `/api/evidenceModels/${id}/scoring-bundles`,
        { method: "PUT", body: JSON.stringify({ scoringBundles }) },
        auth
      ),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: evidenceModelsKey });
      queryClient.invalidateQueries({ queryKey: evidenceModelKey(id) });
    },
  });
}

export function useUpdateDecisionRule() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) =>
      apiFetch(`/api/evidenceModels/${id}/decision-rule`, { method: "POST", body: JSON.stringify(payload) }, auth),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: evidenceModelsKey });
      queryClient.invalidateQueries({ queryKey: evidenceModelKey(id) });
    },
  });
}

/**
 * PATCH /api/evidenceModels/:id/lifecycle
 *
 * The general lifecycle move, guarded server-side by canTransition()
 * from lifecycleMatrix.js: confirmed → operational → suspended →
 * operational → archived. useActivateEvidenceModel() below is the
 * confirmed/suspended → operational special case, kept because it
 * predates this hook; new callers should prefer this one.
 */
export function useEvidenceModelLifecycle() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, nextStatus, reason }) =>
      apiFetch(
        `/api/evidenceModels/${id}/lifecycle`,
        { method: "PATCH", body: JSON.stringify({ nextStatus, reason }) },
        auth
      ),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: evidenceModelsKey });
      queryClient.invalidateQueries({ queryKey: evidenceModelKey(id) });
    },
  });
}

export function useActivateEvidenceModel() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiFetch(`/api/evidenceModels/${id}/activate`, { method: "POST" }, auth),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: evidenceModelsKey });
      queryClient.invalidateQueries({ queryKey: evidenceModelKey(id) });
    },
  });
}
