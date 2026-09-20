// src/api/queries/auditLog.js
// React Query hooks for /api/auditLog. Read-only — entries are produced
// by the persistence path (D101), never authored via POST.

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../apiClient";
import { useAuth } from "../../auth/AuthProvider";

export const auditLogKey = ["auditLog"];
export const auditLogEntryKey = (id) => ["auditLog", id];

export function useAuditLog(filters = {}, options = {}) {
  const { auth } = useAuth() || {};
  const params = new URLSearchParams();
  if (filters.entityCollection) params.set("entityCollection", filters.entityCollection);
  if (filters.entityId) params.set("entityId", filters.entityId);
  if (filters.action) params.set("action", filters.action);
  if (filters.actor) params.set("actor", filters.actor);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const qs = params.toString() ? `?${params}` : "";
  return useQuery({
    queryKey: [...auditLogKey, filters],
    queryFn: () => apiFetch(`/api/auditLog${qs}`, {}, auth),
    ...options,
  });
}

export function useAuditLogEntry(id, options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: auditLogEntryKey(id),
    queryFn: () => apiFetch(`/api/auditLog/${id}`, {}, auth),
    enabled: Boolean(id),
    ...options,
  });
}
