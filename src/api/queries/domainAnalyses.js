// src/api/queries/domainAnalyses.js
// React Query hooks for /api/domainAnalyses (D141 route, D142 form).

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../apiClient";
import { useAuth } from "../../auth/AuthProvider";

export const domainAnalysesKey = ["domainAnalyses"];
export const domainAnalysisKey = (id) => ["domainAnalyses", id];

export function useDomainAnalyses(options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: domainAnalysesKey,
    queryFn: () => apiFetch("/api/domainAnalyses", {}, auth),
    ...options,
  });
}

export function useCreateDomainAnalysis() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      apiFetch("/api/domainAnalyses", { method: "POST", body: JSON.stringify(payload) }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: domainAnalysesKey }),
  });
}

export function useUpdateDomainAnalysis() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) =>
      apiFetch(
        `/api/domainAnalyses/${id}`,
        { method: "PUT", body: JSON.stringify(payload) },
        auth
      ),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: domainAnalysesKey });
      queryClient.invalidateQueries({ queryKey: domainAnalysisKey(id) });
    },
  });
}

export function useConfirmDomainAnalysis() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      apiFetch(`/api/domainAnalyses/${id}/confirm`, { method: "POST" }, auth),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: domainAnalysesKey });
      queryClient.invalidateQueries({ queryKey: domainAnalysisKey(id) });
    },
  });
}
