// src/components/itemBank/ItemWizard/steps/Step5Scoring.jsx
// ------------------------------------------------------------
// Step 5 — Scoring & Activation
//
// The scoring method is DERIVED from the Evidence Model's active
// statistical model and then narrowed by the Task Model blueprint. The
// activation map is where the item stops being a question and becomes
// evidence: it says which response patterns license the inference.
//
// The step this replaces rendered EvidenceActivationEditor only when
// `observable && activeStatisticalModel && scoring.method` were all
// truthy, with no explanation when they were not — so an item whose
// Evidence Model had no active statistical model showed a scoring
// selector that said "No active statistical model found" and then simply
// nothing, with Next disabled and no indication of where to go.
// ------------------------------------------------------------

import React from "react";
import { Lock, AlertTriangle, Info } from "lucide-react";
import { useItemWizard } from "../ItemWizardContext";

import ScoringMethodSelector from "../components/scoring/ScoringMethodSelector";
import EvidenceActivationEditor from "../components/scoring/EvidenceActivationEditor";
import ScoringSummaryPanel from "../components/scoring/ScoringSummaryPanel";
import LearnerFeedbackEditor from "../components/scoring/LearnerFeedbackEditor";
import { activationMapIssues } from "../../itemConstants";

export default function Step5Scoring() {
  const { item, ctx, replaceObject, updateField, canEdit, chainLoading } = useItemWizard();

  const scoring = item.scoring || {
    method: "",
    maxScore: 1,
    evidenceActivationMap: [],
  };

  const { observable, activeStatisticalModel, allowedScoringMethods } = ctx;
  const issues = activationMapIssues(scoring);

  const handleScoringChange = (updated) => {
    if (!canEdit) return;
    replaceObject("scoring", updated);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Scoring &amp; Activation
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Map response patterns onto activation of the observable, consistently
          with the statistical model that will consume them.
        </p>
      </div>

      {chainLoading && (
        <div className="text-sm text-slate-500">Loading the evidence model…</div>
      )}

      {!canEdit && (
        <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-600">
          <Lock size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
          Scoring is frozen. Clone the item to change it.
        </div>
      )}

      {!chainLoading && !activeStatisticalModel && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-800">
          <AlertTriangle size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
          <span>
            This item's Evidence Model has no active statistical model, so no
            scoring method can be derived. Activate one on the Evidence Model —
            nothing on this step can substitute for it.
          </span>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <ScoringMethodSelector
          scoring={scoring}
          activeStatisticalModel={activeStatisticalModel}
          allowedMethods={allowedScoringMethods}
          onChange={handleScoringChange}
          canEdit={canEdit}
        />

        <div className="mt-5 border-t border-slate-100 pt-5">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Maximum score
          </label>
          <input
            type="number"
            min="0"
            step="any"
            disabled={!canEdit}
            value={scoring.maxScore ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              handleScoringChange({
                ...scoring,
                // An emptied field stays empty rather than collapsing to 0.
                maxScore: raw === "" ? null : Number(raw),
              });
            }}
            className="w-32 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400"
          />
          <p className="mt-1.5 text-xs text-slate-500">
            The most any activation rule may award. Checked against the rules
            below.
          </p>
        </div>
      </div>

      {scoring.method && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <EvidenceActivationEditor
            observable={observable}
            activeStatisticalModel={activeStatisticalModel}
            scoring={scoring}
            onChange={handleScoringChange}
            canEdit={canEdit}
          />
        </div>
      )}

      {scoring.method && issues.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-800">
          <Info size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
          <div className="space-y-1">
            <div className="font-medium">
              Outstanding before this item can be confirmed
            </div>
            <ul className="list-disc space-y-0.5 pl-5">
              {issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
            <div className="pt-1 text-xs">
              None of this blocks saving a draft — you can leave and come back.
            </div>
          </div>
        </div>
      )}

      <LearnerFeedbackEditor
        item={item}
        canEdit={canEdit}
        onChange={(next) => {
          if (!canEdit) return;
          if (next && typeof next === "object") replaceObject("feedback", next);
          else updateField("feedback", null);
        }}
      />

      <ScoringSummaryPanel
        scoring={scoring}
        observable={observable}
        activeStatisticalModel={activeStatisticalModel}
      />
    </div>
  );
}
