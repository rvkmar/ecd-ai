// src/components/policies/CurricularPolicyManager.jsx
// ------------------------------------------------------------------
// Admin → Home → Curricular policies.
//
// A curricular policy is a published curriculum document (e.g. NCF-SE
// 2023) authored as:
//   Curricular Goals -> Competencies -> Learning Outcomes
// Once saved it becomes selectable in CompetencyWizard Step 3
// (Construct Framework): policy name dropdown + curricular goal
// multi-select.
//
// Sibling of PolicyManager.jsx, which manages the *other* kind of policy
// in this app — adaptive item-selection policies consumed by sessions.
// The two are intentionally separate collections; see
// server/routes/curricularPoliciesRoutes.js for why.
// ------------------------------------------------------------------

import React, { useState } from "react";
import { ChevronDown, ChevronRight, BookOpen } from "lucide-react";
import toast from "react-hot-toast";

import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthProvider";
import { apiErrorMessage } from "@/api/apiClient";
import {
  useCurricularPolicies,
  useDeleteCurricularPolicy,
  countPolicyNodes,
} from "@/api/queries/curricularPolicies";
import CurricularPolicyForm from "./CurricularPolicyForm";

function GoalTree({ policy }) {
  const goals = Array.isArray(policy.curricularGoals) ? policy.curricularGoals : [];

  if (goals.length === 0) {
    return <p className="text-xs text-muted-foreground">No curricular goals in this policy.</p>;
  }

  return (
    <ol className="space-y-3">
      {goals.map((goal, gi) => (
        <li key={goal.code || gi} className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="text-sm font-medium">
            <span className="font-mono text-xs text-muted-foreground mr-2">{goal.code}</span>
            {goal.statement}
          </div>

          {Array.isArray(goal.competencies) && goal.competencies.length > 0 && (
            <ul className="mt-2 space-y-1.5 pl-3 border-l border-border">
              {goal.competencies.map((comp, ci) => (
                <li key={comp.code || ci} className="text-xs">
                  <div>
                    <span className="font-mono text-muted-foreground mr-2">{comp.code}</span>
                    {comp.statement}
                  </div>
                  {Array.isArray(comp.learningOutcomes) && comp.learningOutcomes.length > 0 && (
                    <ul className="mt-1 pl-4 list-disc text-muted-foreground space-y-0.5">
                      {comp.learningOutcomes.map((lo, li) => (
                        <li key={li}>{lo}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

export function CurricularPolicyManager() {
  const { auth } = useAuth() || {};
  const role = auth?.role;
  const isAdmin = role === "admin";

  const { data: policies = [], isLoading } = useCurricularPolicies();
  const deletePolicy = useDeleteCurricularPolicy();

  const [expandedId, setExpandedId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  async function handleConfirmDelete() {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;

    try {
      // mutateAsync (not fire-and-forget mutate) so the toast below reflects
      // the real outcome — the server returns 409 when a confirmed or locked
      // Student Model still references this policy, and that message is
      // the whole point of showing it to the admin.
      await deletePolicy.mutateAsync(target.id);
      toast.success("Curricular policy deleted.");
    } catch (err) {
      console.error("Error deleting curricular policy:", err);
      toast.error(apiErrorMessage(err, "Failed to delete curricular policy."));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Curricular Policies</h2>
        <p className="text-sm text-muted-foreground">
          Published curriculum documents expressed as curricular goals, their competencies, and
          learning outcomes. Saved policies become selectable in the Student Model wizard
          at <span className="font-medium">Step 3 — Construct Framework</span>, where an author
          picks a policy by name and then the curricular goal(s) the model is grounded in.
        </p>
      </div>

      {isAdmin && !showForm && (
        <Button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
        >
          New curricular policy
        </Button>
      )}

      {isAdmin && showForm && (
        <CurricularPolicyForm
          policy={editing}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}

      <div className="rounded-xl border border-border">
        <div className="px-4 py-3 border-b border-border text-sm font-medium">
          Curricular policies {policies.length > 0 && `(${policies.length})`}
        </div>

        {isLoading ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Loading curricular policies…</p>
        ) : policies.length === 0 ? (
          <div className="px-4 py-8 text-center space-y-1">
            <BookOpen size={20} className="mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No curricular policies yet.</p>
            <p className="text-xs text-muted-foreground">
              {isAdmin
                ? "Write one above to make it selectable in the Student Model wizard."
                : "Ask an administrator to author a curriculum document."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {policies.map((p) => {
              const counts = countPolicyNodes(p);
              const isOpen = expandedId === p.id;

              return (
                <li key={p.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isOpen ? null : p.id)}
                      className="flex items-start gap-2 text-left min-w-0 flex-1"
                    >
                      {isOpen ? (
                        <ChevronDown size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0">
                        <span className="block text-sm font-medium truncate">{p.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {[p.issuingBody, p.subject, p.stage, p.version && `v${p.version}`]
                            .filter(Boolean)
                            .join(" · ") || "No metadata"}
                        </span>
                        <span className="block text-xs text-muted-foreground mt-0.5">
                          {counts.goals} goal(s) · {counts.competencies} competency(ies) ·{" "}
                          {counts.outcomes} learning outcome(s)
                          {p.updatedAt
                            ? ` · updated ${new Date(p.updatedAt).toLocaleDateString()}`
                            : ""}
                        </span>
                      </span>
                    </button>

                    {isAdmin ? (
                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditing(p);
                            setShowForm(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setPendingDelete(p)}
                          disabled={deletePolicy.isPending}
                        >
                          Delete
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground shrink-0">Read-only</span>
                    )}
                  </div>

                  {isOpen && (
                    <div className="mt-3 pl-6">
                      {p.description && (
                        <p className="text-xs text-muted-foreground mb-3">{p.description}</p>
                      )}
                      <GoalTree policy={p} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Modal
        isOpen={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Curricular Policy"
        message={
          pendingDelete
            ? `Delete "${pendingDelete.name}"? Student Models already grounded in it keep their saved policy name and goals, but the policy will no longer be selectable. This cannot be undone.`
            : ""
        }
        confirmClass="bg-red-500 hover:bg-red-600 text-white"
      />
    </div>
  );
}

export default CurricularPolicyManager;
