// src/api/queries/tasks.js
//
// React Query hooks for /api/tasks — instantiated Task Model rows
// (D115b). Follows the sibling pattern: a key helper, hooks reading
// `auth` from useAuth(), every call through apiFetch. Tasks have no
// CAF lifecycle, so there is no transition/confirm mutation.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../apiClient";
import { useAuth } from "../../auth/AuthProvider";

export const tasksKey = ["tasks"];
export const taskKey = (id) => ["tasks", id];

export function useTasks(options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: tasksKey,
    queryFn: () => apiFetch("/api/tasks", {}, auth),
    ...options,
  });
}

export function useTask(taskId, options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: taskKey(taskId),
    queryFn: () => apiFetch(`/api/tasks/${taskId}`, {}, auth),
    enabled: !!taskId,
    ...options,
  });
}

export function useCreateTask() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      apiFetch("/api/tasks", { method: "POST", body: JSON.stringify(payload) }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tasksKey }),
  });
}

export function useUpdateTask() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) =>
      apiFetch(`/api/tasks/${id}`, { method: "PUT", body: JSON.stringify(payload) }, auth),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: tasksKey });
      queryClient.invalidateQueries({ queryKey: taskKey(id) });
    },
  });
}

export function useDeleteTask() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiFetch(`/api/tasks/${id}`, { method: "DELETE" }, auth),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: tasksKey });
      queryClient.invalidateQueries({ queryKey: taskKey(id) });
    },
  });
}
