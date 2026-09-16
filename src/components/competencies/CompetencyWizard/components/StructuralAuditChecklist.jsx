// CompetencyWizard/components/StructuralAuditChecklist.jsx
import React, { useMemo } from "react";
import { Check, X, ShieldCheck, AlertTriangle } from "lucide-react";
import { computeStructuralAudit } from "../structuralAudit";

export default function StructuralAuditChecklist({
    model,
    competencies = [],
}) {
    const { checks: audit, advisories = [], allPassed } = useMemo(
        () => computeStructuralAudit({ model, competencies }),
        [model, competencies]
    );

    return (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-6 space-y-6">
            <div>
                <h4 className="text-sm font-semibold text-slate-800">
                    Structural Audit Checklist
                </h4>
                <p className="mt-1 text-sm text-slate-500">
                    Consolidated structural validation prior to confirmation (PADI TR9
                    §2.3.1 Student Model completeness).
                </p>
            </div>

            <ul className="space-y-3">
                {audit.map((item, index) => (
                    <li
                        key={index}
                        className={`flex items-center gap-2 text-sm ${
                            item.passed ? "text-emerald-700" : "text-red-600"
                        }`}
                    >
                        {item.passed ? (
                            <Check size={16} strokeWidth={2.25} className="shrink-0" />
                        ) : (
                            <X size={16} strokeWidth={2.25} className="shrink-0" />
                        )}
                        {item.label}
                    </li>
                ))}
            </ul>

            {advisories.length > 0 && (
                <div className="space-y-2">
                    <h5 className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                        Coherence advisories
                    </h5>
                    {advisories.map((text, i) => (
                        <div
                            key={i}
                            className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                        >
                            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                            <span>{text}</span>
                        </div>
                    ))}
                </div>
            )}

            <div
                className={`flex items-start gap-3 rounded-lg border px-4 py-3.5 text-sm font-semibold ${
                    allPassed
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-red-200 bg-red-50 text-red-700"
                }`}
            >
                {allPassed ? (
                    <ShieldCheck size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
                ) : (
                    <AlertTriangle size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
                )}
                <span>
                    {allPassed
                        ? "All structural checks passed. Model ready for confirmation."
                        : "Structural violations detected. Resolve before confirming."}
                </span>
            </div>

            <div className="text-xs text-slate-500">
                <strong className="font-semibold text-slate-700">Governance:</strong> This
                checklist mirrors backend validation. Final confirmation will be blocked if
                any rule fails.
            </div>
        </div>
    );
}
