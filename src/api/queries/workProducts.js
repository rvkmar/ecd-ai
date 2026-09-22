// src/api/queries/workProducts.js
//
// React Query hooks for /api/workProducts (D121). Library records: no CAF
// transition mutation. Item / EM binding screens may follow; hooks ship
// with the collection (D48 lesson).

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../apiClient";
import { useAuth } from "../../auth/AuthProvider";

export const workProductsKey = ["workProducts"];
export const workProductKey = (id) => ["workProducts", id];

export function useWorkProducts(options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: workProductsKey,
    queryFn: () => apiFetch("/api/workProducts", {}, auth),
    ...options,
  });
}

export function useWorkProduct(id, options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: workProductKey(id),
    queryFn: () => apiFetch(`/api/workProducts/${id}`, {}, auth),
    enabled: !!id,
    ...options,
  });
}

export function useCreateWorkProduct() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      apiFetch(
        "/api/workProducts",
        { method: "POST", body: JSON.stringify(payload) },
        auth
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workProductsKey }),
  });
}

export function useUpdateWorkProduct() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) =>
      apiFetch(
        `/api/workProducts/${id}`,
        { method: "PUT", body: JSON.stringify(payload) },
        auth
      ),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: workProductsKey });
      queryClient.invalidateQueries({ queryKey: workProductKey(id) });
    },
  });
}

export function useDeleteWorkProduct() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      apiFetch(`/api/workProducts/${id}`, { method: "DELETE" }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workProductsKey }),
  });
}
