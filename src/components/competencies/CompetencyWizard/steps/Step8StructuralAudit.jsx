// CompetencyWizard/steps/Step8StructuralAudit.jsx
// Step 8 — Structural Audit & Integrity Check (Full Tailwind Refactor)
// Governance consolidation before confirmation
// Clean separation: dimensional validation + structural checklist

import React from "react";
import { Info } from "lucide-react";
import { useCompetencyWizard } from "../CompetencyWizardContext";
import DimensionalIntegrityPanel from "../components/DimensionalIntegrityPanel";
import StructuralAuditChecklist from "../components/StructuralAuditChecklist";

export default function Step8StructuralAudit() {
    const { model, competencies } = useCompetencyWizard();

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-lg font-semibold text-slate-900">
                    Step 8 — Structural Audit
                </h2>
                <p className="mt-1 text-sm text-slate-500 max-w-3xl">
                    Review the structural integrity of this Student Model before
                    confirmation. This audit consolidates dimensional coherence,
                    state-space validity, and structural constraints to ensure
                    inferential stability.
                </p>
            </div>

            {/* Dimensional Integrity Panel */}
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6">
                <h3 className="text-sm font-semibold text-slate-800 mb-4">
                    Dimensional Integrity
                </h3>
                <DimensionalIntegrityPanel
                    model={model}
                    competencies={competencies}
                />
            </div>

            {/* Structural Checklist */}
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6">
                <h3 className="text-sm font-semibold text-slate-800 mb-4">
                    Structural Checklist
                </h3>
                <StructuralAuditChecklist
                    model={model}
                    competencies={competencies}
                />
            </div>

            {/* Governance Panel */}
            <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3.5 text-sm text-blue-800">
                <Info size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
                <p>
                    <strong className="font-semibold">ECD Principle:</strong> Structural
                    confirmation freezes the latent variable architecture. Any future
                    modification requires cloning to preserve versioned inferential
                    integrity. The Student Model layer must remain internally coherent
                    before operational use.
                </p>
            </div>
        </div>
    );
}
