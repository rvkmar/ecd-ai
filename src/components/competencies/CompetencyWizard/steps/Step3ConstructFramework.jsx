// CompetencyWizard/steps/Step3ConstructFramework.jsx
// 🟢 Step 3 — Construct Framework
//
// Grounds the Student Model in a curriculum document. The author picks
// a policy by name from the curricular policies uploaded under
// Settings > Policies > Curricular Policies (JSON, NCF-style:
// curricular goals -> competencies -> learning outcomes), then selects
// one or more curricular goals from that policy. The free-text
// Reference / Citation / Notes fields remain for frameworks that aren't
// (yet) uploaded as a policy document.
//
// Storage note: the selection writes BOTH a live reference (`policyId`)
// and a snapshot (`policyName`, `curricularGoals`) into
// model.constructFramework. The snapshot is what keeps a confirmed
// model's provenance readable if the source policy is later edited or
// deleted — the same reason evidence models snapshot competency labels.

import React, { useMemo } from "react";
import { Info, AlertTriangle, BookOpen } from "lucide-react";
import { useCompetencyWizard } from "../CompetencyWizardContext";
import { useCurricularPolicies, goalLabel } from "@/api/queries/curricularPolicies";

// The auto-filled Framework Reference for a policy. Kept in one place so
// the "is this reference still the auto-filled one, or did the author
// type over it?" check below can't drift from what we actually wrote.
function referenceForPolicy(policy) {
  if (!policy) return "";
  const bits = [policy.name];
  if (policy.subject) bits.push(policy.subject);
  if (policy.stage) bits.push(policy.stage);
  const base = bits.filter(Boolean).join(" — ");
  return policy.version ? `${base} (v${policy.version})` : base;
}

