// CompetencyWizard/components/PriorDistributionEditor.jsx
// Edit SMV prior families (TR9 distribution over claims).

import React from "react";
import {
  priorFamiliesForSmVariableType,
  PRIOR_DISTRIBUTION_PARAM_SPECS,
  isSmVariablePriorComplete,
} from "@/utils/ecdVocabulary";
import { useCompetencyWizard } from "../CompetencyWizardContext";

const AUTHORING_PROMPTS = {
  bernoulli_p: {
    question:
      "Before any items are scored, what share of your target population do you expect already masters this attribute?",
    hint: "Use pilot rates, curriculum expectations, or a conservative 0.3–0.5 if unknown. 0 = nobody masters a priori; 1 = everyone does.",
  },
  dirichlet_alpha: {
    question:
      "For each state below, how strongly do you expect that claim before seeing responses?",
    hint: "Enter one positive concentration weight per state (same order as the state list). All 1s = equal prior. Larger α on a state puts more prior mass on that claim.",
  },
  beta: {
    question:
      "How certain are you about the mastery rate before evidence arrives?",
    hint: "Alpha and beta are soft counts for mastery vs non-mastery. Larger values = stronger prior belief around alpha/(alpha+beta).",
  },
  normal: {
    question:
      "Where should proficiency θ sit before any items are scored?",
    hint: "Usual IRT default: mean 0, sd 1 on a standardized scale.",
  },
  uniform: {
    question:
      "What flat range of θ is plausible before evidence?",
    hint: "Min and max should match (or sit inside) the continuous scale declared above.",
  },
};

function defaultParamsForFamily(family, smv) {
  const nextSpecs = PRIOR_DISTRIBUTION_PARAM_SPECS[family] || [];
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
  return nextParams;
}

function Prompt({ question, hint }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 space-y-1">
      <p className="text-xs font-medium text-slate-800">{question}</p>
      <p className="text-[11px] leading-snug text-slate-500">{hint}</p>
    </div>
  );
}

export default function PriorDistributionEditor() {
  const { model, competencies, updateSmVariablePrior } = useCompetencyWizard();
  const isLocked = model?.locked;
  const smVariables = model?.smVariables || [];
  const competencyById = new Map(competencies.map((c) => [c.id, c]));

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
          claims. Structural completeness requires each prior below to be
          complete (family + params). Answer the authoring questions; defaults
          are starting points, not finished judgments.
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
        const complete = isSmVariablePriorComplete({
          ...smv,
          priorDistribution: { family, params },
        });
        const states = Array.isArray(smv.scale?.states) ? smv.scale.states : [];
        const competency = competencyById.get(smv.id);
        const stateLabels =
          competency?.states?.map((s) => s.label || s.value) || states;

        return (
          <div
            key={smv.id}
            className={`rounded-lg border p-4 space-y-3 ${
              complete
                ? "border-slate-200 bg-slate-50/60"
                : "border-amber-300 bg-amber-50/40"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-semibold text-slate-800">
                {smv.label}{" "}
                <span className="text-xs font-normal text-slate-500">
                  ({smv.type})
                </span>
              </div>
              <span
                className={`shrink-0 text-[11px] font-medium ${
                  complete ? "text-emerald-700" : "text-amber-800"
                }`}
              >
                {complete ? "Prior complete" : "Prior incomplete"}
              </span>
            </div>

            <label className="block text-xs font-medium text-slate-600">
              Family
              <select
                disabled={isLocked}
                value={family}
                onChange={(e) => {
                  const nextFamily = e.target.value;
                  updateSmVariablePrior(smv.id, {
                    family: nextFamily,
                    params: defaultParamsForFamily(nextFamily, smv),
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

            {family === "bernoulli" && (
              <div className="space-y-2">
                <Prompt {...AUTHORING_PROMPTS.bernoulli_p} />
                <label className="block text-xs font-medium text-slate-600">
                  Probability of Mastery (p)
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    max={1}
                    disabled={isLocked}
                    value={params.p ?? ""}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      updateSmVariablePrior(smv.id, {
                        family,
                        params: {
                          ...params,
                          p: Number.isFinite(n) ? n : params.p,
                        },
                      });
                    }}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </label>
              </div>
            )}

            {family === "dirichlet" && (
              <div className="space-y-2">
                <Prompt {...AUTHORING_PROMPTS.dirichlet_alpha} />
                {states.length < 2 ? (
                  <p className="text-xs text-amber-800">
                    Define at least two states above before setting the
                    concentration vector.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {states.map((stateValue, i) => {
                      const alpha = Array.isArray(params.alpha)
                        ? params.alpha
                        : [];
                      const label = stateLabels[i] || String(stateValue);
                      return (
                        <label
                          key={`${smv.id}-alpha-${i}`}
                          className="block text-xs font-medium text-slate-600"
                        >
                          Concentration for “{label}”
                          <input
                            type="number"
                            step="any"
                            min={0.0001}
                            disabled={isLocked}
                            value={alpha[i] ?? ""}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              const next = states.map((_, j) =>
                                j === i
                                  ? Number.isFinite(n) && n > 0
                                    ? n
                                    : alpha[j] ?? 1
                                  : alpha[j] ?? 1
                              );
                              updateSmVariablePrior(smv.id, {
                                family,
                                params: { ...params, alpha: next },
                              });
                            }}
                            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                          />
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {family !== "bernoulli" && family !== "dirichlet" && (
              <div className="space-y-2">
                {AUTHORING_PROMPTS[family] && (
                  <Prompt {...AUTHORING_PROMPTS[family]} />
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  {specs.map((spec) => (
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
                              [spec.key]: Number.isFinite(n)
                                ? n
                                : params[spec.key],
                            },
                          });
                        }}
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
