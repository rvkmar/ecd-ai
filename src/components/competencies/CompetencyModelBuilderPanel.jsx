// src/components/competencies/CompetencyModelBuilderPanel.jsx
// ------------------------------------------------------------
// Competency Model Builder — full management console
// ------------------------------------------------------------
// Same role as itemBank/ItemBuilder.jsx: reached via the top-level
// "Operate Competency Model" tab. Self-contained -- owns its own
// list/create/edit mode so the full-screen wizard can replace this
// panel entirely (matching ItemBuilder's early-return "only the
// wizard is shown" pattern). Completely independent from the
// top-level Dashboard/List/Create sub-nav in
// CompetencyModelBuilder.jsx -- clicking "+ New Competency Model"
// here never touches that outer nav state.
// ------------------------------------------------------------

import React, { useState } from "react";
import toast from "react-hot-toast";
import { Plus } from "lucide-react";

import CompetencyModelList from "./CompetencyModelList";
import CompetencyWizard from "./CompetencyWizard/CompetencyWizard";
import { CompetencyWizardProvider } from "./CompetencyWizard/CompetencyWizardContext";
import { apiErrorMessage } from "@/api/apiClient";
import {
    useCompetencyModels,
    useDeleteCompetencyModel,
    useCloneCompetencyModel,
    useArchiveCompetencyModel,
} from "@/api/queries/competencies";
import { isLinkableCompetencyModel, canArchiveCompetencyModel } from "@/utils/schema";

export default function CompetencyModelBuilderPanel() {
    const [mode, setMode] = useState("list"); // list | create | edit
    const [selectedModelId, setSelectedModelId] = useState(null);

    const { data: models = [], isLoading: loading } = useCompetencyModels();
    const deleteCompetencyModel = useDeleteCompetencyModel();
    const cloneCompetencyModel = useCloneCompetencyModel();
    const archiveCompetencyModel = useArchiveCompetencyModel();

    function handleCreate() {
        setSelectedModelId(null);
        setMode("create");
    }

    function handleEdit(model) {
        setSelectedModelId(model.id);
        setMode("edit");
    }

    function handleDelete(model) {
        if (model.locked) return Promise.resolve();

        const toastId = toast.loading("Deleting model...");

        // mutateAsync (not mutate) so this returns a real promise that
        // resolves/rejects with the actual delete outcome. CompetencyModelList
        // awaits this same promise before closing its confirmation modal --
        // it used to call the fire-and-forget .mutate() here, which returns
        // undefined, so the list's own `await onDelete(...)` resolved
        // instantly regardless of whether the delete had even reached the
        // server yet, let alone succeeded.
        return deleteCompetencyModel.mutateAsync(model.id, {
            onSuccess: () => toast.success("Model deleted.", { id: toastId }),
            onError: (err) =>
                toast.error(apiErrorMessage(err, "Delete failed."), { id: toastId }),
        });
    }

    function handleArchive(model) {
        if (!canArchiveCompetencyModel(model)) {
            toast.error("Only a confirmed competency model can be archived.");
            return Promise.resolve();
        }

        const toastId = toast.loading("Archiving model...");
        return archiveCompetencyModel.mutateAsync(model.id, {
            onSuccess: () => toast.success("Model archived.", { id: toastId }),
            onError: (err) =>
                toast.error(apiErrorMessage(err, "Archive failed."), { id: toastId }),
        });
    }

    function handleClone(model) {
        if (!isLinkableCompetencyModel(model)) {
            toast.error("Only locked, non-archived competency models can be cloned.");
            return;
        }

        const toastId = toast.loading("Cloning model...");

        cloneCompetencyModel.mutate(model.id, {
            onSuccess: (cloned) => {
                toast.success("Model cloned successfully.", { id: toastId });
                // 🔥 Immediately open wizard in edit mode for cloned model
                setSelectedModelId(cloned.id);
                setMode("edit");
            },
            onError: (err) =>
                toast.error(apiErrorMessage(err, "Clone failed."), { id: toastId }),
        });
    }

    function handleWizardConfirmed() {
        setSelectedModelId(null);
        setMode("list");
        // No manual refetch needed -- confirmModel()'s mutation (in
        // CompetencyWizardContext) already invalidates the shared
        // competencyModels query on success.
    }

    function handleWizardCloned(cloned) {
        setSelectedModelId(cloned.id);
        setMode("edit");
    }

    function handleCancelWizard() {
        setSelectedModelId(null);
        setMode("list");
    }

    /* =====================================================
       🔹 WIZARD MODE — full replace, matching ItemBuilder's
       "only the wizard is shown" behavior.
    ===================================================== */
    if (mode === "create" || mode === "edit") {
        return (
            <CompetencyWizardProvider
                modelId={selectedModelId}
                onConfirmed={handleWizardConfirmed}
                onCloned={handleWizardCloned}
            >
                <CompetencyWizard onCancel={handleCancelWizard} />
            </CompetencyWizardProvider>
        );
    }

    /* =====================================================
       🔹 LIST MODE
       Dedicated header (title left, "+ New Competency Model" button
       right) matching ItemBuilder.jsx's own header exactly -- same
       black button + Plus icon used by EvidenceModelBuilderPanel /
       TaskModelBuilderPanel. onCreate is intentionally NOT passed to
       CompetencyModelList below, so its own embedded blue create
       button (in its header controls row and empty state) stays
       hidden -- there is exactly one create entry point, same as
       ItemBuilder (ItemList has no create button of its own either).
    ===================================================== */
    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">Manage Student Model</h2>

                <button
                    onClick={handleCreate}
                    className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded hover:bg-gray-800"
                >
                    <Plus size={16} />
                    New Student Model
                </button>
            </div>

            <CompetencyModelList
                models={models}
                loading={loading}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onClone={handleClone}
                onArchive={handleArchive}
            />
        </div>
    );
}
