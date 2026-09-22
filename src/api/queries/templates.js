// src/api/queries/templates.js
//
// React Query hooks for /api/templates (D126). Hooks ship with the
// collection (D48 lesson). Builder UI is D127.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../apiClient";
import { useAuth } from "../../auth/AuthProvider";

export const templatesKey = ["templates"];
export const templateKey = (id) => ["templates", id];

export function useTemplates(options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: templatesKey,
    queryFn: () => apiFetch("/api/templates", {}, auth),
    ...options,
  });
}

export function useTemplate(id, options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: templateKey(id),
    queryFn: () => apiFetch(`/api/templates/${id}`, {}, auth),
    enabled: !!id,
    ...options,
  });
}

export function useCreateTemplate() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      apiFetch("/api/templates", { method: "POST", body: JSON.stringify(payload) }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templatesKey }),
  });
}

export function useUpdateTemplate() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) =>
      apiFetch(
        `/api/templates/${id}`,
        { method: "PUT", body: JSON.stringify(payload) },
        auth
      ),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: templatesKey });
      queryClient.invalidateQueries({ queryKey: templateKey(id) });
    },
  });
}

export function useConfirmTemplate() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      apiFetch(`/api/templates/${id}/confirm`, { method: "POST" }, auth),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: templatesKey });
      queryClient.invalidateQueries({ queryKey: templateKey(id) });
    },
  });
}

export function useDeleteTemplate() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      apiFetch(`/api/templates/${id}`, { method: "DELETE" }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templatesKey }),
  });
}
