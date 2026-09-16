// src/pages/settings/BulkUploadCard.jsx
// ------------------------------------------------------------
// One self-contained card: pick a .json file containing an array of
// entity objects, preview the row count, upload, and show a per-row
// success/failure table. Every entity type gets its own independent
// instance of this card (per the "independent uploaders, same rules as
// manual creation" decision) -- each row is validated and inserted with
// the exact same logic the single-create form/API already enforces, so
// a row referencing a parent that isn't confirmed+locked yet just fails
// that row rather than being smart about ordering.
// ------------------------------------------------------------

import React, { useRef, useState } from "react";
import { UploadCloud, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useBulkUpload } from "@/api/queries/bulkUpload";
import { apiErrorMessage } from "@/api/apiClient";
import { normalizeStudentModelBulkRows } from "@/utils/studentModelBulkNormalize";

// A file is normally just a bare JSON array of entity objects. As a
// convenience, also accept a single wrapper object whose only property is
// that array -- e.g. { "competencyModels": [...] } -- so exports/samples
// that name the collection at the top level don't need hand-editing before
// upload. Student Model cards additionally accept a Step 9 specification
// export ({ model, competencies, smVariables }). Returns the array to use,
// or null if the shape doesn't match.
function unwrapToArray(parsed, { studentModel = false } = {}) {
  if (studentModel) {
    return normalizeStudentModelBulkRows(parsed, {
      assumeArrayIsStudentModel: true,
    });
  }
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const values = Object.values(parsed);
    if (values.length === 1 && Array.isArray(values[0])) return values[0];
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
}) {
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState(null); // parsed array, null until a valid file is picked
  const [parseError, setParseError] = useState("");
  const [response, setResponse] = useState(null); // { created, failed, results }

  const bulkUpload = useBulkUpload(endpoint, invalidateKey);

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
        const nextRows = unwrapToArray(parsed, { studentModel });
        if (!nextRows) {
          setParseError(
            studentModel
              ? "File must be a Student Model array, { competencyModels: [...] }, a single model, or a Step 9 specification export ({ model, competencies })."
              : "File must contain a JSON array of objects."
          );
          return;
        }
        setRows(nextRows);
      } catch (err) {
        setParseError(`Invalid JSON: ${err.message}`);
      }
    };
    reader.onerror = () => setParseError("Failed to read file.");
    reader.readAsText(file);
  };

  const handleUpload = async () => {
    if (!rows || rows.length === 0) return;
    try {
      const result = await bulkUpload.mutateAsync(rows);
      setResponse(result);
      if (result.failed === 0) {
        toast.success(`✅ ${title}: ${result.created} row(s) created`);
      } else {
        toast(`⚠️ ${title}: ${result.created} created, ${result.failed} failed`, {
          icon: "⚠️",
        });
      }
    } catch (err) {
      toast.error(`❌ Bulk upload failed: ${apiErrorMessage(err, err.message)}`);
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
          disabled={!rows || rows.length === 0 || bulkUpload.isPending}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50"
        >
          {bulkUpload.isPending && <Loader2 size={14} className="animate-spin" />}
          {bulkUpload.isPending ? "Uploading..." : "Upload"}
        </button>
        {(fileName || response) && (
          <button
            type="button"
            onClick={resetFile}
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
