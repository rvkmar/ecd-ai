// src/components/taskModels/TaskModelBuilderPanel.jsx
// ------------------------------------------------------------
// Task Model Builder — full management console
// ------------------------------------------------------------
// Same role as itemBank/ItemBuilder.jsx: reached via the top-level
// "Operate Task Model" tab. Self-contained -- owns its own list/create/
// edit mode so the full-screen wizard can replace this panel entirely,
// matching ItemBuilder's early-return "only the wizard is shown" pattern.
//
// CHANGES IN THIS REWORK
// ----------------------
// • The competency queries are gone. This panel used to load every
//   competency model and competency, filter them to the confirmed ones,
//   and thread them through the wizard purely to feed a competency picker
//   that no longer exists. A Task Model binds Evidence Models; the
//   competency is a property of those.
//
// • THE EVIDENCE PRE-FILTER WAS A BUG. This panel filtered to
//   `status === "confirmed" && locked === true` before handing the list to
//   the wizard, which then applied the same narrowing again. An Evidence
//   Model that had been ACTIVATED (status "operational") or suspended was
//   therefore invisible in the binding step -- so a model could only ever
//   receive a task model before its first activation, and a suspended one
//   could never get a replacement task. The full list is passed through
//   now; TaskModelWizardContext narrows it with isLinkableEvidenceModel,
//   the same predicate the server enforces.
//
// • Items load through the shared useItems() React Query hook instead of a
//   hand-rolled useEffect + apiFetch with an empty dependency array, so
//   the item bank stays in sync with the rest of the app and an item
//   created elsewhere shows up here without a reload.
// ------------------------------------------------------------

import React, { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Plus } from "lucide-react";

import TaskModelList from "./TaskModelList";
import TaskModelWizard from "./TaskWizard/TaskModelWizard";
import { apiErrorMessage } from "@/api/apiClient";
import { isLinkableEvidenceModel } from "@/utils/schema";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import { useItems } from "@/api/queries/items";
import {
    useCreateTaskModel,
    useUpdateTaskModel,
} from "@/api/queries/taskModels";

