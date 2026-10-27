// React Query hooks for /api/deliveryModels.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../apiClient";
import { useAuth } from "../../auth/AuthProvider";

export const deliveryModelsKey = ["deliveryModels"];
export const deliveryModelKey = (id) => ["deliveryModels", id];
export const deliveryModelSessionsKey = ["sessions", "delivery-model-usage"];

export function useDeliveryModels(options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: deliveryModelsKey,
    queryFn: () => apiFetch("/api/deliveryModels", {}, auth),
    ...options,
  });
}

export function useDeliveryModel(id, options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: deliveryModelKey(id),
    queryFn: () => apiFetch(`/api/deliveryModels/${id}`, {}, auth),
    enabled: !!id,
    ...options,
  });
}

export function useSessionsForDeliveryModels(options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: deliveryModelSessionsKey,
    queryFn: () => apiFetch("/api/sessions", {}, auth),
    ...options,
  });
}

export function useCreateDeliveryModel() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      apiFetch("/api/deliveryModels", { method: "POST", body: JSON.stringify(payload) }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deliveryModelsKey }),
  });
}

export function useUpdateDeliveryModel() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) =>
      apiFetch(
        `/api/deliveryModels/${id}`,
        { method: "PUT", body: JSON.stringify(payload) },
        auth
      ),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: deliveryModelsKey });
      queryClient.invalidateQueries({ queryKey: deliveryModelKey(id) });
    },
  });
}

export function useConfirmDeliveryModel() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      apiFetch(`/api/deliveryModels/${id}/confirm`, { method: "POST" }, auth),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: deliveryModelsKey });
      queryClient.invalidateQueries({ queryKey: deliveryModelKey(id) });
    },
  });
}

export function useDeleteDeliveryModel() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiFetch(`/api/deliveryModels/${id}`, { method: "DELETE" }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deliveryModelsKey }),
  });
}
