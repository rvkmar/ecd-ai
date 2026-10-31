import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../apiClient";
import { useAuth } from "../../auth/AuthProvider";

export const validityEvidenceKey = (evidenceModelId) => ["validityEvidence", evidenceModelId || "all"];

export function useValidityEvidence(evidenceModelId, options = {}) {
  const { auth } = useAuth() || {};
  const params = new URLSearchParams();
  if (evidenceModelId) params.set("evidenceModelId", evidenceModelId);
  const query = params.toString();
  return useQuery({
    queryKey: validityEvidenceKey(evidenceModelId),
    queryFn: () => apiFetch(`/api/validityEvidence${query ? `?${query}` : ""}`, {}, auth),
    enabled: !!evidenceModelId,
    ...options,
  });
}

export function useCreateValidityEvidence(evidenceModelId) {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      apiFetch(
        "/api/validityEvidence",
        { method: "POST", body: JSON.stringify(payload) },
        auth
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: validityEvidenceKey(evidenceModelId) }),
  });
}

export function useUpdateValidityEvidence(evidenceModelId) {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) =>
      apiFetch(
        `/api/validityEvidence/${id}`,
        { method: "PUT", body: JSON.stringify(payload) },
        auth
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: validityEvidenceKey(evidenceModelId) }),
  });
}

export function useDeleteValidityEvidence(evidenceModelId) {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      apiFetch(`/api/validityEvidence/${id}`, { method: "DELETE" }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: validityEvidenceKey(evidenceModelId) }),
  });
}
