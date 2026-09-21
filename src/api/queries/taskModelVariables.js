// src/api/queries/taskModelVariables.js
//
// React Query hooks for /api/taskModelVariables (D116). Library records:
// no CAF transition mutation. Screens that bind a variable onto a Task
// Model are a later W24 slice; the hooks ship with the collection so the
// HTTP surface is reachable the same way D48 shipped headless hooks.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../apiClient";
import { useAuth } from "../../auth/AuthProvider";

export const taskModelVariablesKey = ["taskModelVariables"];
export const taskModelVariableKey = (id) => ["taskModelVariables", id];

export function useTaskModelVariables(options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: taskModelVariablesKey,
    queryFn: () => apiFetch("/api/taskModelVariables", {}, auth),
    ...options,
  });
}

export function useTaskModelVariable(id, options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: taskModelVariableKey(id),
    queryFn: () => apiFetch(`/api/taskModelVariables/${id}`, {}, auth),
    enabled: !!id,
    ...options,
  });
}

export function useCreateTaskModelVariable() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      apiFetch(
        "/api/taskModelVariables",
        { method: "POST", body: JSON.stringify(payload) },
        auth
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskModelVariablesKey }),
  });
}

export function useUpdateTaskModelVariable() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) =>
      apiFetch(
        `/api/taskModelVariables/${id}`,
        { method: "PUT", body: JSON.stringify(payload) },
        auth
      ),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: taskModelVariablesKey });
      queryClient.invalidateQueries({ queryKey: taskModelVariableKey(id) });
    },
  });
}

export function useDeleteTaskModelVariable() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      apiFetch(`/api/taskModelVariables/${id}`, { method: "DELETE" }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskModelVariablesKey }),
  });
}
