// src/api/queries/taskSpecs.js
//
// React Query hooks for /api/taskSpecs (D151). Read-only: specs are
// generated, not authored. Family generation is
// POST /api/templates/:id/generate-task-specs (D152).

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../apiClient";
import { useAuth } from "../../auth/AuthProvider";

export const taskSpecsKey = ["taskSpecs"];
export const taskSpecKey = (id) => ["taskSpecs", id];

export function useTaskSpecs(options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: taskSpecsKey,
    queryFn: () => apiFetch("/api/taskSpecs", {}, auth),
    ...options,
  });
}

export function useTaskSpec(id, options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: taskSpecKey(id),
    queryFn: () => apiFetch(`/api/taskSpecs/${id}`, {}, auth),
    enabled: !!id,
    ...options,
  });
}
