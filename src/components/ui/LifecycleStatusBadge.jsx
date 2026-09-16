// src/components/ui/LifecycleStatusBadge.jsx
// ------------------------------------------------------------
// One status badge for every model layer's Manage tab.
//
// There used to be four of these, and three disagreed with
// server/utils/lifecycleMatrix.js:
//   • CompetencyModelList rendered a BINARY badge -- locked ? "Confirmed"
//     : "Draft" -- so a `reviewed` model was labelled "Draft", flatly
//     contradicting the Review button sitting next to it.
//   • EvidenceModelList had its own colour ladder with no `reviewed`
//     branch, so a reviewed model fell through to the draft yellow.
//   • ItemBuilder had a third palette again (reviewed = yellow-200).
// Only TaskModelList used STATUS_BADGE_CLASSES.
//
// The matrix owns the palette; this component owns the shape.
// ------------------------------------------------------------

import React from "react";
import { STATUS_BADGE_CLASSES } from "../../../server/utils/lifecycleMatrix";

const LABELS = {
    draft: "Draft",
    reviewed: "Reviewed",
    confirmed: "Confirmed",
    operational: "Operational",
    suspended: "Suspended",
    archived: "Archived",
};

export default function LifecycleStatusBadge({ status, className = "" }) {
    // An absent status means "not yet saved", which is a draft.
    const value = status || "draft";

    return (
        <span
            className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_BADGE_CLASSES[value] || "bg-slate-200 text-slate-700"
                } ${className}`}
        >
            {LABELS[value] || value}
        </span>
    );
}
