// src/pages/settings/BulkUploadCard.jsx
// ------------------------------------------------------------
// One self-contained card: pick a .json file containing an array of
// entity objects, preview the row count, upload, and show a per-row
// success/failure table.
//
// Evidence Model cards additionally ask for a Student Model
// (competencyModelId). Upload stays manual: choose id + file, then click
// Upload. competencyName remapping is scoped to that model.
// ------------------------------------------------------------

import React, { useRef, useState } from "react";
import { UploadCloud, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useBulkUpload } from "@/api/queries/bulkUpload";
import { apiErrorMessage } from "@/api/apiClient";
import { normalizeStudentModelBulkRows } from "@/utils/studentModelBulkNormalize";
import { useCompetencyModels } from "@/api/queries/competencies";

function unwrapToArray(parsed, { studentModel = false, evidenceModel = false } = {}) {
  if (studentModel) {
    return normalizeStudentModelBulkRows(parsed, {
      assumeArrayIsStudentModel: true,
    });
  }
  if (Array.isArray(parsed)) return { rows: parsed, competencyModelId: null };
  if (parsed && typeof parsed === "object") {
    if (evidenceModel && Array.isArray(parsed.evidenceModels)) {
      return {
        rows: parsed.evidenceModels,
        competencyModelId: parsed.competencyModelId || null,
      };
    }
    const values = Object.values(parsed);
    if (values.length === 1 && Array.isArray(values[0])) {
      return { rows: values[0], competencyModelId: null };
    }
  }
  return null;
}

export default function BulkUploadCard({
  title,
  description,
  endpoint,
  invalidateKey,
  sampleHint,
  studentModel = false,
  evidenceModel = false,
}) {
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState(null);
  const [parseError, setParseError] = useState("");
  const [response, setResponse] = useState(null);
  const [studentModelId, setStudentModelId] = useState("");

  const bulkUpload = useBulkUpload(endpoint, invalidateKey);
  const { data: competencyModels = [] } = useCompetencyModels({
    enabled: evidenceModel,
  });

  const resetFile = () => {
    setFileName("");
    setRows(null);
    setParseError("");
    setResponse(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    setResponse(null);
    if (!file) return;

    setFileName(file.name);
    setParseError("");
    setRows(null);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const unwrapped = unwrapToArray(parsed, { studentModel, evidenceModel });
        if (!unwrapped) {
          setParseError(
            studentModel
              ? "File must be a Student Model array, { competencyModels: [...] }, a single model, or a Step 9 specification export ({ model, competencies })."
              : evidenceModel
                ? 'File must be an evidence-model array or { evidenceModels: [...], competencyModelId? }.'
                : "File must contain a JSON array of objects."
          );
          return;
        }
        // Student Model unwrap returns a bare array; EM/other return { rows }.
        if (Array.isArray(unwrapped)) {
          setRows(unwrapped);
        } else {
          setRows(unwrapped.rows);
          if (evidenceModel && unwrapped.competencyModelId) {
            setStudentModelId(unwrapped.competencyModelId);
          }
        }
      } catch (err) {
        setParseError(`Invalid JSON: ${err.message}`);
      }
    };
    reader.onerror = () => setParseError("Failed to read file.");
    reader.readAsText(file);
  };

  const handleUpload = async () => {
    if (!rows || rows.length === 0) return;
    const scopedId = studentModelId.trim();
    if (evidenceModel && !scopedId) {
      toast.error("Select or enter a Student Model id before uploading Evidence Models.");
      return;
    }
    try {
      const body =
        evidenceModel
          ? { competencyModelId: scopedId, evidenceModels: rows }
          : rows;
      const result = await bulkUpload.mutateAsync(body);
      setResponse(result);
      if (result.failed === 0) {
        toast.success(`${title}: ${result.created} row(s) created`);
      } else {
        toast(`${title}: ${result.created} created, ${result.failed} failed`, {
          icon: "!",
        });
      }
    } catch (err) {
      toast.error(`Bulk upload failed: ${apiErrorMessage(err, err.message)}`);
    }
  };

  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div>
        <div className="font-medium">{title}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>

      {evidenceModel && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">
            Student Model id
          </label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={
              competencyModels.some((m) => m.id === studentModelId)
                ? studentModelId
                : studentModelId
                  ? "__custom__"
                  : ""
            }
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__custom__") return;
              setStudentModelId(v);
              setResponse(null);
            }}
          >
            <option value="">Select a Student Model…</option>
            {competencyModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || m.id} ({m.id})
                {m.status ? ` · ${m.status}` : ""}
              </option>
            ))}
            {studentModelId &&
              !competencyModels.some((m) => m.id === studentModelId) && (
                <option value="__custom__">Custom: {studentModelId}</option>
              )}
          </select>
          <input
            type="text"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
            placeholder="Or paste competencyModelId…"
            value={studentModelId}
            onChange={(e) => {
              setStudentModelId(e.target.value);
              setResponse(null);
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            Required. Scopes <code>competencyName</code> remapping to this Student
            Model. Choose a JSON file, then click Upload.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 px-3 py-2 text-sm border border-input rounded-md cursor-pointer hover:bg-muted">
          <UploadCloud size={14} />
          Choose JSON file
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleFileChange}
          />
        </label>
        {fileName && (
          <span className="text-xs text-muted-foreground truncate max-w-[200px]">
            {fileName}
          </span>
        )}
        {rows && !parseError && (
          <span className="text-xs text-muted-foreground">
            {rows.length} row(s) detected
          </span>
        )}
      </div>

      {parseError && <p className="text-xs text-destructive">{parseError}</p>}

      {sampleHint && !fileName && (
        <p className="text-xs text-muted-foreground italic">{sampleHint}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleUpload}
          disabled={
            !rows ||
            rows.length === 0 ||
            bulkUpload.isPending ||
            (evidenceModel && !studentModelId.trim())
          }
          className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50"
        >
          {bulkUpload.isPending && <Loader2 size={14} className="animate-spin" />}
          {bulkUpload.isPending
            ? "Uploading..."
            : evidenceModel && !studentModelId.trim()
              ? "Enter Student Model id to upload"
              : "Upload"}
        </button>
        {(fileName || response || studentModelId) && (
          <button
            type="button"
            onClick={() => {
              resetFile();
              if (evidenceModel) setStudentModelId("");
            }}
            className="px-3 py-2 text-sm border border-input rounded-md"
          >
            Clear
          </button>
        )}
      </div>

      {response && (
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1 text-green-600">
              <CheckCircle2 size={14} /> {response.created} created
            </span>
            {response.failed > 0 && (
              <span className="flex items-center gap-1 text-destructive">
                <XCircle size={14} /> {response.failed} failed
              </span>
            )}
          </div>

          {response.failed > 0 && (
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
                  {response.results
                    .filter((r) => !r.ok)
                    .map((r) => (
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
        </div>
      )}
    </div>
  );
}
