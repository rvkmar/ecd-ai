import React, { useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useActivateParameterSet } from "@/api/queries/evidenceModels";
import { apiErrorMessage } from "@/api/apiClient";
import ModelCriticismPanel from "@/components/calibration/ModelCriticismPanel";
import { FitGateOverrideForm, FitGateSummary } from "@/components/evidences/calibration/panels/FitGateNotice";

export default function ParameterSetViewer({
    model,
    evidenceModelId,
    locked
}) {
    const activateParameterSet = useActivateParameterSet();
    const [overrideTarget, setOverrideTarget] = useState(null);
    const loading = activateParameterSet.isPending;
    const error = activateParameterSet.error
        ? apiErrorMessage(activateParameterSet.error, "Activation failed.")
        : null;

    if (!locked) {
        return (
            <div className="text-sm text-slate-500">
                Parameter sets available after confirmation.
            </div>
        );
    }

    // Phase 2 note: this used to hard window.location.reload() to pick up
    // the newly-active parameter set. useActivateParameterSet() invalidates
    // this evidence model's query on success instead, so the surrounding
    // wizard just re-renders with fresh data -- no full page reload, no
    // lost scroll position / wizard step.
    const handleActivate = (parameterSetId, reason) => {
        const payload = { statisticalModelId: model.id, parameterSetId };
        if (typeof reason === "string") payload.fitOverride = { reason };
        activateParameterSet.mutate(
            { id: evidenceModelId, payload },
            {
                onSuccess: () => setOverrideTarget(null),
                onError: (err) => {
                    if (err?.body?.fitGate?.status === "fail") setOverrideTarget(parameterSetId);
                },
            }
        );
    };

    return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 space-y-4">

            <div>
                <h4 className="text-sm font-semibold text-slate-800">
                    Parameter Sets — {model.type}
                </h4>
                {model.subtype && (
                    <p className="mt-1 text-xs text-slate-500">
                        Subtype: {model.subtype}
                    </p>
                )}
            </div>

            {error && (
                <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-700">
                    <AlertCircle size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
                    {error}
                </div>
            )}

            {!model.parameterSets || model.parameterSets.length === 0 ? (
                <div className="text-sm text-slate-500">
                    No parameter sets available.
                </div>
            ) : (
                <div className="space-y-3">

                    {model.parameterSets.map((ps) => {
                        const isActive =
                            ps.parameterSetId === model.activeParameterSetId;

                        return (
                            <div
                                key={ps.parameterSetId}
                                className={`rounded-md border p-3.5 space-y-2 ${isActive
                                        ? "border-emerald-300 bg-emerald-50"
                                        : "border-slate-200 bg-white"
                                    }`}
                            >

                                <div className="flex justify-between items-center">

                                    <div>
                                        <div className="text-sm font-medium text-slate-800">
                                            Parameter Set ID:
                                        </div>
                                        <div className="text-xs font-mono text-slate-600">
                                            {ps.parameterSetId}
                                        </div>
                                    </div>

                                    {isActive ? (
                                        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide bg-emerald-100 text-emerald-700">
                                            <CheckCircle2 size={12} strokeWidth={2.25} />
                                            Active
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-2">
                                            {ps.status === "candidate" && (
                                                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                                                    Candidate
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                disabled={loading}
                                                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
                                                onClick={() =>
                                                    handleActivate(ps.parameterSetId)
                                                }
                                            >
                                                {ps.status === "candidate" ? "Activate candidate" : "Set Active"}
                                            </button>
                                        </span>
                                    )}

                                </div>

                                <div className="text-xs text-slate-600 space-y-1">
                                    <div>
                                        <span className="font-medium text-slate-700">
                                            Calibrated At:
                                        </span>{" "}
                                        {ps.calibratedAt}
                                    </div>
                                    <div>
                                        <span className="font-medium text-slate-700">
                                            Calibrated By:
                                        </span>{" "}
                                        {ps.calibratedBy}
                                    </div>
                                    {ps.activatedAt && (
                                        <div>
                                            <span className="font-medium text-slate-700">
                                                Activated:
                                            </span>{" "}
                                            {ps.activatedAt}
                                            {ps.activatedBy ? ` by ${ps.activatedBy}` : ""}
                                        </div>
                                    )}
                                    <div>
                                        <span className="font-medium text-slate-700">
                                            Method:
                                        </span>{" "}
                                        {ps.calibrationMethod}
                                    </div>
                                    <div>
                                        <span className="font-medium text-slate-700">
                                            Sample Size:
                                        </span>{" "}
                                        {ps.sampleSize}
                                    </div>
                                </div>

                                <FitGateSummary fitGate={ps.fitGate} alreadyActive={isActive} />

                                {overrideTarget === ps.parameterSetId && (
                                    <FitGateOverrideForm
                                        disabled={loading}
                                        onSubmit={(reason) => handleActivate(ps.parameterSetId, reason)}
                                    />
                                )}

                                <ModelCriticismPanel
                                    fitStatistics={ps.fitStatistics}
                                    jobId={ps.calibrationJobId}
                                />

                                <details className="text-xs">
                                    <summary className="cursor-pointer text-slate-500 hover:text-slate-800">
                                        View Parameters
                                    </summary>
                                    <pre className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-700 overflow-auto">
                                        {JSON.stringify(ps.parameters, null, 2)}
                                    </pre>
                                </details>

                            </div>
                        );
                    })}

                </div>
            )}

        </div>
    );
}
