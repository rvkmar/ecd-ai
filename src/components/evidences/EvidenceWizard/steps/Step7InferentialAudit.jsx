// Step7InferentialAudit.jsx
// Enterprise ECD — Step 7: Inferential Audit
// Pipeline audit: Warrant → Observable → EvidenceRule → Model → Claim
// plus TR9 evaluation procedures + fairness / DIF authoring gates.

import { useMemo, useEffect } from "react";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { useEvidenceWizardContext } from "../EvidenceWizardContext";
import { validateEntity } from "../../../../utils/schema";
import InferentialTraceGraph from "../components/InferentialTraceGraph";

const EVAL_METHODS = ["key", "rubric", "auto", "process_log"];
const DIF_STATUSES = ["pending", "pass", "fail", "na"];

const DEFAULT_DIF = [
  { id: "dif_gender", prompt: "Gender DIF review planned or completed for bound items?", status: "pending" },
  { id: "dif_language", prompt: "Language-load / translation review completed?", status: "pending" },
  { id: "dif_access", prompt: "Accessibility / sensory-motor demands reviewed?", status: "pending" },
];

export default function Step7InferentialAudit({ db, onValidityChange }) {

  const {
    draftModel,
    selectedCompetency,
    selectedModelMeta,
    updateField,
  } = useEvidenceWizardContext();

  const observables = draftModel?.observables || [];
  const warrants = draftModel?.warrants || [];
  const evidenceRules = draftModel?.evidenceRules || [];
  const models = draftModel?.statisticalModels || [];
  const evaluationProcedures = draftModel?.evaluationProcedures || [];
  const difReviewChecklist = draftModel?.difReviewChecklist?.length
    ? draftModel.difReviewChecklist
    : DEFAULT_DIF;

  const schemaAudit = useMemo(() => {
    if (!draftModel) return null;
    return validateEntity("evidenceModels", draftModel, db);
  }, [draftModel, db]);

  const inferentialAudit = useMemo(() => {
    const issues = [];
    observables.forEach((obs) => {
      const warrant = warrants.find((w) => w.id === obs.warrantId);
      const rule = evidenceRules.find((r) => r.observableId === obs.id);
      if (!warrant) issues.push(`Observable ${obs.id} not linked to valid warrant`);
      if (!rule) {
        issues.push(`Observable ${obs.id} missing EvidenceRule`);
        return;
      }
      if (!rule.justification?.includes("warrant") && !warrant) {
        issues.push(`Observable ${obs.id} has weak inferential justification`);
      }
      if (rule.direction === "neutral") {
        issues.push(`Observable ${obs.id} contributes no directional evidence`);
      }
    });
    return { valid: issues.length === 0, issues };
  }, [observables, warrants, evidenceRules]);

  const modelAudit = useMemo(() => {
    const issues = [];
    evidenceRules.forEach((rule) => {
      if (rule.direction === "weakens" && models.some((m) => m.type === "irt")) {
        issues.push(`IRT does not support 'weakens' directly (observable ${rule.observableId})`);
      }
      if (rule.direction === "neutral" && models.some((m) => m.type === "irt")) {
        issues.push(`Neutral evidence ignored in IRT (observable ${rule.observableId})`);
      }
    });
    return { valid: issues.length === 0, issues };
  }, [evidenceRules, models]);

  const enterpriseAudit = useMemo(() => {
    const issues = [];
    const byObs = new Map();
    evaluationProcedures.forEach((p) => {
      if (!p?.observableId) return;
      byObs.set(p.observableId, (byObs.get(p.observableId) || 0) + 1);
    });
    observables.forEach((obs) => {
      const n = byObs.get(obs.id) || 0;
      if (n === 0) issues.push(`Observable ${obs.id} needs an evaluationProcedure (TR9 evaluation component).`);
      if (n > 1) issues.push(`Observable ${obs.id} has ${n} evaluationProcedures; keep exactly one.`);
    });
    evaluationProcedures.forEach((p) => {
      if (p.observableId && !observables.some((o) => o.id === p.observableId)) {
        issues.push(`evaluationProcedure ${p.id || "?"} cites unknown observable ${p.observableId}.`);
      }
      if (!p.method || !EVAL_METHODS.includes(p.method)) {
        issues.push(`evaluationProcedure ${p.id || "?"} needs method: key|rubric|auto|process_log.`);
      }
      if (!p.workProductType) {
        issues.push(`evaluationProcedure ${p.id || "?"} needs workProductType.`);
      }
      if (!p.description || String(p.description).trim().length < 10) {
        issues.push(`evaluationProcedure ${p.id || "?"} needs a meaningful description.`);
      }
    });
    if (!draftModel?.fairnessNotes || String(draftModel.fairnessNotes).trim().length < 20) {
      issues.push("fairnessNotes must be at least 20 characters before leaving this step.");
    }
    if (difReviewChecklist.length < 3) {
      issues.push("difReviewChecklist needs at least 3 entries.");
    }
    return { valid: issues.length === 0, issues };
  }, [observables, evaluationProcedures, draftModel?.fairnessNotes, difReviewChecklist]);

  const allErrors = [
    ...(schemaAudit?.errors || []),
    ...inferentialAudit.issues,
    ...modelAudit.issues,
    ...enterpriseAudit.issues,
  ];

  const isValid =
    schemaAudit?.valid &&
    inferentialAudit.valid &&
    modelAudit.valid &&
    enterpriseAudit.valid;

  useEffect(() => {
    if (onValidityChange) onValidityChange(isValid);
  }, [isValid, onValidityChange]);

  useEffect(() => {
    if (!draftModel?.difReviewChecklist?.length) {
      updateField("difReviewChecklist", DEFAULT_DIF);
    }
  }, []);

  useEffect(() => {
    if (!observables.length) return;
    const existing = draftModel?.evaluationProcedures || [];
    const byObs = new Map(existing.map((p) => [p.observableId, p]));
    let changed = false;
    const next = observables.map((obs) => {
      if (byObs.has(obs.id)) return byObs.get(obs.id);
      changed = true;
      return {
        id: `ep_${obs.id}`,
        observableId: obs.id,
        workProductType: obs.type === "selected_response" ? "mcq_selection" : obs.type || "work_product",
        method: obs.type === "performance" ? "process_log" : obs.type === "constructed_response" ? "rubric" : "key",
        description: "",
        artifactRef: "",
      };
    });
    if (changed || next.length !== existing.length) {
      updateField("evaluationProcedures", next);
    }
  }, [observables.map((o) => o.id).join("|")]);

  function patchProcedure(observableId, patch) {
    const next = (draftModel?.evaluationProcedures || []).map((p) =>
      p.observableId === observableId ? { ...p, ...patch } : p
    );
    updateField("evaluationProcedures", next);
  }

  function patchDif(id, patch) {
    const next = difReviewChecklist.map((row) =>
      row.id === id ? { ...row, ...patch } : row
    );
    updateField("difReviewChecklist", next);
  }

  const Section = ({ title, items, color }) => (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-5">
      <div className={`text-sm font-semibold mb-2 ${color}`}>
        {title} ({items.length})
      </div>
      {items.length === 0 ? (
        <div className="flex items-center gap-1.5 text-emerald-700 text-sm">
          <CheckCircle2 size={14} strokeWidth={2.25} />
          No issues
        </div>
      ) : (
        <ul className="space-y-2 text-sm text-red-600">
          {items.map((e, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <AlertTriangle size={14} strokeWidth={2.25} className="mt-0.5 shrink-0" />
              {e}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const fieldClass =
    "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400";

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Inferential Audit</h2>
        <p className="mt-1 text-sm text-slate-500">
          Validates structural integrity, inferential reasoning, statistical compatibility,
          and TR9 evaluation / fairness authoring.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm">
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
          <div className="text-slate-500">Competency</div>
          <div className="font-medium text-slate-900">{selectedCompetency?.name || "—"}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
          <div className="text-slate-500">Model</div>
          <div className="font-medium text-slate-900">{selectedModelMeta?.modelName || "—"}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
          <div className="text-slate-500">Version</div>
          <div className="font-medium text-slate-900">v{draftModel?.versionNumber}</div>
        </div>
      </div>

      <div className={`flex items-start gap-3 rounded-lg border px-4 py-3.5 text-sm ${isValid ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
        {isValid ? (
          <CheckCircle2 size={18} strokeWidth={2.25} className="mt-0.5 shrink-0" />
        ) : (
          <XCircle size={18} strokeWidth={2.25} className="mt-0.5 shrink-0" />
        )}
        <div>
          <div className="font-semibold">{isValid ? "PASSED" : "FAILED"}</div>
          <div className="mt-1">
            {isValid ? "Inferential model is valid." : `${allErrors.length} issues detected`}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Section title="Schema Integrity" items={schemaAudit?.errors || []} color="text-blue-600" />
        <Section title="Inferential Logic" items={inferentialAudit.issues} color="text-purple-600" />
        <Section title="Model Compatibility" items={modelAudit.issues} color="text-orange-600" />
        <Section title="Evaluation & Fairness" items={enterpriseAudit.issues} color="text-teal-700" />
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Evaluation procedures (TR9 §2.3.2)</h3>
          <p className="mt-1 text-xs text-slate-500">
            How each Work Product becomes an Observable Variable value (key, rubric, auto, or process log).
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-3 font-medium">Observable</th>
                <th className="py-2 pr-3 font-medium">Work product</th>
                <th className="py-2 pr-3 font-medium">Method</th>
                <th className="py-2 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {observables.map((obs) => {
                const proc = (draftModel?.evaluationProcedures || []).find((p) => p.observableId === obs.id) || {};
                return (
                  <tr key={obs.id} className="border-b border-slate-100 align-top">
                    <td className="py-2 pr-3 font-mono text-xs text-slate-700">{obs.id}</td>
                    <td className="py-2 pr-3">
                      <input
                        className={fieldClass}
                        value={proc.workProductType || ""}
                        onChange={(e) => patchProcedure(obs.id, { workProductType: e.target.value })}
                        placeholder="e.g. mcq_selection"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        className={fieldClass}
                        value={proc.method || ""}
                        onChange={(e) => patchProcedure(obs.id, { method: e.target.value })}
                      >
                        <option value="">Select…</option>
                        {EVAL_METHODS.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2">
                      <textarea
                        className={fieldClass}
                        rows={2}
                        value={proc.description || ""}
                        onChange={(e) => patchProcedure(obs.id, { description: e.target.value })}
                        placeholder="How values are determined from the work product"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Fairness notes & DIF checklist</h3>
          <p className="mt-1 text-xs text-slate-500">
            Confirmation requires completed DIF rows (pass / fail / na). Pending is allowed while drafting.
          </p>
        </div>
        <textarea
          className={fieldClass}
          rows={3}
          value={draftModel?.fairnessNotes || ""}
          onChange={(e) => updateField("fairnessNotes", e.target.value)}
          placeholder="Residual fairness risks accepted for this Evidence Model and how they are mitigated…"
        />
        <ul className="space-y-3">
          {difReviewChecklist.map((row) => (
            <li key={row.id} className="grid gap-2 sm:grid-cols-[1fr_140px] items-start">
              <div>
                <div className="text-sm text-slate-800">{row.prompt}</div>
                <input
                  className={`${fieldClass} mt-1`}
                  value={row.note || ""}
                  onChange={(e) => patchDif(row.id, { note: e.target.value })}
                  placeholder="Optional note"
                />
              </div>
              <select
                className={fieldClass}
                value={row.status || "pending"}
                onChange={(e) => patchDif(row.id, { status: e.target.value })}
              >
                {DIF_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">Calibration plan (draft)</h3>
        <p className="text-xs text-slate-500">
          Drafts cannot store parameterSets. Record the intended pilot here; attach calibrated sets after confirmation.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            className={fieldClass}
            type="number"
            min={1}
            placeholder="Pilot sample size"
            value={draftModel?.calibrationPlan?.pilotSampleSize ?? ""}
            onChange={(e) =>
              updateField("calibrationPlan", {
                ...(draftModel?.calibrationPlan || {}),
                pilotSampleSize: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
          <input
            className={fieldClass}
            placeholder="Method (e.g. MML, MCMC)"
            value={draftModel?.calibrationPlan?.method || ""}
            onChange={(e) =>
              updateField("calibrationPlan", {
                ...(draftModel?.calibrationPlan || {}),
                method: e.target.value,
              })
            }
          />
          <input
            className={fieldClass}
            placeholder="Package hint (e.g. mirt, GDINA)"
            value={draftModel?.calibrationPlan?.packageHint || ""}
            onChange={(e) =>
              updateField("calibrationPlan", {
                ...(draftModel?.calibrationPlan || {}),
                packageHint: e.target.value,
              })
            }
          />
          <input
            className={fieldClass}
            placeholder="Target fit notes"
            value={draftModel?.calibrationPlan?.targetFitNotes || ""}
            onChange={(e) =>
              updateField("calibrationPlan", {
                ...(draftModel?.calibrationPlan || {}),
                targetFitNotes: e.target.value,
              })
            }
          />
        </div>
      </div>

      <InferentialTraceGraph draftModel={draftModel} />

      {!isValid && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-700">
          <AlertTriangle size={18} strokeWidth={2.25} className="mt-0.5 shrink-0" />
          Cannot proceed until all inferential and enterprise authoring issues are resolved.
        </div>
      )}
    </div>
  );
}
