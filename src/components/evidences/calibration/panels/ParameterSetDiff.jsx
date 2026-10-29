// Parameter-set drift table. Shared by Evidence Model Calibration
// History and the D65 calibration-console inspect pane.
import React from "react";
import { ArrowLeftRight } from "lucide-react";
import {
  diffFamily,
  diffParameterSets,
} from "@/utils/parameterSetDiff";

const fmt = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(3) : "—";

const signed = (value) =>
  typeof value !== "number" || !Number.isFinite(value)
    ? "—"
    : `${value > 0 ? "+" : ""}${value.toFixed(3)}`;

function driftClass(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "text-slate-400";
  if (Math.abs(value) >= 0.5) return "text-red-600";
  if (Math.abs(value) >= 0.25) return "text-amber-600";
  return "text-slate-500";
}

export default function ParameterSetDiff({
  activeSet,
  otherSet,
  observables = [],
  otherLabel,
}) {
  if (!activeSet || !otherSet) return null;

  const kind = activeSet.parameters?._kind || otherSet.parameters?._kind;
  if (kind === "bayesian-cpt") {
    return (
      <div
        className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-xs text-slate-600"
        data-testid="parameter-set-diff"
      >
        Numeric drift comparison is available for IRT and DINA parameter sets.
        Inspect both sets to compare conditional probability tables.
      </div>
    );
  }

  const rows = diffParameterSets(
    activeSet.parameters || {},
    otherSet.parameters || {}
  );
  const family = diffFamily(rows);
  const statementFor = (id) =>
    observables.find((observable) => observable.id === id)?.statement || "—";
  const label = otherLabel || otherSet.parameterSetId || "this run";

  if (family === "none") {
    return (
      <div
        className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3.5 text-xs text-slate-600"
        data-testid="parameter-set-diff"
      >
        No numeric item parameters to compare against the active set.
      </div>
    );
  }

  const dina = family === "dina";

  return (
    <div
      className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      data-testid="parameter-set-diff"
    >
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
        <ArrowLeftRight size={16} strokeWidth={2} className="text-slate-400" />
        Drift — active vs {label}
        <span className="font-normal text-xs text-slate-500">
          (largest movement first)
        </span>
      </div>

      <table className="w-full min-w-[560px] text-left text-xs">
        <thead className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="py-2 pr-3">Observable</th>
            {dina ? (
              <>
                <th className="py-2 pr-3">slip (active)</th>
                <th className="py-2 pr-3">slip (other)</th>
                <th className="py-2 pr-3">Δslip</th>
                <th className="py-2 pr-3">guess (active)</th>
                <th className="py-2 pr-3">guess (other)</th>
                <th className="py-2 pr-3">Δguess</th>
              </>
            ) : (
              <>
                <th className="py-2 pr-3">b (active)</th>
                <th className="py-2 pr-3">b (other)</th>
                <th className="py-2 pr-3">Δb</th>
                <th className="py-2 pr-3">a (active)</th>
                <th className="py-2 pr-3">a (other)</th>
                <th className="py-2 pr-3">Δa</th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id} data-testid={`parameter-set-diff-row-${row.id}`}>
              <td className="py-2 pr-3">
                <div className="font-mono text-slate-800">{row.id}</div>
                <div className="max-w-xs truncate text-[11px] text-slate-500">
                  {statementFor(row.id)}
                </div>
              </td>
              {dina ? (
                <>
                  <td className="py-2 pr-3 tabular-nums text-slate-700">
                    {fmt(row.slipActive)}
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-slate-700">
                    {fmt(row.slipOther)}
                  </td>
                  <td className={`py-2 pr-3 tabular-nums font-medium ${driftClass(row.dSlip)}`}>
                    {signed(row.dSlip)}
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-slate-700">
                    {fmt(row.guessActive)}
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-slate-700">
                    {fmt(row.guessOther)}
                  </td>
                  <td className={`py-2 pr-3 tabular-nums font-medium ${driftClass(row.dGuess)}`}>
                    {signed(row.dGuess)}
                  </td>
                </>
              ) : (
                <>
                  <td className="py-2 pr-3 tabular-nums text-slate-700">{fmt(row.bActive)}</td>
                  <td className="py-2 pr-3 tabular-nums text-slate-700">{fmt(row.bOther)}</td>
                  <td className={`py-2 pr-3 tabular-nums font-medium ${driftClass(row.db)}`}>
                    {signed(row.db)}
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-slate-700">{fmt(row.aActive)}</td>
                  <td className="py-2 pr-3 tabular-nums text-slate-700">{fmt(row.aOther)}</td>
                  <td className={`py-2 pr-3 tabular-nums font-medium ${driftClass(row.da)}`}>
                    {signed(row.da)}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 text-[11px] text-slate-500">
        {dina
          ? "Rows are ordered by the larger of |Δslip| and |Δguess|."
          : "Rows are ordered by the larger of |Δb| and |Δa|. Drift beyond roughly ±0.5 logits on difficulty usually means the item behaved differently in the two populations — investigate before treating the two administrations as being on one scale."}
      </div>
    </div>
  );
}
