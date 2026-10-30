// Read-only TU4 model criticism. Summaries come from fitStatistics.
// Per-person Zh rows and the Q3 matrix are loaded from the job on request.

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiErrorMessage, apiFetch } from "@/api/apiClient";
import { useAuth } from "@/auth/AuthProvider";
import { hasModelCriticism } from "@/utils/modelCriticism";
import {
  Q3_ABS_THRESHOLD,
  bundleAlreadyEnabled,
  bundleCandidates,
} from "@/utils/scoringBundles";

function fmt(value, digits = 3) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return value.toFixed(digits);
}

function qText(vec) {
  if (!Array.isArray(vec) || vec.length === 0) return "n/a";
  return vec.map((cell) => (typeof cell === "number" ? String(cell) : "?")).join("");
}

function offDiagonalMean(matrix) {
  const values = matrix?.values;
  if (!Array.isArray(values)) return null;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < values.length; i += 1) {
    const row = values[i];
    if (!Array.isArray(row)) continue;
    for (let j = i + 1; j < row.length; j += 1) {
      const cell = row[j];
      if (typeof cell !== "number" || !Number.isFinite(cell)) continue;
      sum += Math.abs(cell);
      n += 1;
    }
  }
  return n ? sum / n : null;
}

function countLine(summary) {
  if (!summary) return "n/a";
  const n = summary.nMisfit;
  const of = summary.nFinite ?? summary.nPersons;
  const pct =
    typeof summary.proportionMisfit === "number"
      ? ` (${(summary.proportionMisfit * 100).toFixed(1)}%)`
      : "";
  if (typeof n !== "number") return "n/a";
  return `${n} of ${of ?? "n/a"}${pct}`;
}

