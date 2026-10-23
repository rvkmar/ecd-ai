// Settings > Data. One zip for every ECD collection, plus the matching export.
// The server walks dependency order and rewrites ids. This panel only
// sends the archive and shows the per-entity report.

import React, { useState } from "react";
import { UploadCloud, DownloadCloud, Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/auth/AuthProvider";
import { apiErrorMessage, apiFetch } from "@/api/apiClient";

const ENTITY_LABELS = {
  curricularPolicies: "Curricular policies",
  policies: "Selection policies",
  domainAnalyses: "Domain analyses",
  taskModelVariables: "Task model variables",
  competencyModels: "Student Models",
  competencies: "Competencies",
  designPatterns: "Design patterns",
  evidenceModels: "Evidence models",
  taskModels: "Task models",
  items: "Items",
  qMatrixModels: "Q-matrix models",
  assemblyModels: "Assembly models",
  presentationModels: "Presentation models",
  templates: "Templates",
};

function ResultLine({ row }) {
  if (row.ok) {
    return (
      <li className="text-xs text-muted-foreground">
        <span className="text-foreground">{row.name || row.id}</span>
        {row.sourceId ? ` (${row.sourceId} → ${row.id})` : row.id ? ` → ${row.id}` : ""}
        {row.idKept ? " · original id kept" : ""}
        {row.warnings?.length ? ` · ${row.warnings.join(" ")}` : ""}
      </li>
    );
  }
  const detail = Array.isArray(row.details) && row.details.length ? `: ${row.details[0]}` : "";
  return (
    <li className="text-xs text-destructive">
      Row {row.index + 1}
      {row.name ? ` (${row.name})` : ""}: {row.error}
      {detail}
    </li>
  );
}

function EntityReport({ collection, summary }) {
  const failures = (summary.results || []).filter((row) => !row.ok);
  const warnings = (summary.results || []).filter((row) => row.ok && row.warnings?.length);
  const shown = [...failures, ...warnings].slice(0, 6);
  const hidden = failures.length + warnings.length - shown.length;
  return (
    <div className="rounded-lg border border-border px-3 py-2 space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm font-medium">{ENTITY_LABELS[collection] || collection}</div>
        <div className="text-xs text-muted-foreground">
          {summary.fileError
            ? "file error"
            : `${summary.created} created · ${summary.failed} failed`}
        </div>
      </div>
      {summary.fileError && <p className="text-xs text-destructive">{summary.fileError}</p>}
      {shown.length > 0 && (
        <ul className="space-y-0.5">
          {shown.map((row) => (
            <ResultLine key={`${row.index}-${row.ok ? "ok" : "bad"}`} row={row} />
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <p className="text-xs text-muted-foreground">{hidden} more row message(s) not shown.</p>
      )}
    </div>
  );
}

export function ZipReport({ report }) {
  if (!report) return null;
  return (
    <div className="space-y-2" data-testid="zip-report">
      <p className="text-sm">
        {report.dryRun ? "Preview" : "Imported"}: {report.totals.created} created,{" "}
        {report.totals.failed} failed
        {report.keepOriginalIds ? ", keeping free original ids" : ""}.
      </p>
      {report.skipped?.length > 0 && (
        <div className="text-xs text-muted-foreground">
          <div className="font-medium text-foreground">Skipped files</div>
          <ul>
            {report.skipped.map((row) => (
              <li key={row.file}>
                {row.file}: {row.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-2">
        {(report.order || []).map((collection) => (
          <EntityReport
            key={collection}
            collection={collection}
            summary={report.entities[collection]}
          />
        ))}
      </div>
    </div>
  );
}

export function ZipExportButton() {
  const { auth } = useAuth() || {};
  const [busy, setBusy] = useState(false);

  const onExport = async () => {
    setBusy(true);
    try {
      const blob = await apiFetch("/api/data/zip", { responseType: "blob" }, auth);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "ecd-entities.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Exported all entities as a zip.");
    } catch (err) {
      toast.error(apiErrorMessage(err, err.message || "Export failed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onExport}
      disabled={busy}
      className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50"
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <DownloadCloud size={14} />}
      {busy ? "Preparing..." : "Export all as zip"}
    </button>
  );
}

export default function ZipBundlePanel() {
  const { auth } = useAuth() || {};
  const [file, setFile] = useState(null);
  const [keepOriginalIds, setKeepOriginalIds] = useState(false);
  const [preview, setPreview] = useState(null);
  const [committed, setCommitted] = useState(null);
  const [busy, setBusy] = useState(false);

  const postZip = async (dryRun) => {
    const params = new URLSearchParams({
      dryRun: dryRun ? "1" : "0",
      keepOriginalIds: keepOriginalIds ? "1" : "0",
    });
    return apiFetch(
      `/api/data/zip?${params}`,
      {
        method: "POST",
        rawBody: true,
        headers: { "Content-Type": "application/zip" },
        body: file,
      },
      auth
    );
  };

  const onPreview = async () => {
    if (!file) return;
    setBusy(true);
    setCommitted(null);
    try {
      const report = await postZip(true);
      setPreview(report);
    } catch (err) {
      setPreview(null);
      toast.error(apiErrorMessage(err, err.message || "Preview failed."));
    } finally {
      setBusy(false);
    }
  };

  const onCommit = async () => {
    if (!file || !preview) return;
    setBusy(true);
    try {
      const report = await postZip(false);
      setCommitted(report);
      setPreview(null);
      toast.success(`Imported ${report.totals.created} record(s).`);
    } catch (err) {
      toast.error(apiErrorMessage(err, err.message || "Import failed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div>
        <h3 className="text-base font-semibold">All entities in one zip</h3>
        <p className="text-sm text-muted-foreground mt-1">
          One JSON file per entity (policies.json, curricularPolicies.json, domainAnalyses.json,
          competencyModels.json, competencies.json, evidenceModels.json, taskModelVariables.json,
          taskModels.json, items.json, qMatrixModels.json, assemblyModels.json,
          designPatterns.json, presentationModels.json, templates.json). A file may be a bare
          array or a one-key wrapper. Preview checks every row, then Import writes the rows that
          passed. A bad row does not cancel the rest. Files that are not an entity are skipped.
          Helper fields such as _origin and _sources are ignored. New ids and draft status are
          the default; cross-references are rewritten to the new ids.
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={keepOriginalIds}
          onChange={(event) => {
            setKeepOriginalIds(event.target.checked);
            setPreview(null);
            setCommitted(null);
          }}
        />
        <span>
          Keep original ids and statuses when the id is not already taken.
          <span className="block text-xs text-muted-foreground">
            A repeated id inside the zip keeps the first free copy and gives later copies a new
            id and draft status. Leave this off unless you are loading demo data that should
            match its original ids.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 px-3 py-2 text-sm border border-input rounded-md cursor-pointer">
          <UploadCloud size={14} />
          <span className="max-w-[16rem] truncate">{file ? file.name : "Choose zip"}</span>
          <input
            type="file"
            accept=".zip,application/zip"
            aria-label="ECD entity zip"
            className="sr-only"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setPreview(null);
              setCommitted(null);
            }}
          />
        </label>
        <button
          type="button"
          onClick={onPreview}
          disabled={!file || busy}
          className="px-4 py-2 text-sm border border-input rounded-md disabled:opacity-50"
        >
          {busy && !preview ? "Checking..." : "Preview"}
        </button>
        <button
          type="button"
          onClick={onCommit}
          disabled={!file || !preview || busy}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50"
        >
          {busy && preview ? <Loader2 size={14} className="animate-spin" /> : null}
          Import
        </button>
      </div>

      {preview && (
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center gap-1 text-sm">
            <AlertTriangle size={14} />
            Nothing has been written yet.
          </div>
          <ZipReport report={preview} />
        </div>
      )}

      {committed && (
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center gap-1 text-sm text-green-600">
            {committed.totals.failed > 0 ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
            Import finished.
          </div>
          <ZipReport report={committed} />
        </div>
      )}
    </div>
  );
}
