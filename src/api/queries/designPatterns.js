// src/api/queries/designPatterns.js
//
// React Query hooks for /api/designPatterns (D131). Hooks ship with the
// collection. The wizard is D133–D134.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../apiClient";
import { useAuth } from "../../auth/AuthProvider";
import { evidenceModelsKey } from "./evidenceModels";
import { taskModelsKey } from "./taskModels";

export const designPatternsKey = ["designPatterns"];
export const designPatternKey = (id) => ["designPatterns", id];

export function useDesignPatterns(options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: designPatternsKey,
    queryFn: () => apiFetch("/api/designPatterns", {}, auth),
    ...options,
  });
}

export function useDesignPattern(id, options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: designPatternKey(id),
    queryFn: () => apiFetch(`/api/designPatterns/${id}`, {}, auth),
    enabled: !!id,
    ...options,
  });
}

export function useCreateDesignPattern() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      apiFetch("/api/designPatterns", { method: "POST", body: JSON.stringify(payload) }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: designPatternsKey }),
  });
}

export function useUpdateDesignPattern() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) =>
      apiFetch(
        `/api/designPatterns/${id}`,
        { method: "PUT", body: JSON.stringify(payload) },
        auth
      ),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: designPatternsKey });
      queryClient.invalidateQueries({ queryKey: designPatternKey(id) });
    },
  });
}

export function useConfirmDesignPattern() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      apiFetch(`/api/designPatterns/${id}/confirm`, { method: "POST" }, auth),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: designPatternsKey });
      queryClient.invalidateQueries({ queryKey: designPatternKey(id) });
    },
  });
}

export function useSeedDesignPattern() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, competencyId, competencyModelId, smvId, selections }) =>
      apiFetch(
        `/api/designPatterns/${id}/seed`,
        {
          method: "POST",
          body: JSON.stringify({
            competencyId,
            competencyModelId,
            smvId,
            selections,
          }),
        },
        auth
      ),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: evidenceModelsKey });
      queryClient.invalidateQueries({ queryKey: taskModelsKey });
      queryClient.invalidateQueries({ queryKey: ["designPatterns", id, "descendants"] });
    },
  });
}

export function useDeleteDesignPattern() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      apiFetch(`/api/designPatterns/${id}`, { method: "DELETE" }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: designPatternsKey }),
  });
}