export default function ModelCriticismPanel({
  fitStatistics,
  jobId,
  items,
  scoringBundles,
  onEnableBundle,
}) {
  const { auth } = useAuth() || {};
  const [personRows, setPersonRows] = useState(null);
  const [personNote, setPersonNote] = useState("");
  const [personLoading, setPersonLoading] = useState(false);
  const [q3, setQ3] = useState(null);
  const [q3Note, setQ3Note] = useState("");
  const [q3Loading, setQ3Loading] = useState(false);

  if (!hasModelCriticism(fitStatistics)) return null;
  const fit = fitStatistics;
  const cdm = fit.cdmFit;
  const qval = fit.qValidation;
  const person = fit.personFit;
  const ld = fit.localDependence;

  async function loadPersons() {
    if (!jobId) return;
    setPersonLoading(true);
    setPersonNote("");
    try {
      const body = await apiFetch(`/api/calibrationJobs/${jobId}/person-fit`, {}, auth);
      if (body?.suppressed) {
        setPersonRows([]);
        setPersonNote(body.reason || "Suppressed.");
      } else {
        setPersonRows(Array.isArray(body?.rows) ? body.rows : []);
      }
    } catch (err) {
      setPersonRows(null);
      setPersonNote(apiErrorMessage(err, "Could not load person-fit flags."));
    } finally {
      setPersonLoading(false);
    }
  }

  async function loadQ3() {
    if (!jobId) return;
    setQ3Loading(true);
    setQ3Note("");
    try {
      const body = await apiFetch(`/api/calibrationJobs/${jobId}/q3`, {}, auth);
      setQ3(body);
    } catch (err) {
      setQ3(null);
      setQ3Note(apiErrorMessage(err, "Could not load the Q3 matrix."));
    } finally {
      setQ3Loading(false);
    }
  }

  const misfits = (personRows || []).filter((row) => row.misfit);
  const threshold = typeof ld?.threshold === "number" ? ld.threshold : Q3_ABS_THRESHOLD;
  const candidates = bundleCandidates(ld?.flaggedPairs, items);
  const meanAbs = offDiagonalMean(q3);

  return (
    <section className="space-y-3" data-testid="model-criticism">
      <h4 className="text-caption font-medium text-muted-foreground">Model criticism</h4>
      <p className="text-caption text-muted-foreground">
        Summaries only. Per-person flags and the Q3 matrix stay on the calibration job.
      </p>

      {cdm && (
        <div data-testid="model-criticism-cdm" className="space-y-1 text-sm">
          <div className="font-medium">CDM absolute fit</div>
          {cdm.available === false ? (
            <p className="text-muted-foreground">{cdm.note || "Not available."}</p>
          ) : (
            <dl className="grid gap-1 sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">M2</dt>
                <dd>{fmt(cdm.M2)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">df</dt>
                <dd>{fmt(cdm.df, 0)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">p</dt>
                <dd>{fmt(cdm.p, 4)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">RMSEA2</dt>
                <dd>{fmt(cdm.RMSEA2, 4)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">SRMSR</dt>
                <dd>{fmt(cdm.SRMSR, 4)}</dd>
              </div>
            </dl>
          )}
        </div>
      )}

      {qval && (
        <div data-testid="model-criticism-qval" className="space-y-1 text-sm">
          <div className="font-medium">Q-matrix suggestions</div>
          {qval.available === false ? (
            <p className="text-muted-foreground">{qval.note || "Not available."}</p>
          ) : (
            <>
              <p className="text-caption text-muted-foreground">
                eps {fmt(qval.eps, 2)}. {qval.nChanged ?? 0} suggested change
                {(qval.nChanged ?? 0) === 1 ? "" : "s"} of {qval.nItems ?? "n/a"} items.
              </p>
              {Array.isArray(qval.suggestions) && qval.suggestions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-caption">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="pr-3">Item</th>
                        <th className="pr-3">Original</th>
                        <th className="pr-3">Suggested</th>
                        <th>PVAF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {qval.suggestions.map((row) => (
                        <tr key={row.itemId}>
                          <td className="pr-3 font-mono">{row.itemId}</td>
                          <td className="pr-3 font-mono">{qText(row.original)}</td>
                          <td className="pr-3 font-mono">{qText(row.suggested)}</td>
                          <td>{fmt(row.pvaf, 3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-caption text-muted-foreground">No suggested q-vector changes.</p>
              )}
            </>
          )}
        </div>
      )}

      {person && (
        <div data-testid="model-criticism-person" className="space-y-1 text-sm">
          <div className="font-medium">Person fit (Zh)</div>
          {person.available === false ? (
            <p className="text-muted-foreground">{person.note || "Not available."}</p>
          ) : (
            <>
              <p>
                Cutoff {fmt(person.cutoff, 1)} ({person.rule || "Zh < cutoff"}). Misfitting{" "}
                {countLine(person)}.
              </p>
              {jobId && (
                <Button type="button" variant="outline" size="sm" onClick={loadPersons} disabled={personLoading}>
                  {personLoading ? "Loading person flags" : "Show misfitting persons"}
                </Button>
              )}
              {personNote && <p className="text-caption text-muted-foreground">{personNote}</p>}
              {personRows && !personNote && misfits.length === 0 && (
                <p className="text-caption text-muted-foreground">No person fell below the Zh cutoff.</p>
              )}
              {misfits.length > 0 && (
                <div className="max-h-48 overflow-auto">
                  <table className="w-full text-caption">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="pr-3">Person</th>
                        <th>Zh</th>
                      </tr>
                    </thead>
                    <tbody>
                      {misfits.map((row) => (
                        <tr key={row.personId}>
                          <td className="pr-3 font-mono">{row.personId}</td>
                          <td>{fmt(row.Zh, 3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {ld && (
        <div data-testid="model-criticism-q3" className="space-y-2 text-sm">
          <div className="font-medium">Local dependence (Q3)</div>
          {ld.available === false ? (
            <p className="text-muted-foreground">{ld.note || "Not available."}</p>
          ) : (
            <>
              <p>
                Yen&apos;s Q3 flags a pair when the absolute residual correlation is above{" "}
                {fmt(threshold, 2)} (Yen 1984). The default threshold is {fmt(Q3_ABS_THRESHOLD, 2)}.
                max |Q3| {fmt(ld.maxAbsQ3, 3)}. Flagged pairs {ld.nFlaggedPairs ?? 0}.
              </p>
              {Array.isArray(ld.flaggedPairs) && ld.flaggedPairs.length > 0 ? (
                <div className="max-h-48 overflow-auto">
                  <table className="w-full text-caption">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="pr-3">Item</th>
                        <th className="pr-3">Item</th>
                        <th className="pr-3">Q3</th>
                        <th>Flag</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ld.flaggedPairs.map((pair) => (
                        <tr key={`${pair.itemId1}-${pair.itemId2}`}>
                          <td className="pr-3 font-mono">{pair.itemId1}</td>
                          <td className="pr-3 font-mono">{pair.itemId2}</td>
                          <td className="pr-3 tabular-nums">{fmt(pair.q3, 3)}</td>
                          <td>|Q3| &gt; {fmt(threshold, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-caption text-muted-foreground">No pair above the threshold.</p>
              )}
              {candidates.length > 0 && (
                <div className="space-y-2" data-testid="bundle-candidates">
                  <p className="text-caption text-muted-foreground">
                    Flagged items that share a work product or a passage can be scored as one
                    bundle: a single graded sum, instead of separate 0/1 items. Bundle scoring
                    stays off until you enable it. The next calibration fits that sum. Delivery
                    uses it only after that parameter set is active.
                  </p>
                  {candidates.map((candidate) => {
                    const on = bundleAlreadyEnabled(scoringBundles, candidate);
                    const shared =
                      candidate.basis === "workProduct"
                        ? `work product ${candidate.sourceId}`
                        : `passage ${candidate.sourceId}`;
                    return (
                      <div key={candidate.id} className="rounded-md border border-border px-3 py-2">
                        <p>
                          {candidate.itemIds.join(", ")} share {shared}.
                        </p>
                        {on ? (
                          <p className="text-caption text-muted-foreground">Bundle scoring is on for these items.</p>
                        ) : onEnableBundle ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={() => onEnableBundle(candidate)}
                          >
                            Enable bundle scoring
                          </Button>
                        ) : (
                          <p className="text-caption text-muted-foreground">
                            Bundle scoring is off. An admin can enable it from this review.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {jobId && (
                <Button type="button" variant="outline" size="sm" onClick={loadQ3} disabled={q3Loading}>
                  {q3Loading ? "Loading Q3 matrix" : "Show Q3 matrix"}
                </Button>
              )}
              {q3Note && <p className="text-caption text-muted-foreground">{q3Note}</p>}
              {meanAbs != null && (
                <p className="text-caption text-muted-foreground" data-testid="q3-mean">
                  Mean absolute off-diagonal Q3 is {fmt(meanAbs, 3)}. The flag stays the fixed
                  threshold above, so a pair can sit above this mean and still be unflagged.
                </p>
              )}
              {Array.isArray(q3?.itemIds) && Array.isArray(q3?.values) && (
                <div className="max-h-64 overflow-auto rounded-md border border-border">
                  <table className="w-full text-caption" data-testid="q3-matrix">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="px-2 py-1">Item</th>
                        {q3.itemIds.map((id) => (
                          <th key={id} className="px-2 py-1 font-mono">{id}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {q3.values.map((row, i) => (
                        <tr key={q3.itemIds[i] || i}>
                          <th className="px-2 py-1 text-left font-mono font-normal">{q3.itemIds[i]}</th>
                          {row.map((cell, j) => {
                            const flagged = i !== j && typeof cell === "number" && Math.abs(cell) > threshold;
                            return (
                              <td
                                key={`${i}-${j}`}
                                className={flagged ? "bg-amber-100 px-2 py-1 tabular-nums font-medium" : "px-2 py-1 tabular-nums text-muted-foreground"}
                              >
                                {fmt(cell, 3)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
