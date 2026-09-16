// CompetencyWizard/components/PriorDistributionEditor.jsx
// Edit SMV prior families (TR9 distribution over claims).

import React from "react";
import {
  priorFamiliesForSmVariableType,
  PRIOR_DISTRIBUTION_PARAM_SPECS,
} from "@/utils/ecdVocabulary";
import { useCompetencyWizard } from "../CompetencyWizardContext";

export default function PriorDistributionEditor() {
  const { model, competencies, updateSmVariablePrior } = useCompetencyWizard();
  const isLocked = model?.locked;
  const smVariables = model?.smVariables || [];

  if (!competencies.length) {
    return (
      <p className="text-sm text-slate-500">
        Define latent variables before setting prior distributions.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">
          Prior distributions (SMV claim distribution)
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          PADI TR9 §2.3.1 — Student Model Variables carry a distribution over
          claims. Priors sync from competencies; adjust family/params here.
        </p>
      </div>

      {smVariables.length === 0 && (
        <p className="text-sm text-amber-700">
          SMVs will appear after each competency has a variable type (auto-synced).
        </p>
      )}

      {smVariables.map((smv) => {
        const families = priorFamiliesForSmVariableType(smv.type);
        const family = smv.priorDistribution?.family || families[0];
        const params = smv.priorDistribution?.params || {};
        const specs = PRIOR_DISTRIBUTION_PARAM_SPECS[family] || [];

        return (
          <div
            key={smv.id}
            className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-3"
          >
            <div className="text-sm font-semibold text-slate-800">
              {smv.label}{" "}
              <span className="text-xs font-normal text-slate-500">
                ({smv.type})
              </span>
            </div>

            <label className="block text-xs font-medium text-slate-600">
              Family
              <select
                disabled={isLocked}
                value={family}
                onChange={(e) => {
                  const nextFamily = e.target.value;
                  const nextSpecs = PRIOR_DISTRIBUTION_PARAM_SPECS[nextFamily] || [];
                  const nextParams = {};
                  nextSpecs.forEach((s) => {
                    if (s.isArray) {
                      const n = Array.isArray(smv.scale?.states)
                        ? smv.scale.states.length
                        : 2;
                      nextParams[s.key] = Array.from({ length: Math.max(2, n) }, () => 1);
                    } else if (s.key === "p") nextParams.p = 0.5;
                    else if (s.key === "mean") nextParams.mean = 0;
                    else if (s.key === "sd") nextParams.sd = 1;
                    else if (s.key === "min") nextParams.min = -3;
                    else if (s.key === "max") nextParams.max = 3;
                    else if (s.key === "alpha" && !s.isArray) nextParams.alpha = 1;
                    else if (s.key === "beta") nextParams.beta = 1;
                  });
                  updateSmVariablePrior(smv.id, {
                    family: nextFamily,
                    params: nextParams,
                  });
                }}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {families.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-2 sm:grid-cols-2">
              {specs.map((spec) => {
                if (spec.isArray) {
                  const arr = Array.isArray(params[spec.key])
                    ? params[spec.key]
                    : [];
                  return (
                    <label
                      key={spec.key}
                      className="block text-xs font-medium text-slate-600 sm:col-span-2"
                    >
                      {spec.label} (comma-separated)
                      <input
                        disabled={isLocked}
                        value={arr.join(", ")}
                        onChange={(e) => {
                          const next = e.target.value
                            .split(",")
                            .map((x) => Number(x.trim()))
                            .filter((n) => Number.isFinite(n));
                          updateSmVariablePrior(smv.id, {
                            family,
                            params: { ...params, [spec.key]: next },
                          });
                        }}
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                  );
                }
                return (
                  <label
                    key={spec.key}
                    className="block text-xs font-medium text-slate-600"
                  >
                    {spec.label}
                    <input
                      type="number"
                      step="any"
                      disabled={isLocked}
                      value={params[spec.key] ?? ""}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        updateSmVariablePrior(smv.id, {
                          family,
                          params: {
                            ...params,
                            [spec.key]: Number.isFinite(n) ? n : params[spec.key],
                          },
                        });
                      }}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
