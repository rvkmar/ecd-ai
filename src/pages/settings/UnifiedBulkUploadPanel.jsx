// src/pages/settings/UnifiedBulkUploadPanel.jsx
// ------------------------------------------------------------
// Settings > Data > Upload -- unified, staged importer.
//
// Pick any subset of { Student Models, evidence models, task models,
// items } as separate JSON files in one go. The panel detects what each
// file holds, then walks the ECD dependency chain in fixed order:
//
//   Student Models -> evidence models -> task models -> items
//
// Everything it creates is a DRAFT, and a draft may be bound to a draft:
// the bulk endpoints pass `allowDraftParents` (see src/utils/schema.js),
// so an imported task model may cite a still-draft evidence model and an
// imported item a still-draft task model. Nothing is confirmed or locked
// on the user's behalf, and nothing needs to be mid-import -- the
// confirmed+locked chain is enforced at confirmation, afterwards, in the
// builders.
//
// What the stages are still for: cross-file references are real,
// system-generated ids, never resolved by name. So each stage is
// upload -> read the generated ids off the results table -> paste them
// into the next file -> Replace file -> Continue.
//
// This is a pure client-side orchestration of the existing per-entity
// /bulk endpoints (see BulkUploadCard for the single-entity variant).
// No new server routes; each row is validated exactly as a manual
// single create would be.
// ------------------------------------------------------------

import React, { useMemo, useRef, useState } from "react";
import {
  UploadCloud,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  Copy,
  RotateCcw,
  AlertTriangle,
  FileJson,
} from "lucide-react";
import toast from "react-hot-toast";
import { useBulkUpload } from "@/api/queries/bulkUpload";
import { apiErrorMessage } from "@/api/apiClient";
import { competencyModelsKey } from "@/api/queries/competencies";
import { evidenceModelsKey } from "@/api/queries/evidenceModels";
import { taskModelsKey } from "@/api/queries/taskModels";
import { itemsKey } from "@/api/queries/items";

// Fixed dependency order. Index in this array IS the upload order.
const STAGES = [
  {
    key: "competencyModels",
    title: "Student Models",
    endpoint: "/api/competencies/models/bulk",
    // What the user must do after this stage before the next one can succeed.
    gate:
      "Copy the competency ids you need into the evidence model file's competencyId (or give a competencyName that matches exactly one competency). The Student Model does not have to be confirmed first.",
  },
  {
    key: "evidenceModels",
    title: "Evidence Models",
    endpoint: "/api/evidenceModels/bulk",
    gate:
      "Copy these ids into the task model file's evidenceModelIds (and primaryEvidenceModelId). They are drafts and may stay drafts -- confirm them later, in the Evidence Model builder.",
  },
  {
    key: "taskModels",
    title: "Task Models",
    endpoint: "/api/taskModels/bulk",
    gate:
      "Copy these ids into the item file's taskModelId. Each item's observationId must be one the task model declares in expectedObservations -- that check still applies. The task model may stay a draft.",
  },
  {
    key: "items",
    title: "Items",
    endpoint: "/api/items/bulk",
    gate: "",
  },
];

const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s]));

// Accept either a bare JSON array or a single-key wrapper object
// ({ "evidenceModels": [...] }), matching BulkUploadCard's tolerance.
// Returns { rows, wrapperKey } or null when the shape is neither.
function unwrapToArray(parsed) {
  if (Array.isArray(parsed)) return { rows: parsed, wrapperKey: "" };
  if (parsed && typeof parsed === "object") {
    const entries = Object.entries(parsed);
    if (entries.length === 1 && Array.isArray(entries[0][1])) {
      return { rows: entries[0][1], wrapperKey: entries[0][0] };
    }
  }
  return null;
}

