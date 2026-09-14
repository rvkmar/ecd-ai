// ModelSelectionCard.jsx
// 🧠 Enterprise ECD — Statistical Model Selection Card
// ----------------------------------------------------
// Displays a selectable card representing a statistical model.
//
// A card can be shown but UNAVAILABLE. Step 6 lists every model family the
// platform supports and marks the ones this competency's variable type rules
// out, with the reason -- rather than omitting them, which made the screen
// look broken ("IRT is gone") when the real answer was a measurement
// constraint the author could see and act on.

import React from "react";
import { Ban } from "lucide-react";

export default function ModelSelectionCard({
    modelMeta,
    selected,
    onSelect,
    locked,
    disabled = false,
    reason = null
}) {

    const complexityColors = {
        low: "bg-emerald-100 text-emerald-700",
        medium: "bg-amber-100 text-amber-700",
        high: "bg-red-100 text-red-700"
    };

    const complexityClass =
        complexityColors[modelMeta.complexity] ||
        "bg-slate-100 text-slate-600";

    const unavailable = disabled;
    const interactive = !locked && !unavailable;

    return (

        <button
            type="button"
            onClick={() => {
                if (interactive) onSelect(modelMeta.type);
            }}
            disabled={!interactive}
            aria-pressed={selected}
            title={reason || undefined}
            className={`w-full text-left space-y-2 rounded-lg border p-4 shadow-sm transition
                ${selected
                    ? "border-slate-900 bg-white ring-2 ring-slate-900/10"
                    : unavailable
                        ? "border-slate-200 border-dashed bg-slate-50"
                        : "border-slate-200 bg-white hover:border-slate-400"}
                ${unavailable
                    ? "cursor-not-allowed"
                    : locked
                        ? "cursor-not-allowed opacity-60"
                        : "cursor-pointer"}
            `}
        >

            {/* Model Title */}

            <div className="flex items-center justify-between gap-2">

                <div className={`text-sm font-semibold ${unavailable ? "text-slate-400" : "text-slate-900"}`}>

                    {modelMeta.label}

                </div>

                <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${unavailable ? "bg-slate-100 text-slate-400" : complexityClass}`}
                >
                    {modelMeta.complexity}
                </span>

            </div>

            {/* Description */}

            <div className={`text-xs ${unavailable ? "text-slate-400" : "text-slate-500"}`}>

                {modelMeta.description}

            </div>

            {/* Model Family */}

            <div className="text-xs text-slate-400">

                Family: {modelMeta.family}

            </div>

            {/* Why this model is not offered here */}

            {unavailable && reason && (

                <div className="flex items-start gap-1.5 border-t border-slate-200 pt-2 text-[11px] font-medium text-slate-500">

                    <Ban size={12} strokeWidth={2.25} className="mt-0.5 shrink-0" />

                    <span>{reason}</span>

                </div>

            )}

        </button>

    );

}