export default function TaskModelBuilderPanel() {
    const [mode, setMode] = useState("list"); // list | create | edit
    const [selectedModel, setSelectedModel] = useState(null);

    /* =====================================================
       GOVERNED STRUCTURE STATE (shared caches)
    ===================================================== */

    const {
        data: allEvidenceModels = [],
        isLoading: evidenceLoading,
        isError: evidenceError,
    } = useEvidenceModels();

    const {
        data: allItems = [],
        isLoading: itemsLoading,
        isError: itemsError,
    } = useItems();

    const loading = evidenceLoading || itemsLoading;

    // Confirmed, operational and suspended -- never archived. Matches the
    // server's own linkability rule.
    const linkableEvidenceModels = useMemo(
        () => (allEvidenceModels || []).filter(isLinkableEvidenceModel),
        [allEvidenceModels]
    );

    // Items in scope for mapping and for the activation check.
    //
    // This filtered on `"active"` and `"review"` -- NEITHER OF WHICH IS AN
    // ITEM STATUS. The lifecycle is draft | reviewed | confirmed |
    // operational | suspended | archived (server/utils/lifecycleMatrix.js),
    // so the filter matched nothing and Step 6 showed an empty Item Bank no
    // matter how many items existed. Archived items are excluded: they
    // accept no new links and cannot justify activating anything.
    const mappableItems = useMemo(
        () => (allItems || []).filter((item) => item.status !== "archived"),
        [allItems]
    );

    const createTaskModel = useCreateTaskModel();
    const updateTaskModel = useUpdateTaskModel();

    /* =====================================================
       SAVE HANDLER

       Silent on success by design: there is no manual "Save Draft"
       button, so this runs on every Next once the wizard has crossed
       step 1. A success toast would fire on every click. Failures still
       surface -- those block navigation and need to be seen.
    ===================================================== */

    const handleSave = async (model) => {
        const orphaned = (model.expectedObservations || []).filter(
            (o) => !model.evidenceModelIds?.includes(o.evidenceModelId)
        );

        if (orphaned.length > 0) {
            toast.error(
                "Some observations belong to an unbound Evidence Model. Revisit the observable step."
            );
            return null;
        }

        if (
            model.primaryEvidenceModelId &&
            !(model.evidenceModelIds || []).includes(model.primaryEvidenceModelId)
        ) {
            toast.error("The primary Evidence Model is no longer bound to this task.");
            return null;
        }

        try {
            return model.id
                ? await updateTaskModel.mutateAsync({ id: model.id, payload: model })
                : await createTaskModel.mutateAsync(model);
        } catch (err) {
            console.error("Error saving task model", err);
            toast.error(apiErrorMessage(err, "Failed to save Task Model"));
            return null;
        }
    };

    /* =====================================================
       PROMOTION HANDLER (backend authoritative)
    ===================================================== */

    const handlePromote = async (model, nextStatus) => {
        try {
            const result = await updateTaskModel.mutateAsync({
                id: model.id,
                payload: { ...model, status: nextStatus },
            });

            toast.success(`Task Model moved to "${nextStatus}".`);

            setSelectedModel(null);
            setMode("list");

            return result;
        } catch (err) {
            console.error("Promotion error", err);
            toast.error(apiErrorMessage(err, "Promotion failed"));
            // Returning null rather than undefined so callers can branch on
            // failure; the wizard treats a falsy result as "did not promote".
            return null;
        }
    };

    /* =====================================================
       DELETE NOTIFICATION

       TaskModelList owns the delete mutation and its toasts. This used
       to fire a SECOND delete for the same id, which 404'd -- so every
       successful delete produced a success toast from the list and a
       failure toast from here. This is now a notification hook only:
       clear any selection pointing at the record that just went away.
    ===================================================== */

    const handleDeleted = (id) => {
        setSelectedModel((current) => (current?.id === id ? null : current));
    };

    /* =====================================================
       WIZARD MODE — full replace
    ===================================================== */

    if (mode === "create" || mode === "edit") {
        return (
            <TaskModelWizard
                initialModel={selectedModel}
                evidenceModels={linkableEvidenceModels}
                items={mappableItems}
                onCancel={() => {
                    setSelectedModel(null);
                    setMode("list");
                }}
                onSave={handleSave}
                onPromote={handlePromote}
            />
        );
    }

    /* =====================================================
       LOADING / GOVERNANCE GUARD
    ===================================================== */

    if (loading) {
        return (
            <div className="p-6">
                <h2 className="mb-4 text-2xl font-semibold">Manage Task Model</h2>
                <p className="text-sm text-slate-500">
                    Loading governed task structures…
                </p>
            </div>
        );
    }

    if (evidenceError || itemsError) {
        return (
            <div className="p-6">
                <h2 className="mb-4 text-2xl font-semibold">Manage Task Model</h2>
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    Unable to load the governed structures this console depends on.
                    Refresh to retry.
                </div>
            </div>
        );
    }

    const noLinkableEvidence = linkableEvidenceModels.length === 0;

    return (
        <div className="space-y-6 p-6">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-semibold">Manage Task Model</h2>
                    <p className="mt-1 text-sm text-slate-500">
                        Author, review and promote Task Models against confirmed
                        Evidence Models.
                    </p>
                </div>

                <button
                    onClick={() => {
                        setSelectedModel(null);
                        setMode("create");
                    }}
                    disabled={noLinkableEvidence}
                    className="flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <Plus size={16} strokeWidth={2.25} />
                    New Task Model
                </button>
            </div>

            {noLinkableEvidence && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    <strong className="font-semibold">
                        No linkable Evidence Models found.
                    </strong>
                    <p className="mt-1">
                        A Task Model can only be built against an Evidence Model that has
                        been confirmed. Operational and suspended models remain linkable;
                        archived ones do not. Confirm an Evidence Model first.
                    </p>
                </div>
            )}

            <TaskModelList
                onEdit={(m) => {
                    setSelectedModel(m);
                    setMode("edit");
                }}
                onDelete={handleDeleted}
                onPromote={handlePromote}
            />
        </div>
    );
}
