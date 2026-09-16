// CompetencyWizard/CompetencyModelList.jsx
// 🧠 Competency Model Dashboard (Aligned with EvidenceModelList)
// ✔ Search
// ✔ Status filter
// ✔ Expandable card view
// ✔ Modal confirm (delete + confirm)
// ✔ Toast integration
// ✔ Enterprise Tailwind layout

import React, { useMemo, useState } from "react";
import Modal from "../ui/Modal";
import { openActionLabel } from "@/utils/modelActionLabel";
import LifecycleStatusBadge from "../ui/LifecycleStatusBadge";
import { canArchiveCompetencyModel, isLinkableCompetencyModel } from "@/utils/schema";

export default function CompetencyModelList({
    models = [],
    loading = false,
    onCreate,
    onEdit,
    onDelete,
    onClone,
    onArchive,
}) {
    const [expandedId, setExpandedId] = useState(null);

    const [filters, setFilters] = useState({
        status: "all",
        search: "",
    });

    const [deleteModal, setDeleteModal] = useState({
        open: false,
        model: null,
    });

    const [archiveModal, setArchiveModal] = useState({
        open: false,
        model: null,
    });

    /* =====================================================
       🔹 SORT (Most Recent First)
    ===================================================== */
    const sortedModels = useMemo(() => {
        return [...models].sort(
            (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
        );
    }, [models]);

    /* =====================================================
       🔹 FILTERING
    ===================================================== */
    const filteredModels = useMemo(() => {
        return sortedModels.filter((m) => {
            if (
                filters.status !== "all" &&
                (m.status || "draft") !== filters.status
            )
                return false;

            if (
                filters.search &&
                !m.name?.toLowerCase().includes(filters.search.toLowerCase())
            )
                return false;

            return true;
        });
    }, [sortedModels, filters]);

    /* =====================================================
       🔹 DELETE
    ===================================================== */
    const confirmDelete = async () => {
        if (!deleteModal.model || !onDelete) return;

        try {
            // onDelete (CompetencyModelBuilderPanel's handleDelete) already
            // shows its own loading -> success/error toast tied to the real
            // mutation result -- this used to *also* show an unconditional
            // "Competency model deleted." toast here regardless of whether
            // the delete actually succeeded, because it awaited onDelete's
            // return value without onDelete ever returning a real promise.
            // That produced a premature "deleted" toast followed, whenever
            // the real delete failed, by a contradictory "failed" toast a
            // moment later -- and either way this component never triggers
            // the query-cache invalidation that removes the row, so that's
            // owned entirely by onDelete's mutation now.
            await onDelete(deleteModal.model);
        } catch {
            // no-op -- onDelete's own onError already surfaced the real
            // failure reason to the user.
        }

        setDeleteModal({ open: false, model: null });
    };

    const archiveModel = async () => {
        if (!archiveModal.model || !onArchive) return;
        try {
            await onArchive(archiveModal.model);
        } catch {
            // onArchive's mutation already toasts.
        }
        setArchiveModal({ open: false, model: null });
    };

    /* =====================================================
       🔹 STATUS BADGE
    ===================================================== */
    /* =====================================================
       🔹 EMPTY
    ===================================================== */
    if (!loading && filteredModels.length === 0) {
        return (
            <div className="p-6 bg-slate-50 border rounded-xl space-y-4">
                {onCreate && (
                    <button
                        onClick={onCreate}
                        className="px-4 py-2 bg-blue-600 text-white rounded"
                    >
                        + New Student Model
                    </button>
                )}
                <p className="text-sm text-slate-500">
                    No competency models found.
                </p>
            </div>
        );
    }

    /* =====================================================
       🔹 RENDER
    ===================================================== */
    return (
        <div className="space-y-6">
            {/* Header Controls */}
            <div className="flex flex-wrap items-center gap-3">
                <input
                    type="text"
                    placeholder="Search models..."
                    value={filters.search}
                    onChange={(e) =>
                        setFilters({ ...filters, search: e.target.value })
                    }
                    className="border px-3 py-1.5 rounded text-sm"
                />

                {/* <select
                    value={filters.status}
                    onChange={(e) =>
                        setFilters({ ...filters, status: e.target.value })
                    }
                    className="border px-3 py-1.5 rounded text-sm"
                >
                    <option value="all">All Status</option>
                    <option value="draft">Draft</option>
                    <option value="confirmed">Confirmed</option>
                </select> */}

                {onCreate && (
                    <button
                        onClick={onCreate}
                        className="ml-auto px-4 py-1.5 bg-blue-600 text-white rounded text-sm"
                    >
                        + New Student Model
                    </button>
                )}
            </div>

            {/* ---------------- CARD VIEW ---------------- */}
            {filteredModels.map((m) => {
                    const expanded = expandedId === m.id;

                    return (
                        <div
                            key={m.id}
                            className="border rounded-xl bg-white shadow-sm"
                        >
                            <div
                                className="p-4 cursor-pointer relative"
                                onClick={() =>
                                    setExpandedId(expanded ? null : m.id)
                                }
                            >
                                <span className="absolute top-3 right-3">
                                    <LifecycleStatusBadge status={m.status} />
                                </span>

                                <h3 className="font-semibold">
                                    {expanded ? "▾" : "▸"} {m.name}
                                </h3>

                                <div className="text-xs mt-1 text-slate-500">
                                    Version {m.versionNumber || 1}
                                </div>
                            </div>

                            {expanded && (
                                <div className="px-6 pb-4 space-y-3 text-sm">
                                    <div>
                                        <strong>Description:</strong>{" "}
                                        {m.description || "—"}
                                    </div>

                                    <div className="flex gap-2 pt-2">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onEdit?.(m);
                                            }}
                                            className="bg-cyan-600 text-white px-3 py-1 rounded"
                                        >
                                            {openActionLabel(m)}
                                        </button>

                                        {!m.locked && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDeleteModal({
                                                            open: true,
                                                            model: m,
                                                        });
                                                    }}
                                                    className="bg-red-600 text-white px-3 py-1 rounded"
                                                >
                                                    Delete
                                                </button>
                                            </>
                                        )}

                                        {isLinkableCompetencyModel(m) && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onClone?.(m);
                                                }}
                                                className="bg-purple-600 text-white px-3 py-1 rounded"
                                            >
                                                Clone
                                            </button>
                                        )}

                                        {canArchiveCompetencyModel(m) && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setArchiveModal({
                                                        open: true,
                                                        model: m,
                                                    });
                                                }}
                                                className="bg-slate-800 text-white px-3 py-1 rounded"
                                            >
                                                Archive
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

            {/* DELETE MODAL */}
            <Modal
                isOpen={deleteModal.open}
                onClose={() =>
                    setDeleteModal({ open: false, model: null })
                }
                onConfirm={confirmDelete}
                title="Delete Student Model"
                message="Delete this draft model?"
                confirmClass="bg-red-600 text-white"
            />

            <Modal
                isOpen={archiveModal.open}
                onClose={() =>
                    setArchiveModal({ open: false, model: null })
                }
                onConfirm={archiveModel}
                title="Archive Student Model"
                message="This withdraws the model as a parent for new Evidence Models. Existing structure is kept. Continue?"
                confirmLabel="Archive"
                confirmClass="bg-slate-800 text-white"
            />
        </div>
    );
}
