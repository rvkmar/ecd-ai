// src/components/evidences/EvidenceModelBuilderPanel.jsx
// ------------------------------------------------------------
// Evidence Model Builder — full management console
// ------------------------------------------------------------
// Same role as itemBank/ItemBuilder.jsx: reached via the top-level
// "Operate Evidence Model" tab. Self-contained -- owns its own
// list/create/edit/calibrate mode so the full-screen wizard (or the
// calibration workspace) can replace this panel entirely, matching
// ItemBuilder's early-return "only the wizard is shown" pattern.
// Independent from the top-level Dashboard/List/Create sub-nav in
// EvidenceModelBuilder.jsx.
// ------------------------------------------------------------

import React, { useMemo, useState } from "react";
import { Plus } from "lucide-react";

import EvidenceModelList from "./EvidenceModelList";
import EvidenceWizard from "./EvidenceWizard/EvidenceWizard";
import EvidenceModelCalibration from "./EvidenceModelCalibration";
import { EvidenceWizardProvider } from "./EvidenceWizard/EvidenceWizardContext";
import { useCompetencyModels, useCompetencies } from "@/api/queries/competencies";
import { isLinkableCompetencyModel } from "@/utils/schema";

export default function EvidenceModelBuilderPanel() {
    const [mode, setMode] = useState("list"); // list | create | edit | calibrate
    const [selectedModel, setSelectedModel] = useState(null);

    const goToList = () => {
        setSelectedModel(null);
        setMode("list");
    };

    /* =====================================================
       Load linkable competency structures (shared caches).
       Confirmed / operational / suspended are all frozen parents;
       a literal `status === "confirmed"` hid every activated CM.
    ===================================================== */

    const { data: allModels = [], isLoading: modelsLoading } = useCompetencyModels();
    const { data: allCompetencies = [], isLoading: competenciesLoading } = useCompetencies();

    const competencyModels = useMemo(
        () => (allModels || []).filter(isLinkableCompetencyModel),
        [allModels]
    );

    const competencies = useMemo(() => {
        const confirmedIds = new Set(competencyModels.map((m) => m.id));
        return (allCompetencies || []).filter((c) => confirmedIds.has(c.modelId));
    }, [allCompetencies, competencyModels]);

    const loading = modelsLoading || competenciesLoading;
    const noLinkableModels = competencyModels.length === 0;

    /* =====================================================
       🔹 WIZARD MODE — full replace, matching ItemBuilder's
       "only the wizard is shown" behavior.
    ===================================================== */
    if (mode === "create" || mode === "edit") {
        return (
            <EvidenceWizardProvider
                initialModel={selectedModel}
                competencies={competencies}
                competencyModels={competencyModels}
            >
                <EvidenceWizard onCancel={goToList} onSaved={goToList} />
            </EvidenceWizardProvider>
        );
    }

    /* =====================================================
       🔹 CALIBRATION MODE — full replace
    ===================================================== */
    if (mode === "calibrate" && selectedModel) {
        return (
            <EvidenceModelCalibration
                model={selectedModel}
                onBack={goToList}
                onUpdateModel={(updated) => setSelectedModel(updated)}
            />
        );
    }

    if (loading) {
        return (
            <div className="p-6">
                <h2 className="text-2xl font-bold mb-4">Evidence Models</h2>
                <p>Loading confirmed competency structures…</p>
            </div>
        );
    }

    /* =====================================================
       🔹 LIST MODE
    ===================================================== */
    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">Operate Evidence Model</h2>

                <button
                    onClick={() => {
                        setSelectedModel(null);
                        setMode("create");
                    }}
                    disabled={noLinkableModels}
                    className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <Plus size={16} />
                    New Evidence Model
                </button>
            </div>

            {noLinkableModels && (
                <div className="border rounded bg-yellow-50 p-4 text-sm text-yellow-800">
                    <strong>No linkable competency models found.</strong>
                    <p className="mt-1">
                        Evidence models can only be created against
                        confirmed, operational, or suspended competency
                        structures. Confirm a Competency Model first.
                    </p>
                </div>
            )}

            <EvidenceModelList
                onEdit={(model) => {
                    setSelectedModel(model);
                    setMode("edit");
                }}
                onCalibrate={(model) => {
                    setSelectedModel(model);
                    setMode("calibrate");
                }}
            />
        </div>
    );
}
