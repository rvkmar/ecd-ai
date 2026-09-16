// EvidenceInferencePipeline.jsx
// 🧠 Enterprise ECD — Evidence Inference Pipeline
// ------------------------------------------------
// Visualizes how observable behavior becomes evidence
// and updates belief in a competency claim.

import React from "react";

export default function EvidenceInferencePipeline() {

    const Stage = ({ title, subtitle }) => (
        <div className="min-w-[180px] rounded-lg border border-slate-200 bg-white px-6 py-4 text-center shadow-sm">
            <div className="text-sm font-semibold text-slate-800">{title}</div>
            {subtitle && (
                <div className="mt-1 text-xs text-slate-500">
                    {subtitle}
                </div>
            )}
        </div>
    );

    const Arrow = ({ direction = "right" }) => {

        if (direction === "right") {
            return (
                <div className="flex items-center px-3 text-slate-400 text-lg">
                    →
                </div>
            );
        }

        if (direction === "down") {
            return (
                <div className="flex justify-center text-slate-400 text-lg">
                    ↓
                </div>
            );
        }

        return null;
    };

    return (

        <div className="space-y-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">

            {/* Title */}

            <div className="text-sm font-semibold text-slate-800">
                Evidence Inference Pipeline
            </div>

            {/* Horizontal flow */}

            <div className="flex items-center justify-center">

                <Stage
                    title="Observable Behavior"
                    subtitle="Student action captured by task"
                />

                <Arrow />

                <Stage
                    title="Evidence Rule"
                    subtitle="Maps behavior to evidence"
                />

                <Arrow />

                <Stage
                    title="Statistical Model"
                    subtitle="Measurement model"
                />

            </div>

            {/* Vertical inference chain */}

            <div className="flex flex-col items-center space-y-2">

                <Arrow direction="down" />

                <Stage
                    title="Posterior Belief"
                    subtitle="Updated probability of claim"
                />

                <Arrow direction="down" />

                <Stage
                    title="Claim Inference"
                    subtitle="Student Model estimate"
                />

            </div>

        </div>

    );

}