// Best-effort "what is this file?" -- shape first (reliable), wrapper key
// next, filename last. Always overridable in the UI, and an unrecognised
// file is simply left unassigned rather than guessed into a wrong stage.
function detectKind(rows, fileName, wrapperKey) {
  const sample = rows.find((r) => r && typeof r === "object" && !Array.isArray(r));
  if (sample) {
    const has = (k) => Object.prototype.hasOwnProperty.call(sample, k);
    if (has("claimStatement") || has("warrants") || has("observables") || has("evidenceRules"))
      return "evidenceModels";
    if (has("evidenceModelIds") || has("primaryEvidenceModelId") || has("expectedObservations"))
      return "taskModels";
    if (has("taskModelId") || has("observationId")) return "items";
    if (has("measurementIntent") || has("competencies") || has("constructFramework"))
      return "competencyModels";
  }

  const wrapper = String(wrapperKey || "").toLowerCase();
  if (wrapper) {
    if (wrapper.includes("evidence")) return "evidenceModels";
    if (wrapper.includes("task")) return "taskModels";
    if (wrapper.includes("item")) return "items";
    if (wrapper.includes("competenc")) return "competencyModels";
  }

  const name = String(fileName || "").toLowerCase();
  if (name.includes("item")) return "items";
  if (name.includes("task")) return "taskModels";
  if (name.includes("evidence")) return "evidenceModels";
  if (name.includes("competenc")) return "competencyModels";

  return "";
}

function readJsonFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const unwrapped = unwrapToArray(JSON.parse(reader.result));
        if (!unwrapped) {
          resolve({ fileName: file.name, error: "File must contain a JSON array of objects." });
          return;
        }
        resolve({
          fileName: file.name,
          rows: unwrapped.rows,
          kind: detectKind(unwrapped.rows, file.name, unwrapped.wrapperKey),
        });
      } catch (err) {
        resolve({ fileName: file.name, error: `Invalid JSON: ${err.message}` });
      }
    };
    reader.onerror = () => resolve({ fileName: file.name, error: "Failed to read file." });
    reader.readAsText(file);
  });
}

async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Clipboard unavailable — select and copy manually.");
  }
}

