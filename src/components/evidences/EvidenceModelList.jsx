// src/components/evidenceModels/EvidenceModelList.jsx

import React, { useMemo, useState } from "react";
import Modal from "../ui/Modal";
import {
    useEvidenceModels,
    useDeleteEvidenceModel,
    useCloneEvidenceModel,
} from "@/api/queries/evidenceModels";
import { useCompetencies, useCompetencyModels } from "@/api/queries/competencies";
import { openActionLabel } from "@/utils/modelActionLabel";
import LifecycleStatusBadge from "../ui/LifecycleStatusBadge";

export default function EvidenceModelList({
    onEdit,
    onDelete,
    onPromote,
    onCalibrate,
}) {

    const [expandedId, setExpandedId] = useState(null);

    const [filters, setFilters] = useState({
        status: "all",
    });

    const [deleteModal, setDeleteModal] = useState({
        open: false,
        model: null,
    });

    /* =====================================================
       Load Evidence + Competency Metadata (shared caches)
    ===================================================== */

    const { data: models = [], isLoading: loading } = useEvidenceModels();
    const { data: competencies = [] } = useCompetencies();
    const { data: competencyModels = [] } = useCompetencyModels();

    const deleteEvidenceModel = useDeleteEvidenceModel();
    const cloneEvidenceModel = useCloneEvidenceModel();

    /* =====================================================
       Lookup Maps
    ===================================================== */

    const competencyLookup = useMemo(() => {
        const map = {};
        competencies.forEach(c => {
            map[c.id] = c;
        });
        return map;
    }, [competencies]);

    const competencyModelLookup = useMemo(() => {
        const map = {};
        competencyModels.forEach(m => {
            map[m.id] = m;
        });
        return map;
    }, [competencyModels]);

    /* =====================================================
       Filtering
    ===================================================== */

    const filteredModels = useMemo(() => {
        return models.filter((m) => {
            if (
                filters.status !== "all" &&
                (m.status || "draft") !== filters.status
            ) return false;

            return true;
        });
    }, [models, filters]);

    /* =====================================================
       Delete
    ===================================================== */

    const confirmDelete = () => {

        if (!deleteModal.model) return;
        const id = deleteModal.model.id;

        deleteEvidenceModel.mutate(id, {
            onSuccess: () => onDelete?.(id),
        });

        setDeleteModal({ open: false, model: null });
    };

    /* =====================================================
       Version Alignment Check
    ===================================================== */

    const isVersionAligned = (evidence) => {

        const comp = competencyLookup[evidence.competencyId];
        if (!comp) return false;

        const model = competencyModelLookup[comp.modelId];
        if (!model) return false;

        return evidence.competencyModelVersion === model.versionNumber;
    };

    /* =====================================================
       Governance / Calibration Helpers
    ===================================================== */

    const resolveCompetency = (m) => {
        const comp = competencyLookup[m.competencyId];
        if (!comp) {
            return { name: "⚠️ Missing Competency", _missing: true };
        }
        return comp;
    };

    const getCalibrationStatus = (m) => {
        const activeModel = m.statisticalModels?.find((sm) => sm.active);

        if (!activeModel) return "No Active Model";
        if (!activeModel.parameterSets?.length) return "Not Calibrated";
        if (!activeModel.activeParameterSetId) return "No Active Params";
        if (!m.decisionRule) return "No Decision Rule";
        if (m.status === "operational") return "Operational";
        return "Ready";
    };

    const calibrationStatusColor = (status) => {
        if (status === "Operational" || status === "Ready") return "bg-green-100 text-green-700";
        if (status === "Not Calibrated") return "bg-yellow-100 text-yellow-700";
        if (status === "No Decision Rule" || status === "No Active Params") return "bg-orange-100 text-orange-700";
        return "bg-gray-100 text-gray-700";
    };

    /* =====================================================
       UI
    ===================================================== */

    if (loading) {
        return <p>Loading evidence models…</p>;
    }

    if (!models.length) {
        return (
            <p className="text-sm text-gray-500">
                No evidence models defined yet.
            </p>
        );
    }

    return (
        <div className="space-y-6">

            {/* ---------------- Controls ---------------- */}
            <div className="flex gap-3 items-center">

                <select
                    value={filters.status}
                    onChange={(e) =>
                        setFilters({ status: e.target.value })
                    }
                    className="border rounded px-2 py-1"
                >
                    <option value="all">All Status</option>
                    <option value="draft">Draft</option>
                    <option value="reviewed">Reviewed</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="operational">Operational</option>
                    <option value="suspended">Suspended</option>
                    <option value="archived">Archived</option>
                </select>
            </div>

            {/* ===================================================== */}
            {/* CARD VIEW */}
            {/* ===================================================== */}

            {filteredModels.map((m) => {

                    const expanded = expandedId === m.id;
                    const comp = resolveCompetency(m);
                    const model = comp?._missing
                        ? null
                        : competencyModelLookup[comp.modelId];

                    const aligned = isVersionAligned(m);
                    const calibrationStatus = getCalibrationStatus(m);

                    return (
                        <div
                            key={m.id}
                            className="border rounded-lg bg-white shadow-sm"
                        >

                            <div
                                className="p-5 cursor-pointer relative"
                                onClick={() =>
                                    setExpandedId(
                                        expanded ? null : m.id
                                    )
                                }
                            >
                                {/* Status Badge */}
                                <LifecycleStatusBadge
                                    status={m.status}
                                    className="absolute top-4 right-4"
                                />

                                <h3 className="font-semibold text-lg">
                                    {expanded ? "▾" : "▸"}{" "}
                                    {m.name || "Untitled Evidence Model"}
                                </h3>

                                <div className="text-sm mt-2 space-y-1">
                                    <div>
                                        <strong>Competency:</strong>{" "}
                                        {comp?.name || "—"}
                                    </div>

                                    <div>
                                        <strong>Model Version:</strong>{" "}
                                        {model?.versionNumber
                                            ? `v${model.versionNumber}`
                                            : "—"}
                                    </div>

                                    <div>
                                        <strong>Version Aligned:</strong>{" "}
                                        {aligned
                                            ? "Yes"
                                            : "Mismatch ⚠️"}
                                    </div>

                                    {m.locked && (
                                        <div>
                                            <strong>Calibration:</strong>{" "}
                                            <span className={`px-2 py-0.5 text-xs rounded ${calibrationStatusColor(calibrationStatus)}`}>
                                                {calibrationStatus}
                                            </span>
                                        </div>
                                    )}

                                    <div>
                                        Warrants: {m.warrants?.length || 0} |
                                        Observables: {m.observables?.length || 0}
                                    </div>
                                </div>

                                {comp?._missing && (
                                    <div className="text-red-600 text-xs mt-2">
                                        ⚠️ This evidence model is not linked to a valid competency.
                                    </div>
                                )}
                            </div>

                            {expanded && (
                                <div className="px-6 pb-5 text-sm space-y-4">

                                    <div>
                                        <strong>Claim:</strong>{" "}
                                        {m.claimStatement || "—"}
                                    </div>

                                    <div>
                                        <strong>Statistical Models:</strong>{" "}
                                        {m.statisticalModels?.length || 0}
                                    </div>

                                    <div className="flex gap-3 pt-3">

                                        {!m.locked && (
                                            <>
                                                <button
                                                    onClick={() => onEdit?.(m)}
                                                    className="bg-blue-600 text-white px-3 py-1 rounded"
                                                >
                                                    {openActionLabel(m)}
                                                </button>

                                                <button
                                                    onClick={() =>
                                                        setDeleteModal({
                                                            open: true,
                                                            model: m,
                                                        })
                                                    }
                                                    className="bg-red-500 text-white px-3 py-1 rounded"
                                                >
                                                    Delete
                                                </button>
                                            </>
                                        )}

                                        {m.locked && (
                                            <>
                                                <button
                                                    onClick={() => onEdit?.(m)}
                                                    className="bg-blue-600 text-white px-3 py-1 rounded"
                                                >
                                                    View
                                                </button>

                                                <button
                                                    onClick={() => onCalibrate?.(m)}
                                                    className="bg-indigo-600 text-white px-3 py-1 rounded"
                                                >
                                                    Evidence Model parameters
                                                </button>

                                                <button
                                                    onClick={() =>
                                                        cloneEvidenceModel.mutate(m.id)
                                                    }
                                                    className="bg-purple-600 text-white px-3 py-1 rounded"
                                                >
                                                    Clone
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

            {/* ---------------- Delete Modal ---------------- */}
            <Modal
                isOpen={deleteModal.open}
                onClose={() =>
                    setDeleteModal({ open: false, model: null })
                }
                onConfirm={confirmDelete}
                title="Delete Evidence Model"
                message="Delete this draft model?"
                confirmClass="bg-red-600 text-white"
            />

        </div>
    );
}