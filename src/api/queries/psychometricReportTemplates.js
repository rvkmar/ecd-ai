// React Query hooks for /api/psychometricReportTemplates.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../apiClient";
import { useAuth } from "../../auth/AuthProvider";

export const psychometricReportTemplatesKey = ["psychometricReportTemplates"];
export const psychometricReportTemplateKey = (id) => ["psychometricReportTemplates", id];

export function usePsychometricReportTemplates(options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: psychometricReportTemplatesKey,
    queryFn: () => apiFetch("/api/psychometricReportTemplates", {}, auth),
    ...options,
  });
}

export function usePsychometricReportTemplate(id, options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: psychometricReportTemplateKey(id),
    queryFn: () => apiFetch(`/api/psychometricReportTemplates/${id}`, {}, auth),
    enabled: Boolean(id),
    ...options,
  });
}

export function useCreatePsychometricReportTemplate() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      apiFetch("/api/psychometricReportTemplates", { method: "POST", body: JSON.stringify(payload) }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: psychometricReportTemplatesKey }),
  });
}

export function useUpdatePsychometricReportTemplate() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) =>
      apiFetch(`/api/psychometricReportTemplates/${id}`, { method: "PUT", body: JSON.stringify(payload) }, auth),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: psychometricReportTemplatesKey });
      queryClient.invalidateQueries({ queryKey: psychometricReportTemplateKey(variables?.id) });
    },
  });
}

export function useTransitionPsychometricReportTemplate() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) =>
      apiFetch(`/api/psychometricReportTemplates/${id}`, { method: "PUT", body: JSON.stringify({ status }) }, auth),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: psychometricReportTemplatesKey });
      queryClient.invalidateQueries({ queryKey: psychometricReportTemplateKey(variables?.id) });
    },
  });
}

export function useDeletePsychometricReportTemplate() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiFetch(`/api/psychometricReportTemplates/${id}`, { method: "DELETE" }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: psychometricReportTemplatesKey }),
  });
}
