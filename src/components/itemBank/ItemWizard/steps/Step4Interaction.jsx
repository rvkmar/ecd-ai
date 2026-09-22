// src/components/itemBank/ItemWizard/steps/Step4Interaction.jsx
// ------------------------------------------------------------
// Step 4 — Interaction
//
// How the response is captured, constrained by BOTH the observable's
// response mode and the Task Model blueprint's whitelist.
//
// The step this replaces passed `allowedTypes={null}` to
// ResponseComponentEditor with the comment "Blueprint restriction hook
// (future)", while src/utils/schema.js was enforcing the blueprint
// whitelist on the server the whole time. So the picker offered types the
// write would reject, and the rejection arrived as an opaque toast on
// save. The constraint is applied at the point of choice now.
//
// It also displayed "Observable requires interaction type: <observable
// type>" -- literally true of the old equality rule, and literally
// impossible to satisfy, since no interaction type is ever equal to an
// observable type. See src/utils/ecdVocabulary.js.
// ------------------------------------------------------------

import React from "react";
import { Lock, Info, AlertTriangle } from "lucide-react";
import { useItemWizard } from "../ItemWizardContext";
import ResponseComponentEditor from "../components/ResponseComponentEditor";
import { interactionLabel } from "../../itemConstants";
import { interactionCompatibilityMessage } from "@/utils/ecdVocabulary";

export default function Step4Interaction() {
  const { item, ctx, replaceObject, canEdit, chainLoading } = useItemWizard();

  const interaction = item.interaction || {
    type: "",
    responseComponents: [],
    config: {},
  };

  const { observable, allowedInteractionTypes, observableInteractions } = ctx;

  if (!observable && !chainLoading) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-800">
        <AlertTriangle size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
        No observable is resolved, so no interaction can be checked against it.
        Return to Instantiation.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Interaction</h2>
        <p className="mt-1 text-sm text-slate-500">
          How the examinee's response is captured. The interaction has to be
          able to elicit the observable — that is a compatibility relation, not
          an equality.
        </p>
      </div>

      {chainLoading && (
        <div className="text-sm text-slate-500">Loading observable definition…</div>
      )}

      {!canEdit && (
        <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm text-slate-600">
          <Lock size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
          The interaction is frozen. Clone the item to change it.
        </div>
      )}

      {observable && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3.5 text-sm text-blue-800">
          <Info size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
          <div className="space-y-1">
            <div>
              This observable captures a{" "}
              <strong className="font-semibold">{observable.type}</strong>.
            </div>
            <div>
              Interactions that can elicit it:{" "}
              <strong className="font-semibold">
                {observableInteractions.map(interactionLabel).join(", ") || "none"}
              </strong>
              {allowedInteractionTypes.length !== observableInteractions.length && (
                <>
                  {" "}— narrowed by the Task Model blueprint to{" "}
                  <strong className="font-semibold">
                    {allowedInteractionTypes.map(interactionLabel).join(", ") ||
                      "nothing"}
                  </strong>
                </>
              )}
              .
            </div>
          </div>
        </div>
      )}

      {allowedInteractionTypes.length === 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-700">
          <AlertTriangle size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
          <span>
            {observableInteractions.length === 0
              ? interactionCompatibilityMessage(observable?.type, null)
              : "The Task Model blueprint permits no interaction that can elicit this observable. Fix the contradiction on the Task Model."}
          </span>
        </div>
      )}

      <ResponseComponentEditor
        interaction={interaction}
        onChange={(updated) => canEdit && replaceObject("interaction", updated)}
        canEdit={canEdit && allowedInteractionTypes.length > 0}
        observableType={observable?.type || null}
        allowedTypes={allowedInteractionTypes}
      />

      <div className="border-t border-slate-200 pt-4 text-xs text-slate-400">
        Interaction structure defines the response format only. Which responses
        count as evidence is authored on the next step.
      </div>
    </div>
  );
}
