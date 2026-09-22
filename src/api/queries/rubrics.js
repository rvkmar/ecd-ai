// src/api/queries/rubrics.js
//
// React Query hooks for /api/rubrics (D122).

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../apiClient";
import { useAuth } from "../../auth/AuthProvider";

export const rubricsKey = ["rubrics"];
export const rubricKey = (id) => ["rubrics", id];

export function useRubrics(options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: rubricsKey,
    queryFn: () => apiFetch("/api/rubrics", {}, auth),
    ...options,
  });
}

export function useRubric(id, options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: rubricKey(id),
    queryFn: () => apiFetch(`/api/rubrics/${id}`, {}, auth),
    enabled: !!id,
    ...options,
  });
}

export function useCreateRubric() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      apiFetch("/api/rubrics", { method: "POST", body: JSON.stringify(payload) }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rubricsKey }),
  });
}

export function useUpdateRubric() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) =>
      apiFetch(`/api/rubrics/${id}`, { method: "PUT", body: JSON.stringify(payload) }, auth),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: rubricsKey });
      queryClient.invalidateQueries({ queryKey: rubricKey(id) });
    },
  });
}

export function useConfirmRubric() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      apiFetch(`/api/rubrics/${id}/confirm`, { method: "POST" }, auth),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: rubricsKey });
      queryClient.invalidateQueries({ queryKey: rubricKey(id) });
    },
  });
}

export function useDeleteRubric() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      apiFetch(`/api/rubrics/${id}`, { method: "DELETE" }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rubricsKey }),
  });
}
