// src/api/queries/competencies.js
//
// React Query hooks for /api/competencies and /api/competencies/models.
// Two distinct resources share one backend router: competency MODELS
// (the framework/container, with draft -> confirmed -> locked lifecycle)
// and flat COMPETENCIES (individual construct definitions that belong to
// a model). Both are exposed here since almost every consumer in the app
// ends up needing both.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../apiClient";
import { useAuth } from "../../auth/AuthProvider";

export const competencyModelsKey = ["competencyModels"];
export const competencyModelKey = (id) => ["competencyModels", id];
export const competenciesKey = ["competencies"];

/* ============================= Models ============================= */

export function useCompetencyModels(options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: competencyModelsKey,
    queryFn: () => apiFetch("/api/competencies/models", {}, auth),
    ...options,
  });
}

export function useCompetencyModel(modelId, options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: competencyModelKey(modelId),
    queryFn: () => apiFetch(`/api/competencies/models/${modelId}`, {}, auth),
    enabled: !!modelId,
    ...options,
  });
}

export function useCreateCompetencyModel() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      apiFetch("/api/competencies/models", { method: "POST", body: JSON.stringify(payload) }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: competencyModelsKey }),
  });
}

export function useUpdateCompetencyModel() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) =>
      apiFetch(`/api/competencies/models/${id}`, { method: "PUT", body: JSON.stringify(payload) }, auth),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: competencyModelsKey });
      queryClient.invalidateQueries({ queryKey: competencyModelKey(id) });
    },
  });
}

export function useConfirmCompetencyModel() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiFetch(`/api/competencies/models/${id}/confirm`, { method: "POST" }, auth),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: competencyModelsKey });
      queryClient.invalidateQueries({ queryKey: competencyModelKey(id) });
    },
  });
}

export function useCloneCompetencyModel() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiFetch(`/api/competencies/models/${id}/clone`, { method: "POST" }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: competencyModelsKey }),
  });
}

export function useArchiveCompetencyModel() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiFetch(`/api/competencies/models/${id}/archive`, { method: "POST" }, auth),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: competencyModelsKey });
      queryClient.invalidateQueries({ queryKey: competencyModelKey(id) });
    },
  });
}

export function useDeleteCompetencyModel() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiFetch(`/api/competencies/models/${id}`, { method: "DELETE" }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: competencyModelsKey }),
  });
}

/* =========================== Competencies =========================== */
// Flat list -- every model's individual competencies in one array. Several
// components (EvidenceModelList, TaskModelList, TaskModelBuilder,
// StepIdentity, TaskDetails) already fetched this same endpoint
// independently just to do a client-side lookup by id/modelId; they all
// now share this one cached query instead.

export function useCompetencies(options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: competenciesKey,
    queryFn: () => apiFetch("/api/competencies", {}, auth),
    ...options,
  });
}

export function useCreateCompetency() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      apiFetch("/api/competencies", { method: "POST", body: JSON.stringify(payload) }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: competenciesKey }),
  });
}

export function useUpdateCompetency() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) =>
      apiFetch(`/api/competencies/${id}`, { method: "PUT", body: JSON.stringify(payload) }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: competenciesKey }),
  });
}

export function useDeleteCompetency() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiFetch(`/api/competencies/${id}`, { method: "DELETE" }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: competenciesKey }),
  });
}
