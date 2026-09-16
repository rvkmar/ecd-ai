// CompetencyWizard/steps/Step9Confirmation.jsx
import React, { useState } from "react";
import { CheckCircle2, AlertTriangle, Info, Archive, Download } from "lucide-react";
import { useCompetencyWizard } from "../CompetencyWizardContext";
import { useAuth } from "@/auth/AuthProvider";
import CompetencyPreviewPanel from "../components/CompetencyPreviewPanel";
import VersionHistoryViewer from "../components/VersionHistoryViewer";
import CloneModelDialog from "../components/CloneModelDialog";
import Modal from "@/components/ui/Modal";
import { canArchiveCompetencyModel, isLinkableCompetencyModel } from "@/utils/schema";
import { buildStudentModelSpecification } from "../smVariableSync";

export default function Step9Confirmation() {
    const {
        model,
        competencies,
        cloneModel,
        archiveModel,
        allModels,
        confirmAck,
        setConfirmAck,
    } = useCompetencyWizard();
    const { auth } = useAuth() || {};

    const [cloneOpen, setCloneOpen] = useState(false);
    const [archiveOpen, setArchiveOpen] = useState(false);

    async function handleClone(newName) {
        await cloneModel(newName);
        setCloneOpen(false);
    }

    function downloadSpecification() {
        const spec =
            model?.specification ||
            buildStudentModelSpecification({ model, competencies });
        const blob = new Blob([JSON.stringify(spec, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${(model?.name || "student-model")
            .replace(/[^\w\-]+/g, "_")
            .slice(0, 60)}_specification.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    const submitter = model?.reviewMeta?.submittedBy;
    const sameAuthor =
        model?.status === "reviewed" &&
        submitter &&
        auth?.username &&
        submitter === auth.username;

    if (model?.locked) {
        const archived = model.status === "archived";
        return (
            <div className="space-y-6">
                <h2 className="text-lg font-semibold text-slate-900">
                    Step 9 — Confirmation
                </h2>

                <div
                    className={`flex items-start gap-3 rounded-lg border px-4 py-3.5 text-sm ${
                        archived
                            ? "border-slate-300 bg-slate-100 text-slate-800"
                            : "border-emerald-200 bg-emerald-50 text-emerald-800"
                    }`}
                >
                    <CheckCircle2 size={18} strokeWidth={2} className="mt-0.5 shrink-0" />
                    <div>
                        <strong className="block text-sm font-semibold">
                            {archived ? "Model Archived" : "Model Confirmed"}
                        </strong>
                        <p className="mt-2 text-sm">
                            {archived
                                ? "This Student Model is withdrawn as a parent for new Evidence Models. Structure remains frozen for historical sessions."
                                : "This Student Model is locked and structurally frozen. To modify the latent architecture, clone this model to create a new draft version."}
                        </p>

                        <div className="mt-4 flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={downloadSpecification}
                                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                            >
                                <Download size={14} strokeWidth={2} />
                                Download specification
                            </button>
                            {isLinkableCompetencyModel(model) && (
                                <button
                                    type="button"
                                    onClick={() => setCloneOpen(true)}
                                    className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                                >
                                    Clone Model
                                </button>
                            )}
                            {canArchiveCompetencyModel(model) && (
                                <button
                                    type="button"
                                    onClick={() => setArchiveOpen(true)}
                                    className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-900"
                                >
                                    <Archive size={14} strokeWidth={2} />
                                    Archive
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <VersionHistoryViewer
                    currentModel={model}
                    allModels={allModels || []}
                />

                <CloneModelDialog
                    isOpen={cloneOpen}
                    model={model}
                    onConfirmClone={handleClone}
                    onCancel={() => setCloneOpen(false)}
                />

                <Modal
                    isOpen={archiveOpen}
                    onClose={() => setArchiveOpen(false)}
                    onConfirm={archiveModel}
                    title="Archive Student Model"
                    message="This withdraws the model as a parent for new Evidence Models. Existing structure is kept. Continue?"
                    confirmLabel="Archive"
                    confirmClass="bg-slate-800 text-white"
                />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-slate-900">
                    Step 9 — Confirmation
                </h2>
                <p className="mt-1 text-sm text-slate-500 max-w-3xl">
                    Review the full structural definition of this Student Model
                    before locking. Structural confirmation will permanently freeze
                    the latent architecture.
                </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6">
                <CompetencyPreviewPanel
                    model={model}
                    competencies={competencies}
                />
            </div>

            {model?.status === "reviewed" && (
                <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700 space-y-2">
                    <div>
                        <strong>Submitted for review by:</strong>{" "}
                        {submitter || "—"}
                    </div>
                    <div>
                        <strong>Confirming as:</strong> {auth?.username || "—"} (
                        {auth?.role || "—"})
                    </div>
                    {sameAuthor && (
                        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2 text-amber-900">
                            <p>
                                You submitted this model for review. Enterprise
                                practice prefers a different confirmer (e.g.
                                district). Admins may confirm their own
                                submission only with an explicit acknowledgment.
                            </p>
                            <label className="flex items-start gap-2">
                                <input
                                    type="checkbox"
                                    className="mt-1"
                                    checked={confirmAck.acknowledgeSameAuthor}
                                    onChange={(e) =>
                                        setConfirmAck((prev) => ({
                                            ...prev,
                                            acknowledgeSameAuthor: e.target.checked,
                                        }))
                                    }
                                />
                                <span>
                                    I acknowledge same-author confirmation for this
                                    lab / solo environment.
                                </span>
                            </label>
                            <textarea
                                rows={2}
                                value={confirmAck.sameAuthorReason}
                                onChange={(e) =>
                                    setConfirmAck((prev) => ({
                                        ...prev,
                                        sameAuthorReason: e.target.value,
                                    }))
                                }
                                placeholder="Reason (≥10 characters)"
                                className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm"
                            />
                        </div>
                    )}
                </div>
            )}

            <div className="space-y-3">
                <div className="text-sm font-semibold text-slate-800">
                    After confirmation:
                </div>
                <ul className="list-disc pl-6 space-y-1 text-sm text-slate-700">
                    <li>Dimensionality cannot be changed</li>
                    <li>Latent variables cannot be added or removed</li>
                    <li>State space definitions cannot be altered</li>
                    <li>Structural relationships become immutable</li>
                    <li>A governed specification JSON is frozen on the model</li>
                    <li>Evidence Models may reference this model</li>
                </ul>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-800">
                <AlertTriangle size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
                <p>
                    <strong className="font-semibold">Warning:</strong> Structural
                    confirmation is irreversible. Future structural changes require
                    cloning.
                </p>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3.5 text-sm text-blue-800">
                <Info size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
                <p>
                    <strong className="font-semibold">ECD Governance:</strong> Confirmation
                    locks this Student Model (claim structure). Evidence Models may
                    reference a locked, non-archived Student Model. Structural
                    change requires cloning, not activation.
                </p>
            </div>

            <VersionHistoryViewer
                currentModel={model}
                allModels={allModels || []}
            />
        </div>
    );
}
