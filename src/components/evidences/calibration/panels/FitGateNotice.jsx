import React, { useState } from "react";

function failedLines(fitGate) {
  const rows = Array.isArray(fitGate?.failedChecks) ? fitGate.failedChecks : [];
  return rows.map((check) => check?.message).filter(Boolean);
}

export function FitGateSummary({ fitGate, alreadyActive = false }) {
  if (fitGate?.status === "pass") {
    return (
      <p className="text-xs text-emerald-800" data-testid="fit-gate-summary">
        Fit gate passed.
      </p>
    );
  }

  if (fitGate?.status === "not_evaluated") {
    return (
      <p className="text-xs text-slate-500" data-testid="fit-gate-summary">
        {fitGate.note || "Fit gate was not applied. This set has no fit statistics for its family."}
      </p>
    );
  }

  if (fitGate?.status === "override") {
    const lines = failedLines(fitGate);
    return (
      <div
        className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950"
        data-testid="fit-gate-summary"
      >
        <div className="font-semibold">Activated with a fit override.</div>
        {fitGate.override?.reason && <p className="mt-1">{fitGate.override.reason}</p>}
        {fitGate.override?.by && (
          <p className="mt-1 text-amber-800">Recorded by {fitGate.override.by}.</p>
        )}
        {lines.length > 0 && (
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (alreadyActive && !fitGate) {
    return (
      <p className="text-xs text-slate-500" data-testid="fit-gate-summary">
        Already active. The fit gate does not turn an existing set off.
      </p>
    );
  }

  return null;
}

export function FitGateOverrideForm({ disabled = false, onSubmit }) {
  const [reason, setReason] = useState("");
  return (
    <form
      className="mt-3 space-y-2"
      data-testid="fit-gate-override-form"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = reason.trim();
        if (!trimmed) return;
        onSubmit(trimmed);
      }}
    >
      <label className="block text-xs font-medium text-slate-700">
        Override reason
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
          rows={2}
          data-testid="fit-gate-override-reason"
          placeholder="Why this set can be activated despite the fit checks"
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
        />
      </label>
      <button
        type="submit"
        disabled={disabled || !reason.trim()}
        className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Activate with this reason
      </button>
    </form>
  );
}