export default function Step3ConstructFramework() {
  const { model, updateConstructFramework, patchConstructFramework } =
    useCompetencyWizard();

  const framework = model?.constructFramework || {};
  const isLocked = model?.locked;

  const { data: policies = [], isLoading, isError } = useCurricularPolicies();

  const selectedPolicy = useMemo(
    () => policies.find((p) => p.id === framework.policyId),
    [policies, framework.policyId]
  );

  // A model can reference a policy that has since been deleted (deletion is
  // only blocked for confirmed/locked models). Fall back to the snapshot the
  // model saved at selection time rather than silently rendering an empty
  // dropdown as if nothing had ever been chosen.
  const policyMissing = !!framework.policyId && !isLoading && !selectedPolicy;

  const availableGoals = useMemo(() => {
    if (selectedPolicy) {
      return Array.isArray(selectedPolicy.curricularGoals)
        ? selectedPolicy.curricularGoals
        : [];
    }
    if (policyMissing) {
      return Array.isArray(framework.curricularGoals) ? framework.curricularGoals : [];
    }
    return [];
  }, [selectedPolicy, policyMissing, framework.curricularGoals]);

  const selectedCodes = Array.isArray(framework.curricularGoalCodes)
    ? framework.curricularGoalCodes
    : [];

  function handlePolicyChange(e) {
    const nextId = e.target.value;
    const nextPolicy = policies.find((p) => p.id === nextId);

    // Only overwrite Framework Reference when the author hasn't written
    // their own — an empty field, or a value we auto-filled from the
    // previously selected policy. Never clobber typed prose.
    const currentReference = (framework.reference || "").trim();
    const previousAutoReference = referenceForPolicy(
      policies.find((p) => p.id === framework.policyId)
    );
    const referenceIsOurs =
      currentReference === "" || currentReference === previousAutoReference;

    const patch = {
      policyId: nextPolicy ? nextPolicy.id : "",
      policyName: nextPolicy ? nextPolicy.name : "",
      // Changing policy must clear the old policy's goals in the SAME
      // commit — goal codes are only meaningful inside their own policy.
      curricularGoalCodes: [],
      curricularGoals: [],
    };

    if (referenceIsOurs) {
      patch.reference = nextPolicy ? referenceForPolicy(nextPolicy) : "";
    }

    patchConstructFramework(patch);
  }

  function toggleGoal(goal) {
    const code = goal?.code;
    if (!code) return;

    const isSelected = selectedCodes.includes(code);
    const nextCodes = isSelected
      ? selectedCodes.filter((c) => c !== code)
      : [...selectedCodes, code];

    // Rebuild the snapshot from the policy's own goal order so the saved
    // list reads in document order regardless of click order.
    const nextGoals = availableGoals
      .filter((g) => nextCodes.includes(g.code))
      .map((g) => ({
        code: g.code,
        statement: g.statement,
        competencies: Array.isArray(g.competencies) ? g.competencies : [],
      }));

    patchConstructFramework({
      curricularGoalCodes: nextGoals.map((g) => g.code),
      curricularGoals: nextGoals,
    });
  }

  const goalPickerDisabled = isLocked || (!selectedPolicy && !policyMissing);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Step 3 — Construct Framework
        </h2>
        <p className="mt-1 text-sm text-slate-500 max-w-3xl">
          Ground this Student Model in a curriculum document. Select the policy and the
          curricular goal(s) it addresses, then add any citation or theoretical rationale.
          While optional, an explicit reference strengthens interpretive validity and
          transparency.
        </p>
      </div>

      {/* Curricular grounding */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 space-y-6">
        {/* Policy Name */}
        <div>
          <label
            htmlFor="cf-policy"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Policy Name
          </label>
          <select
            id="cf-policy"
            value={framework.policyId || ""}
            onChange={handlePolicyChange}
            disabled={isLocked || isLoading}
            className="w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            <option value="">
              {isLoading ? "Loading policies…" : "— No curricular policy —"}
            </option>
            {policies.map((p) => (
              <option key={p.id} value={p.id}>
                {[p.name, p.subject, p.stage].filter(Boolean).join(" — ")}
                {p.version ? ` (v${p.version})` : ""}
              </option>
            ))}
          </select>

          {isError && (
            <p className="mt-1.5 text-xs text-red-600">
              Could not load curricular policies. You can still fill in the free-text fields
              below.
            </p>
          )}

          {!isLoading && !isError && policies.length === 0 && (
            <p className="mt-1.5 text-xs text-slate-500">
              No curricular policies have been uploaded yet. An administrator can add them
              under <span className="font-medium">Settings → Policies → Curricular
              Policies</span> by uploading a JSON curriculum document.
            </p>
          )}

          {policyMissing && (
            <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <p>
                The policy this model was grounded in
                {framework.policyName ? ` ("${framework.policyName}")` : ""} is no longer
                available. The goals saved with this model are shown below and remain part of
                its record; choose another policy to re-ground it.
              </p>
            </div>
          )}
        </div>

        {/* Curricular Goals */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <label className="block text-sm font-medium text-slate-700">
              Curricular Goal(s)
            </label>
            {selectedCodes.length > 0 && (
              <span className="text-xs text-slate-500">
                {selectedCodes.length} selected
              </span>
            )}
          </div>

          {goalPickerDisabled && !isLocked ? (
            <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3.5 py-4 text-sm text-slate-500">
              Select a policy above to choose its curricular goals.
            </p>
          ) : availableGoals.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3.5 py-4 text-sm text-slate-500">
              This policy has no curricular goals.
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto rounded-md border border-slate-300 divide-y divide-slate-200">
              {availableGoals.map((goal) => {
                const checked = selectedCodes.includes(goal.code);
                const competencyCount = Array.isArray(goal.competencies)
                  ? goal.competencies.length
                  : 0;

                return (
                  <li key={goal.code}>
                    <label
                      className={`flex items-start gap-3 px-3.5 py-3 text-sm transition ${
                        isLocked
                          ? "cursor-not-allowed opacity-70"
                          : "cursor-pointer hover:bg-slate-50"
                      } ${checked ? "bg-slate-50" : "bg-white"}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleGoal(goal)}
                        disabled={isLocked}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20 disabled:cursor-not-allowed"
                      />
                      <span className="min-w-0">
                        <span className="block text-slate-900">{goalLabel(goal)}</span>
                        {competencyCount > 0 && (
                          <span className="mt-0.5 block text-xs text-slate-500">
                            {competencyCount} framework competency(ies)
                            {checked && (
                              <>
                                {" — "}
                                {goal.competencies
                                  .map((c) => c.code)
                                  .filter(Boolean)
                                  .join(", ")}
                              </>
                            )}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-1.5 text-xs text-slate-500">
            Selected goals are saved with this model, including their framework competencies,
            so the grounding stays readable even if the policy changes later.
          </p>
        </div>
      </div>

      {/* Free-text framework fields */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 space-y-6">
        {/* Framework Reference */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Framework Reference
          </label>
          <input
            type="text"
            value={framework.reference || ""}
            onChange={(e) => updateConstructFramework("reference", e.target.value)}
            placeholder="e.g., Common Core State Standards — Grade 8 Mathematics"
            disabled={isLocked}
            className="w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
          />
          <p className="mt-1.5 text-xs text-slate-500">
            Auto-filled from the selected policy; edit freely, or use it on its own for a
            framework that hasn't been uploaded as a policy.
          </p>
        </div>

        {/* Academic Citation */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Academic Citation
          </label>
          <textarea
            value={framework.citation || ""}
            onChange={(e) => updateConstructFramework("citation", e.target.value)}
            placeholder="Provide formal citation if applicable (APA/MLA/etc.)"
            rows={3}
            disabled={isLocked}
            className="w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition resize-y placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
          />
        </div>

        {/* Theoretical Notes */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Notes / Theoretical Rationale
          </label>
          <textarea
            value={framework.notes || ""}
            onChange={(e) => updateConstructFramework("notes", e.target.value)}
            placeholder="Describe how the construct is conceptualized, decomposed, or structured."
            rows={5}
            disabled={isLocked}
            className="w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition resize-y placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      {/* Selected grounding summary */}
      {selectedCodes.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <BookOpen size={15} strokeWidth={2} />
            Grounded in {framework.policyName || "the selected policy"}
          </div>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {(framework.curricularGoals || []).map((g) => (
              <li key={g.code} className="flex gap-2">
                <span className="font-mono text-xs text-slate-500 shrink-0 pt-0.5">
                  {g.code}
                </span>
                <span>{g.statement}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Informational Panel */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3.5 text-sm text-blue-800">
        <Info size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
        <p>
          <strong>ECD Principle:</strong> The Student Model should be grounded in a
          defensible theoretical or curricular framework. Explicit documentation enhances
          interpretability and supports validity arguments.
        </p>
      </div>
    </div>
  );
}
