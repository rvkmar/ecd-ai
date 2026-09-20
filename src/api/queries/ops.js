// src/api/queries/ops.js
// D105: admin ops health summary + alerts.

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../apiClient";
import { useAuth } from "../../auth/AuthProvider";

export const opsHealthKey = ["ops", "health-summary"];
export const opsAlertsKey = ["ops", "alerts"];

export function useOpsHealthSummary(options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: opsHealthKey,
    queryFn: () => apiFetch("/api/ops/health-summary", {}, auth),
    refetchInterval: 30_000,
    ...options,
  });
}

export function useOpsAlerts(options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: opsAlertsKey,
    queryFn: () => apiFetch("/api/ops/alerts", {}, auth),
    refetchInterval: 30_000,
    ...options,
  });
}
