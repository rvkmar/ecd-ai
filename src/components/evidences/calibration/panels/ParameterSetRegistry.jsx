// ParameterSetRegistry.jsx
// 🧠 Enterprise ECD — Parameter Set Registry
// ---------------------------------------------------------------
// Parameter sets are append-only: every calibration a model has ever
// received stays on file, and exactly one is active. That is the audit
// story ("which numbers scored this session, estimated by whom, from
// how many examinees?") and the rollback story ("the new calibration
// is worse — put yesterday's back").
//
// This supersedes the wizard's ParameterSetViewer, which listed sets
// but could not compare them or show what changed.
// ---------------------------------------------------------------

import React, { useMemo, useState } from "react";
import {
    AlertCircle,
    CheckCircle2,
    Clock,
    History,
    Lock,
} from "lucide-react";

import { useActivateParameterSet } from "@/api/queries/evidenceModels";
import { apiErrorMessage } from "@/api/apiClient";
import { observableParameterEntries } from "../engines/calibrationFile";
import { resolveCalibrationWindow } from "../engines/effectiveModel";
import ParameterSetDiff from "./ParameterSetDiff";
import ParameterSetReport from "./ParameterSetReport";

export default function ParameterSetRegistry({
    evidenceModel,
    statisticalModel,
    observables = [],
}) {

    const [expanded, setExpanded] = useState(null);
    const [compareWith, setCompareWith] = useState(null);

    const activateParameterSet = useActivateParameterSet();

    // Switching the active parameter set switches what scores live
    // sessions, so it is gated by the same window as recalibration:
    // the server refuses it on an operational model, and the button
    // must not pretend otherwise.
    const window_ = resolveCalibrationWindow(evidenceModel);

    const error = activateParameterSet.error
        ? apiErrorMessage(activateParameterSet.error, "Activation failed.")
        : null;

    const sets = useMemo(() => {

        return [...(statisticalModel?.parameterSets || [])].sort(
            (a, b) =>
                new Date(b.calibratedAt || 0).getTime() -
                new Date(a.calibratedAt || 0).getTime()
        );

    }, [statisticalModel]);

    const activeSet = sets.find(
        ps => ps.parameterSetId === statisticalModel?.activeParameterSetId
    );

    const handleActivate = (parameterSetId) => {
        if (!window_.open) return;
        activateParameterSet.mutate({
            id: evidenceModel.id,
            payload: {
                statisticalModelId: statisticalModel.id,
                parameterSetId,
            },
        });
    };

    /* =====================================================
       EMPTY
    ===================================================== */

    if (!statisticalModel) {
        return (
            <div className="text-sm text-slate-500">
                Select a statistical model to see its calibration history.
            </div>
        );
    }

    if (!sets.length) {

        return (

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">

                <History size={20} strokeWidth={2} className="mx-auto text-slate-400" />

                <div className="mt-3 text-sm font-medium text-slate-800">
                    No parameter sets yet
                </div>

                <div className="mx-auto mt-1 max-w-md text-xs text-slate-500">
                    This statistical model has never been calibrated. Import a
                    calibration file or a response matrix from the Calibration tab —
                    until then, inference falls back to uninformative defaults
                    (a = 1, b = 0, uniform prior).
                </div>

            </div>

        );
    }

    /* =====================================================
       UI
    ===================================================== */

    return (

        <div className="space-y-4">

            <div className="flex flex-wrap items-center justify-between gap-3">

                <div>
                    <div className="text-sm font-semibold text-slate-800">
                        Calibration History — {statisticalModel.type}
                        {statisticalModel.subtype ? ` (${statisticalModel.subtype})` : ""}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                        {sets.length} parameter set{sets.length === 1 ? "" : "s"} on file.
                        Activating a set changes scoring immediately; nothing is deleted.
                    </div>
                </div>

                {sets.length > 1 && (
                    <select
                        value={compareWith || ""}
                        onChange={(e) => setCompareWith(e.target.value || null)}
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    >
                        <option value="">Compare active against…</option>
                        {sets
                            .filter(ps => ps.parameterSetId !== activeSet?.parameterSetId)
                            .map(ps => (
                                <option key={ps.parameterSetId} value={ps.parameterSetId}>
                                    {ps.parameterSetId} — {shortDate(ps.calibratedAt)}
                                </option>
                            ))}
                    </select>
                )}

            </div>

            {!window_.open && window_.status !== "draft" && (
                <div className="flex items-start gap-3 rounded-lg border border-slate-300 bg-slate-100 px-4 py-3.5 text-sm text-slate-700">
                    <Lock size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-slate-500" />
                    <span>
                        <strong className="font-semibold">Parameter sets are read-only.</strong>{" "}
                        {window_.reason}
                        {window_.remedy && (
                            <span className="mt-1 block text-xs text-slate-600">
                                {window_.remedy}
                            </span>
                        )}
                    </span>
                </div>
            )}

            {error && (
                <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-700">
                    <AlertCircle size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
                    {error}
                </div>
            )}

            {/* ---------- comparison ---------- */}

            {compareWith && activeSet && (
                <ParameterSetDiff
                    activeSet={activeSet}
                    otherSet={sets.find(ps => ps.parameterSetId === compareWith)}
                    observables={observables}
                />
            )}

            {/* ---------- list ---------- */}

            <div className="space-y-3">

                {sets.map(ps => {

                    const isActive = ps.parameterSetId === statisticalModel.activeParameterSetId;
                    const isOpen = expanded === ps.parameterSetId;
                    const entries = observableParameterEntries(ps.parameters || {});
                    const kind = ps.parameters?._kind;

                    return (

                        <div
                            key={ps.parameterSetId}
                            className={`rounded-lg border p-4 ${isActive
                                ? "border-emerald-300 bg-emerald-50"
                                : "border-slate-200 bg-white"
                                }`}
                        >

                            <div className="flex flex-wrap items-start justify-between gap-3">

                                <div className="min-w-0">

                                    <div className="flex flex-wrap items-center gap-2">

                                        <span className="font-mono text-sm text-slate-800">
                                            {ps.parameterSetId}
                                        </span>

                                        {isActive && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                                                <CheckCircle2 size={12} strokeWidth={2.25} />
                                                Active
                                            </span>
                                        )}

                                        {!isActive && ps.status === "candidate" && (
                                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                                                Candidate
                                            </span>
                                        )}

                                        {kind && (
                                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                                {kind}
                                            </span>
                                        )}

                                    </div>

                                    <div className="mt-2 grid gap-x-6 gap-y-1 text-xs text-slate-600 sm:grid-cols-2">
                                        <div className="flex items-center gap-1.5">
                                            <Clock size={12} strokeWidth={2} className="text-slate-400" />
                                            {formatDate(ps.calibratedAt)}
                                        </div>
                                        <div>By: {ps.calibratedBy || "—"}</div>
                                        {ps.activatedAt && (
                                            <div>
                                                Activated: {formatDate(ps.activatedAt)}
                                                {ps.activatedBy ? ` by ${ps.activatedBy}` : ""}
                                            </div>
                                        )}
                                        <div>Method: {ps.calibrationMethod || "—"}</div>
                                        <div>Sample size: {ps.sampleSize ?? 0}</div>
                                        <div>Observables calibrated: {entries.length}</div>
                                        {ps.parameters?._source?.fileName && (
                                            <div className="truncate">Source: {ps.parameters._source.fileName}</div>
                                        )}
                                    </div>

                                    {ps.notes && (
                                        <div className="mt-2 text-xs text-slate-500">{ps.notes}</div>
                                    )}

                                </div>

                                <div className="flex shrink-0 gap-2">

                                    {!isActive && (
                                        <button
                                            type="button"
                                            disabled={activateParameterSet.isPending || !window_.open}
                                            title={window_.open ? undefined : window_.reason}
                                            onClick={() => handleActivate(ps.parameterSetId)}
                                            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-300 disabled:hover:bg-slate-50"
                                        >
                                            {ps.status === "candidate" ? "Activate candidate" : "Set active"}
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => setExpanded(isOpen ? null : ps.parameterSetId)}
                                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                                    >
                                        {isOpen ? "Hide" : "Inspect"}
                                    </button>

                                </div>

                            </div>

                            {isOpen && (

                                <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">

                                    <ParameterSetReport parameterSet={ps} />

                                    {ps.parameters?._fit && (
                                        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                                            <div className="font-semibold text-slate-700">Fit / test statistics</div>
                                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                                                {Object.entries(ps.parameters._fit).map(([k, v]) => (
                                                    <span key={k}>{k}: <span className="tabular-nums">{String(v)}</span></span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <pre className="max-h-80 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                                        {JSON.stringify(ps.parameters, null, 2)}
                                    </pre>

                                </div>

                            )}

                        </div>

                    );

                })}

            </div>

        </div>

    );

}

function formatDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

function shortDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
}
