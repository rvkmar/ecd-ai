// src/api/queries/presentationModels.js
//
// React Query hooks for /api/presentationModels — PADI TR9 Materials &
// Presentation overlay (layout, conditional display, accessibility)
// bound to a Task Model. Follows the established pattern: a key helper,
// hooks reading `auth` from useAuth(), and every call through apiFetch.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../apiClient";
import { useAuth } from "../../auth/AuthProvider";

export const presentationModelsKey = ["presentationModels"];
export const presentationModelKey = (id) => ["presentationModels", id];

export function usePresentationModels(taskModelId, options = {}) {
  const { auth } = useAuth() || {};
  const qs = taskModelId ? `?taskModelId=${encodeURIComponent(taskModelId)}` : "";
  return useQuery({
    queryKey: taskModelId
      ? [...presentationModelsKey, { taskModelId }]
      : presentationModelsKey,
    queryFn: () => apiFetch(`/api/presentationModels${qs}`, {}, auth),
    ...options,
  });
}

export function usePresentationModel(id, options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: presentationModelKey(id),
    queryFn: () => apiFetch(`/api/presentationModels/${id}`, {}, auth),
    enabled: Boolean(id),
    ...options,
  });
}

export function useCreatePresentationModel() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      apiFetch("/api/presentationModels", { method: "POST", body: JSON.stringify(payload) }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: presentationModelsKey }),
  });
}

export function useUpdatePresentationModel() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) =>
      apiFetch(`/api/presentationModels/${id}`, { method: "PUT", body: JSON.stringify(payload) }, auth),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: presentationModelsKey });
      queryClient.invalidateQueries({ queryKey: presentationModelKey(variables?.id) });
    },
  });
}

// A status transition is a PUT with only `status` in the body — the
// router refuses any content key alongside it on a locked record.
export function useTransitionPresentationModel() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) =>
      apiFetch(`/api/presentationModels/${id}`, { method: "PUT", body: JSON.stringify({ status }) }, auth),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: presentationModelsKey });
      queryClient.invalidateQueries({ queryKey: presentationModelKey(variables?.id) });
    },
  });
}

export function useDeletePresentationModel() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiFetch(`/api/presentationModels/${id}`, { method: "DELETE" }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: presentationModelsKey }),
  });
}
