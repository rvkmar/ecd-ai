// src/api/queries/items.js
//
// React Query hooks for /api/items.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../apiClient";
import { useAuth } from "../../auth/AuthProvider";

export const itemsKey = ["items"];
export const itemKey = (id) => ["items", id];
export const itemDependentsKey = (id) => ["items", id, "dependents"];

/* Filters are sent to the server rather than applied in the browser.
   `useItems()` with no argument keeps the previous whole-collection
   behaviour and the previous cache key, so existing callers are
   unaffected; a filtered call gets its own key. */
function filterQueryString(filters = {}) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (Array.isArray(value)) {
      value.forEach((v) => params.append(key, v));
    } else {
      params.append(key, value);
    }
  });

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useItems(filters = {}, options = {}) {
  const { auth } = useAuth() || {};
  const qs = filterQueryString(filters);

  return useQuery({
    queryKey: qs ? [...itemsKey, qs] : itemsKey,
    queryFn: () => apiFetch(`/api/items${qs}`, {}, auth),
    ...options,
  });
}

export function useItem(itemId, options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: itemKey(itemId),
    queryFn: () => apiFetch(`/api/items/${itemId}`, {}, auth),
    enabled: !!itemId,
    ...options,
  });
}

/* What a suspension or archival of this item would break. Asked before
   the UI offers the force option, so the warning names real sessions
   instead of describing the possibility of some. */
export function useItemDependents(itemId, options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: itemDependentsKey(itemId),
    queryFn: () => apiFetch(`/api/items/${itemId}/dependents`, {}, auth),
    enabled: !!itemId,
    ...options,
  });
}

export function useCreateItem() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      apiFetch("/api/items", { method: "POST", body: JSON.stringify(payload) }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: itemsKey }),
  });
}

export function useUpdateItem() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) =>
      apiFetch(`/api/items/${id}`, { method: "PUT", body: JSON.stringify(payload) }, auth),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: itemsKey });
      queryClient.invalidateQueries({ queryKey: itemKey(id) });
    },
  });
}

export function useDeleteItem() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiFetch(`/api/items/${id}`, { method: "DELETE" }, auth),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: itemsKey });
      queryClient.invalidateQueries({ queryKey: ["taskModels"] });
    },
  });
}

export function useTransitionItemLifecycle() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, nextStatus, force = false }) =>
      apiFetch(
        `/api/items/${id}/lifecycle`,
        { method: "PATCH", body: JSON.stringify({ nextStatus, force }) },
        auth
      ),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: itemsKey });
      queryClient.invalidateQueries({ queryKey: itemKey(id) });
      queryClient.invalidateQueries({ queryKey: itemDependentsKey(id) });
      // Activating or retiring an item changes whether the Task Model it
      // instantiates is itself activatable, and the Task Model list
      // renders that. Without this the two views disagreed until a
      // manual refresh.
      queryClient.invalidateQueries({ queryKey: ["taskModels"] });
    },
  });
}

/* Read-only preflight: reports exactly what confirming this item would
   say, from the same validators the transition runs. */
export function useSimulateItem() {
  const { auth } = useAuth() || {};
  return useMutation({
    mutationFn: (id) => apiFetch(`/api/items/${id}/simulate`, {}, auth),
  });
}

export function useCloneItem() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiFetch(`/api/items/${id}/clone`, { method: "POST" }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: itemsKey }),
  });
}

export function useCalibrateItem() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, irtParams }) =>
      apiFetch(
        `/api/items/${id}/calibrate`,
        { method: "POST", body: JSON.stringify(irtParams) },
        auth
      ),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: itemsKey });
      queryClient.invalidateQueries({ queryKey: itemKey(id) });
    },
  });
}

/* Records a delivery against the item's exposure budget, auto-suspending
   it on exhaustion. `usageCount` has been read by the dashboard, the
   exposure filter and the auto-retire rule since the beginning with
   nothing ever incrementing it; this is the write side. */
export function useRecordItemUsage() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, count = 1 }) =>
      apiFetch(
        `/api/items/${id}/record-usage`,
        { method: "POST", body: JSON.stringify({ count }) },
        auth
      ),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: itemsKey });
      queryClient.invalidateQueries({ queryKey: itemKey(id) });
    },
  });
}