export default function UnifiedBulkUploadPanel() {
  const pickerRef = useRef(null);
  const replaceRef = useRef(null);

  // phase: "select" (choosing files) | "run" (walking the stages)
  const [phase, setPhase] = useState("select");
  // [{ fileName, rows?, error?, kind }] in the order the user picked them
  const [files, setFiles] = useState([]);
  const [stepIndex, setStepIndex] = useState(0);
  // { [stageKey]: { created, failed, results } }
  const [responses, setResponses] = useState({});

  // Four unconditional hooks in a fixed order — one per bulk endpoint.
  const uploaders = {
    competencyModels: useBulkUpload("/api/competencies/models/bulk", competencyModelsKey),
    evidenceModels: useBulkUpload("/api/evidenceModels/bulk", evidenceModelsKey),
    taskModels: useBulkUpload("/api/taskModels/bulk", taskModelsKey),
    items: useBulkUpload("/api/items/bulk", itemsKey),
  };

  // Assigned files, deduplicated by kind, sorted into dependency order.
  const plan = useMemo(() => {
    const byKind = new Map();
    files.forEach((f) => {
      if (f.kind && !f.error && !byKind.has(f.kind)) byKind.set(f.kind, f);
    });
    return STAGES.filter((s) => byKind.has(s.key)).map((s) => ({ stage: s, file: byKind.get(s.key) }));
  }, [files]);

  const duplicateKinds = useMemo(() => {
    const seen = new Set();
    const dupes = new Set();
    files.forEach((f) => {
      if (!f.kind || f.error) return;
      if (seen.has(f.kind)) dupes.add(f.kind);
      seen.add(f.kind);
    });
    return dupes;
  }, [files]);

  const handlePick = async (e) => {
    const picked = Array.from(e.target.files || []);
    if (picked.length === 0) return;
    const parsed = await Promise.all(picked.map(readJsonFile));
    setFiles(parsed);
    setResponses({});
    setStepIndex(0);
    setPhase("select");
    if (pickerRef.current) pickerRef.current.value = "";
  };

  const setKind = (idx, kind) =>
    setFiles((prev) => prev.map((f, i) => (i === idx ? { ...f, kind } : f)));

  const reset = () => {
    setFiles([]);
    setResponses({});
    setStepIndex(0);
    setPhase("select");
  };

  const current = plan[stepIndex];
  const currentResponse = current ? responses[current.stage.key] : null;
  const currentUploader = current ? uploaders[current.stage.key] : null;

  // Re-pick just the current stage's file — the normal case once the
  // previous stage's generated ids have been pasted into it.
  const handleReplace = async (e) => {
    const file = e.target.files?.[0];
    if (replaceRef.current) replaceRef.current.value = "";
    if (!file || !current) return;
    const parsed = await readJsonFile(file);
    if (parsed.error) {
      toast.error(parsed.error);
      return;
    }
    // Keep the stage the user is standing on; ignore re-detection.
    setFiles((prev) =>
      prev.map((f) => (f.kind === current.stage.key ? { ...parsed, kind: current.stage.key } : f))
    );
    setResponses((prev) => {
      const next = { ...prev };
      delete next[current.stage.key];
      return next;
    });
    toast.success(`${file.name} loaded (${parsed.rows.length} row(s))`);
  };

  const handleUpload = async () => {
    if (!current) return;
    const { stage, file } = current;
    if (!file.rows || file.rows.length === 0) return;
    try {
      const result = await uploaders[stage.key].mutateAsync(file.rows);
      setResponses((prev) => ({ ...prev, [stage.key]: result }));
      if (result.failed === 0) toast.success(`✅ ${stage.title}: ${result.created} row(s) created`);
      else
        toast(`⚠️ ${stage.title}: ${result.created} created, ${result.failed} failed`, {
          icon: "⚠️",
        });
    } catch (err) {
      toast.error(`❌ ${stage.title} upload failed: ${apiErrorMessage(err, err.message)}`);
    }
  };

  const createdRows = currentResponse ? currentResponse.results.filter((r) => r.ok) : [];
  const failedRows = currentResponse ? currentResponse.results.filter((r) => !r.ok) : [];
  const isLastStage = current ? stepIndex === plan.length - 1 : false;

  return (
    <div className="rounded-xl border border-border p-4 space-y-4">
      <div>
        <div className="font-medium">Unified upload (staged)</div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Select any combination of Student Model, evidence model, task model, and item JSON
          files — they don't all have to be present. Everything is created as a{" "}
          <span className="font-medium text-foreground">draft</span>, and a draft may reference a
          draft, so nothing has to be confirmed or locked mid-import. The panel uploads in
          dependency order and pauses after each stage only so you can copy the generated ids into
          the next file.
        </p>
      </div>

      {/* ---------------- select phase ---------------- */}
      {phase === "select" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 px-3 py-2 text-sm border border-input rounded-md cursor-pointer hover:bg-muted">
              <UploadCloud size={14} />
              Choose JSON files
              <input
                ref={pickerRef}
                type="file"
                multiple
                accept="application/json,.json"
                className="hidden"
                onChange={handlePick}
              />
            </label>
            {files.length > 0 && (
              <button
                type="button"
                onClick={reset}
                className="px-3 py-2 text-sm border border-input rounded-md"
              >
                Clear
              </button>
            )}
          </div>

          {files.length > 0 && (
            <div className="border border-border rounded-md overflow-hidden">
              <table className="min-w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-2 py-1 text-left">File</th>
                    <th className="px-2 py-1 text-left">Rows</th>
                    <th className="px-2 py-1 text-left">Upload as</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((f, i) => (
                    <tr key={`${f.fileName}-${i}`} className="border-t border-border">
                      <td className="px-2 py-1 truncate max-w-[220px]">{f.fileName}</td>
                      <td className="px-2 py-1">
                        {f.error ? (
                          <span className="text-destructive">{f.error}</span>
                        ) : (
                          `${f.rows.length}`
                        )}
                      </td>
                      <td className="px-2 py-1">
                        <select
                          disabled={!!f.error}
                          value={f.kind || ""}
                          onChange={(e) => setKind(i, e.target.value)}
                          className="border border-input rounded-md px-2 py-1 bg-background disabled:opacity-50"
                        >
                          <option value="">— skip —</option>
                          {STAGES.map((s) => (
                            <option key={s.key} value={s.key}>
                              {s.title}
                            </option>
                          ))}
                        </select>
                        {duplicateKinds.has(f.kind) && (
                          <span className="ml-2 text-amber-600">
                            duplicate — only the first is used
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {plan.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Upload order:{" "}
              <span className="font-medium text-foreground">
                {plan.map((p) => p.stage.title).join(" → ")}
              </span>
            </div>
          )}

          <button
            type="button"
            disabled={plan.length === 0}
            onClick={() => {
              setStepIndex(0);
              setResponses({});
              setPhase("run");
            }}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50"
          >
            Start upload <ArrowRight size={14} />
          </button>
        </>
      )}

      {/* ---------------- run phase ---------------- */}
      {phase === "run" && current && (
        <>
          {/* stage rail */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {plan.map((p, i) => {
              const done = !!responses[p.stage.key] && i < stepIndex;
              const active = i === stepIndex;
              return (
                <React.Fragment key={p.stage.key}>
                  {i > 0 && <span className="text-muted-foreground">→</span>}
                  <span
                    className={
                      "px-2 py-1 rounded-md border " +
                      (active
                        ? "border-primary text-primary font-medium"
                        : done
                        ? "border-border text-green-600"
                        : "border-border text-muted-foreground")
                    }
                  >
                    {done && "✓ "}
                    {p.stage.title}
                  </span>
                </React.Fragment>
              );
            })}
          </div>

          <div className="rounded-lg border border-border p-3 space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="font-medium text-sm">
                Stage {stepIndex + 1} of {plan.length} — {current.stage.title}
              </div>
              <div className="text-xs text-muted-foreground truncate max-w-[280px]">
                {current.file.fileName} · {current.file.rows.length} row(s)
              </div>
            </div>

            {!currentResponse && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={currentUploader?.isPending}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50"
                >
                  {currentUploader?.isPending && <Loader2 size={14} className="animate-spin" />}
                  {currentUploader?.isPending
                    ? "Uploading..."
                    : `Upload ${current.stage.title.toLowerCase()}`}
                </button>
                <label className="flex items-center gap-2 px-3 py-2 text-sm border border-input rounded-md cursor-pointer hover:bg-muted">
                  <UploadCloud size={14} />
                  Replace file
                  <input
                    ref={replaceRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={handleReplace}
                  />
                </label>
                <span className="text-xs text-muted-foreground">
                  Re-pick this stage's file if you've just pasted ids from the previous stage into
                  it.
                </span>
              </div>
            )}

            {currentResponse && (
              <div className="space-y-3">
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle2 size={14} /> {currentResponse.created} created
                  </span>
                  {currentResponse.failed > 0 && (
                    <span className="flex items-center gap-1 text-destructive">
                      <XCircle size={14} /> {currentResponse.failed} failed
                    </span>
                  )}
                </div>

                {createdRows.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium">Generated ids</div>
                      <button
                        type="button"
                        onClick={() =>
                          copyText(
                            JSON.stringify(
                              createdRows.map((r) => ({ name: r.name, id: r.id })),
                              null,
                              2
                            ),
                            "All ids"
                          )
                        }
                        className="flex items-center gap-1 text-xs px-2 py-1 border border-input rounded-md"
                      >
                        <Copy size={12} /> Copy all
                      </button>
                    </div>
                    <div className="max-h-56 overflow-y-auto border border-border rounded-md">
                      <table className="min-w-full text-xs">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="px-2 py-1 text-left">Row</th>
                            <th className="px-2 py-1 text-left">Name</th>
                            <th className="px-2 py-1 text-left">Id</th>
                            <th className="px-2 py-1" />
                          </tr>
                        </thead>
                        <tbody>
                          {createdRows.map((r) => (
                            <tr key={r.index} className="border-t border-border">
                              <td className="px-2 py-1">{r.index + 1}</td>
                              <td className="px-2 py-1">
                                {r.name || "—"}
                                {typeof r.competenciesCreated === "number" && (
                                  <span className="text-muted-foreground">
                                    {" "}
                                    ({r.competenciesCreated} competenc
                                    {r.competenciesCreated === 1 ? "y" : "ies"}
                                    {r.competenciesFailed ? `, ${r.competenciesFailed} failed` : ""}
                                    )
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1 font-mono">{r.id}</td>
                              <td className="px-2 py-1 text-right">
                                <button
                                  type="button"
                                  onClick={() => copyText(r.id, "Id")}
                                  className="text-muted-foreground hover:text-foreground"
                                  title="Copy id"
                                >
                                  <Copy size={12} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Nested competency ids, when this stage created them. */}
                    {createdRows.some((r) => Array.isArray(r.competencyResults) && r.competencyResults.length > 0) && (
                      <div className="max-h-40 overflow-y-auto border border-border rounded-md">
                        <table className="min-w-full text-xs">
                          <thead className="bg-muted/50 sticky top-0">
                            <tr>
                              <th className="px-2 py-1 text-left">Competency</th>
                              <th className="px-2 py-1 text-left">Id / error</th>
                            </tr>
                          </thead>
                          <tbody>
                            {createdRows.flatMap((r) =>
                              (r.competencyResults || []).map((c) => (
                                <tr key={`${r.index}-${c.index}`} className="border-t border-border">
                                  <td className="px-2 py-1">{c.name || `row ${c.index + 1}`}</td>
                                  <td
                                    className={
                                      "px-2 py-1 " + (c.ok ? "font-mono" : "text-destructive")
                                    }
                                  >
                                    {c.ok ? c.id : c.error}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {failedRows.length > 0 && (
                  <div className="max-h-48 overflow-y-auto border border-border rounded-md">
                    <table className="min-w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="px-2 py-1 text-left">Row</th>
                          <th className="px-2 py-1 text-left">Status</th>
                          <th className="px-2 py-1 text-left">Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {failedRows.map((r) => (
                          <tr key={r.index} className="border-t border-border">
                            <td className="px-2 py-1">{r.index + 1}</td>
                            <td className="px-2 py-1 text-destructive">Failed</td>
                            <td className="px-2 py-1">
                              {r.error}
                              {Array.isArray(r.details) && r.details.length > 0
                                ? ` — ${r.details.join("; ")}`
                                : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {failedRows.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 px-3 py-2 text-xs border border-input rounded-md cursor-pointer hover:bg-muted">
                      <RotateCcw size={12} />
                      Fix the file and retry this stage
                      <input
                        type="file"
                        accept="application/json,.json"
                        className="hidden"
                        onChange={handleReplace}
                      />
                    </label>
                    <span className="text-xs text-muted-foreground">
                      Rows that already succeeded would be created again — trim the file to the
                      failed rows first.
                    </span>
                  </div>
                )}

                {!isLastStage && (
                  <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium">
                      <FileJson size={12} /> Before continuing
                    </div>
                    <p className="text-xs text-muted-foreground">{current.stage.gate}</p>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {!isLastStage ? (
                    <button
                      type="button"
                      onClick={() => setStepIndex((i) => i + 1)}
                      className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md"
                    >
                      Continue to {plan[stepIndex + 1].stage.title} <ArrowRight size={14} />
                    </button>
                  ) : (
                    <span className="flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle2 size={14} /> All stages complete.
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={reset}
                    className="px-3 py-2 text-sm border border-input rounded-md"
                  >
                    Start over
                  </button>
                </div>
              </div>
            )}

            {!currentResponse && current.stage.key !== plan[0].stage.key && (
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                Rows here are refused if a parent they reference does not exist yet — run the
                earlier stage first. A parent that exists but is still a draft is accepted;
                confirming and locking the chain happens afterwards, in the builders.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
