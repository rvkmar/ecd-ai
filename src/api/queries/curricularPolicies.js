// src/api/queries/curricularPolicies.js
//
// React Query hooks for /api/curricularPolicies — published curriculum
// documents (NCF-style Curricular Goals -> Competencies -> Learning
// Outcomes) authored under Home → Curricular policies.
//
// Distinct from ./policies.js, which covers the adaptive item-SELECTION
// policies (fixed | IRT | BayesianNetwork | MarkovChain) that sessions
// consume. Two different meanings of the word "policy" in this domain —
// keep the query keys separate so a curriculum upload never invalidates
// (or shows up in) a session policy picker.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../apiClient";
import { useAuth } from "../../auth/AuthProvider";

export const curricularPoliciesKey = ["curricularPolicies"];

export function useCurricularPolicies(options = {}) {
  const { auth } = useAuth() || {};
  return useQuery({
    queryKey: curricularPoliciesKey,
    queryFn: () => apiFetch("/api/curricularPolicies", {}, auth),
    ...options,
  });
}

// Resolve a policy id to its full record from the already-cached list
// instead of a second network round-trip. Returns undefined while the
// list is still loading or when the id no longer exists (e.g. the policy
// was deleted after a competency model referenced it — the model keeps
// its own snapshot for exactly that case).
export function useCurricularPolicy(policyId) {
  const { data: policies } = useCurricularPolicies();
  if (!policyId) return undefined;
  return (policies || []).find((p) => p.id === policyId);
}

export function useCreateCurricularPolicy() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      apiFetch(
        "/api/curricularPolicies",
        { method: "POST", body: JSON.stringify(payload) },
        auth
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: curricularPoliciesKey }),
  });
}

export function useUpdateCurricularPolicy() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) =>
      apiFetch(
        `/api/curricularPolicies/${id}`,
        { method: "PUT", body: JSON.stringify(payload) },
        auth
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: curricularPoliciesKey }),
  });
}

export function useDeleteCurricularPolicy() {
  const { auth } = useAuth() || {};
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiFetch(`/api/curricularPolicies/${id}`, { method: "DELETE" }, auth),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: curricularPoliciesKey }),
  });
}

// ------------------------------------------------------------------
// Shared display helpers — used by both the Settings manager and
// CompetencyWizard Step 3 so a goal is labelled identically in the
// place it's uploaded and the place it's chosen.
// ------------------------------------------------------------------

export function goalLabel(goal) {
  if (!goal) return "";
  const code = (goal.code || "").trim();
  const statement = (goal.statement || "").trim();
  return code ? `${code} — ${statement}` : statement;
}

export function countPolicyNodes(policy) {
  const goals = Array.isArray(policy?.curricularGoals) ? policy.curricularGoals : [];
  const competencies = goals.reduce(
    (n, g) => n + (Array.isArray(g.competencies) ? g.competencies.length : 0),
    0
  );
  const outcomes = goals.reduce(
    (n, g) =>
      n +
      (Array.isArray(g.competencies) ? g.competencies : []).reduce(
        (m, c) => m + (Array.isArray(c.learningOutcomes) ? c.learningOutcomes.length : 0),
        0
      ),
    0
  );
  return { goals: goals.length, competencies, outcomes };
}
