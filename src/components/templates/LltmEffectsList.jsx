import React from "react";
import { formatEffect, formatSigned } from "@/utils/predictedParameters";

export function LltmEffectsList({
  effects = [],
  sourceModel = null,
  normalization = null,
  testId = "lltm-effects",
}) {
  if (!effects.length) return null;
  return (
    <div
      className="mt-2 rounded border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-700"
      data-testid={testId}
    >
      <p className="font-medium text-slate-800">
        Predicted covariate effects
        {sourceModel ? ` (${sourceModel})` : ""}
      </p>
      <p className="mt-1 text-slate-600">
        These are predicted, not calibrated. They do not activate a parameter set.
      </p>
      {normalization ? <p className="mt-1 text-slate-600">{normalization}</p> : null}
      <ul className="mt-1 space-y-1">
        {effects.map((effect) => (
          <li key={effect.name || effect.label}>
            <span className="font-medium">{effect.label || effect.name}</span>
            {": "}
            <span className="tabular-nums">{formatEffect(effect.estimate)}</span>
            {typeof effect.se === "number" ? (
              <span className="text-slate-500"> (SE {formatSigned(effect.se)})</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function predictedDifficultyCell(spec) {
  const predicted = spec?.predictedParameters;
  if (!predicted || predicted.parameterStatus !== "predicted" || typeof predicted.b !== "number") {
    return <span className="text-slate-400">Not predicted</span>;
  }
  return (
    <span>
      <span
        className="mr-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-900"
        data-testid="lltm-predicted-badge"
      >
        Predicted
      </span>
      <span className="tabular-nums" data-testid="lltm-predicted-difficulty">
        {formatSigned(predicted.b)}
      </span>
      {typeof predicted.bSe === "number" ? (
        <span className="text-slate-500"> (SE {formatSigned(predicted.bSe)})</span>
      ) : null}
    </span>
  );
}
