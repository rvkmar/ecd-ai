// src/components/templates/TaskSpecFamilyPanel.jsx
//
// D153. Preview table of TMV assignments (same plan generate uses) and
// the generated family view: varying TMVs as columns, fixed as a note.
// Generate confirms the preview. Replace regenerates. Retire deletes
// the template's specs. Specs have no CAF status.

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/Modal";
import { apiErrorMessage } from "@/api/apiClient";
import {
  assignmentsFromSpecs,
  taskSpecFamilyMatrix,
} from "@/utils/taskSpecFamilyMatrix";

function FamilyMatrixTable({ matrix, testId }) {
  if (!matrix || matrix.size === 0) return null;
  const showIndex = matrix.columns.length === 0;
  return (
    <div className="mt-2 overflow-x-auto">
      <table
        className="w-full border-collapse text-left text-xs text-slate-800"
        data-testid={testId}
      >
        <thead>
          <tr className="border-b border-slate-200">
            {showIndex ? (
              <th className="py-1 pr-2 font-medium text-slate-600">Spec</th>
            ) : (
              matrix.columns.map((col) => (
                <th key={col.id} className="py-1 pr-2 font-medium text-slate-600">
                  {col.label}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={row.index} className="border-b border-slate-100">
              {showIndex ? (
                <td className="py-1 pr-2 tabular-nums">{row.index + 1}</td>
              ) : (
                matrix.columns.map((col) => (
                  <td key={col.id} className="py-1 pr-2">
                    {row.labels[col.id] || row.cells[col.id] || "—"}
                  </td>
                ))
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fixedNote(matrix) {
  if (!matrix?.fixed?.length) return null;
  return matrix.fixed
    .map((row) => `${row.label}: ${row.valueLabel || row.value}`)
    .join(" · ");
}

export default function TaskSpecFamilyPanel({
  preview = null,
  previewPending = false,
  previewError = null,
  specs = [],
  variables = [],
  onGenerate,
  onReplace,
  onRetire,
  generatePending = false,
  retirePending = false,
}) {
  const [pending, setPending] = useState(null);

  const previewMatrix = useMemo(
    () =>
      preview?.assignments
        ? taskSpecFamilyMatrix(preview.assignments, variables)
        : null,
    [preview, variables]
  );
  const generatedMatrix = useMemo(
    () =>
      specs.length
        ? taskSpecFamilyMatrix(assignmentsFromSpecs(specs), variables)
        : null,
    [specs, variables]
  );

  const staleCount = specs.filter((spec) => spec?.stale).length;
  const hasFamily = specs.length > 0;
  const previewErrorText = previewError
    ? apiErrorMessage(previewError, "Could not load family preview")
    : null;

  return (
    <div
      className="rounded-md border border-slate-200 bg-white p-3"
      data-testid="task-spec-family-panel"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-medium text-slate-800">
          {hasFamily ? "Generated family" : "Generation preview"}
        </h4>
        <p className="text-lg font-semibold tabular-nums text-slate-900">
          {hasFamily ? specs.length : preview?.count ?? previewMatrix?.size ?? "—"}
        </p>
      </div>
      <p className="mt-1 text-xs text-slate-600">
        {hasFamily
          ? "Each row is a generated task spec. Varying Task Model Variables are columns."
          : "This is the family generate will write. Varying Task Model Variables are columns."}
      </p>

      {staleCount > 0 && (
        <p
          className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800"
          data-testid="task-spec-family-stale"
        >
          {staleCount === specs.length
            ? "These specs are stale. The template changed after they were generated."
            : `${staleCount} of ${specs.length} specs are stale. The template changed after they were generated.`}
        </p>
      )}

      {previewPending && !hasFamily && (
        <p className="mt-2 text-xs text-slate-500">Loading preview…</p>
      )}
      {previewErrorText && !hasFamily && (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {previewErrorText}
        </p>
      )}

      {hasFamily ? (
        <>
          {generatedMatrix?.fixed?.length ? (
            <p className="mt-2 text-xs text-slate-500" data-testid="task-spec-family-fixed">
              Held constant · {fixedNote(generatedMatrix)}
            </p>
          ) : null}
          <FamilyMatrixTable
            matrix={generatedMatrix}
            testId="task-spec-family-table"
          />
        </>
      ) : (
        previewMatrix && (
          <>
            {previewMatrix.fixed.length ? (
              <p className="mt-2 text-xs text-slate-500" data-testid="task-spec-family-fixed">
                Held constant · {fixedNote(previewMatrix)}
              </p>
            ) : null}
            <FamilyMatrixTable
              matrix={previewMatrix}
              testId="task-spec-family-preview-table"
            />
          </>
        )
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {!hasFamily && onGenerate && (
          <Button
            type="button"
            disabled={generatePending || !preview?.assignments}
            onClick={() => onGenerate()}
          >
            Generate family
          </Button>
        )}
        {hasFamily && onReplace && (
          <Button
            type="button"
            variant="outline"
            disabled={generatePending || retirePending}
            onClick={() => setPending("replace")}
          >
            Replace family
          </Button>
        )}
        {hasFamily && onRetire && (
          <Button
            type="button"
            variant="outline"
            disabled={generatePending || retirePending}
            onClick={() => setPending("retire")}
          >
            Retire family
          </Button>
        )}
      </div>

      <Modal
        isOpen={pending === "replace"}
        onClose={() => setPending(null)}
        onConfirm={() => onReplace?.()}
        title="Replace family"
        message="Delete these task specs and generate a new family from the current preview?"
        confirmLabel="Replace family"
      />
      <Modal
        isOpen={pending === "retire"}
        onClose={() => setPending(null)}
        onConfirm={() => onRetire?.()}
        title="Retire family"
        message="Delete every generated task spec for this template? This cannot be undone."
        confirmLabel="Retire family"
        confirmClass="bg-red-600 hover:bg-red-700 text-white"
      />
    </div>
  );
}
