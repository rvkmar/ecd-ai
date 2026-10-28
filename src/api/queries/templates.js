// src/api/queries/templates.js
//
// React Query hooks for /api/templates (D126). Hooks ship with the
// collection (D48 lesson). Builder UI is D127.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../apiClient";
import { useAuth } from "../../auth/AuthProvider";
import { taskSpecsKey } from "./taskSpecs";

export const templatesKey = ["templates"];
export const templateKey = (id) => ["templates", id];
export const taskSpecPreviewKey = (id) => ["templates", id, "task-spec-preview"];

function generateTaskSpecsArg(arg) {
  if (typeof arg === "string") return { id: arg, replace: false };
  return { id: arg?.id, replace: Boolean(arg?.replace) };
}

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

export function useTaskSpecPreview(id, options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: taskSpecPreviewKey(id),
    queryFn: () => apiFetch(`/api/templates/${id}/task-spec-preview`, {}, auth),
    enabled: !!id,
    ...options,
  });
}

export function useGenerateTaskSpecsFromTemplate() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (arg) => {
      const { id, replace } = generateTaskSpecsArg(arg);
      return apiFetch(
        `/api/templates/${id}/generate-task-specs`,
        {
          method: "POST",
          ...(replace ? { body: JSON.stringify({ replace: true }) } : {}),
        },
        auth
      );
    },
    onSuccess: (_data, arg) => {
      const { id } = generateTaskSpecsArg(arg);
      queryClient.invalidateQueries({ queryKey: templatesKey });
      queryClient.invalidateQueries({ queryKey: templateKey(id) });
      queryClient.invalidateQueries({ queryKey: taskSpecPreviewKey(id) });
      queryClient.invalidateQueries({ queryKey: taskSpecsKey });
    },
  });
}

export function useDeleteTaskSpecsForTemplate() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      apiFetch(`/api/templates/${id}/task-specs`, { method: "DELETE" }, auth),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: templatesKey });
      queryClient.invalidateQueries({ queryKey: templateKey(id) });
      queryClient.invalidateQueries({ queryKey: taskSpecPreviewKey(id) });
      queryClient.invalidateQueries({ queryKey: taskSpecsKey });
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
