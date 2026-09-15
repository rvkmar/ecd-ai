// CompetencyWizard/components/CloneModelDialog.jsx
// 🧠 Clone Model Dialog (Enterprise Grade)
// - TailwindCSS modal
// - Accessible semantics
// - Toast-driven feedback
// - Strict validation
// - Clean lifecycle reset

import React, { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle } from "lucide-react";
import { isLinkableCompetencyModel } from "@/utils/schema";

export default function CloneModelDialog({
    isOpen,
    model,
    onConfirmClone,
    onCancel,
}) {
    const [cloneName, setCloneName] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const inputRef = useRef(null);

    const isConfirmed = isLinkableCompetencyModel(model);

    /* =====================================================
       🔹 RESET STATE WHEN OPEN
    ===================================================== */
    useEffect(() => {
        if (isOpen && model) {
            const nextVersion = (model.versionNumber || 1) + 1;
            setCloneName(`${model.name} v${nextVersion}`);
            setSubmitting(false);

            // Auto-focus input
            setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            }, 50);
        }
    }, [isOpen, model]);

    if (!isOpen || !model) return null;

    /* =====================================================
       🔹 VALIDATION
    ===================================================== */
    function validateName(name) {
        if (!name || name.trim().length < 5) {
            toast.error("Clone name must be at least 5 characters.");
            return false;
        }
        return true;
    }

    /* =====================================================
       🔹 HANDLE CLONE
    ===================================================== */
    async function handleClone() {
        const trimmed = cloneName.trim();

        if (!validateName(trimmed)) return;

        try {
            setSubmitting(true);
            const toastId = toast.loading("Creating clone...");

            await onConfirmClone(trimmed);

            toast.success("Clone created successfully.", { id: toastId });
        } catch (err) {
            toast.error("Clone operation failed.");
        } finally {
            setSubmitting(false);
        }
    }

    /* =====================================================
       🔹 RENDER
    ===================================================== */
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clone-model-title"
        >
            <div className="w-full max-w-lg space-y-6 rounded-xl border border-slate-200 bg-white p-8 shadow-xl">
                {/* HEADER */}
                <div>
                    <h2
                        id="clone-model-title"
                        className="text-lg font-semibold text-slate-900"
                    >
                        Clone Competency Model
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                        Create a new draft version based on the locked Student Model structure.
                    </p>
                </div>

                {/* GOVERNANCE WARNING */}
                {!isConfirmed && (
                    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-800">
                        <AlertTriangle size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
                        <span>Only a locked, non-archived competency model can be cloned for structural revision.</span>
                    </div>
                )}

                {/* INPUT */}
                <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                        New Version Name <span className="text-red-500">*</span>
                    </label>
                    <input
                        ref={inputRef}
                        type="text"
                        value={cloneName}
                        onChange={(e) => setCloneName(e.target.value)}
                        placeholder="e.g., Grade 8 Math Framework v2"
                        disabled={submitting}
                        className="w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                    />
                </div>

                {/* GOVERNANCE DETAILS */}
                <div className="space-y-2 text-sm text-slate-600">
                    <strong className="block text-slate-700">
                        Governance Notice:
                    </strong>
                    <ul className="list-disc space-y-1 pl-5">
                        <li>The cloned model will be created as a draft.</li>
                        <li>The original confirmed version remains immutable.</li>
                        <li>All structural relationships and latent variables are copied.</li>
                        <li>
                            Evidence Models may reference either version independently.
                        </li>
                    </ul>
                </div>

                {/* ACTIONS */}
                <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                    <button
                        onClick={onCancel}
                        disabled={submitting}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
                    >
                        Cancel
                    </button>

                    <button
                        onClick={handleClone}
                        disabled={submitting}
                        className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed disabled:shadow-none"
                    >
                        {submitting ? "Cloning..." : "Create Clone"}
                    </button>
                </div>
            </div>
        </div>
    );
}
