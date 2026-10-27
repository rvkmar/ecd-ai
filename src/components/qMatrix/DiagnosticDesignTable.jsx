// Read-only Diagnostic Design Structure: a searchable table and an
// Ingredients view. A diagnostic design stores binary Student Model
// attributes and the item cells that require them.

import React, { useMemo, useState } from "react";
import { useQMatrixModels } from "@/api/queries/qMatrixModels";
import { useCompetencyModels } from "@/api/queries/competencies";
import { useDomainAnalyses } from "@/api/queries/domainAnalyses";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import { observableDisplay } from "@/utils/qMatrixEntries";
import { apiErrorMessage } from "@/api/apiClient";
import ModelIngredientsCard from "@/components/shared/ModelIngredientsCard";
import { meetsDiagnosticDesignConfirmedGates } from "./diagnosticDesignReadiness";

export function readinessLabel(record) {
  return meetsDiagnosticDesignConfirmedGates(record) ? "Ready" : "Not ready";
}

export function citedName(rows, id) {
  const key = String(id || "").trim();
  if (!key) return "";
  return (rows || []).find((row) => row.id === key)?.name || key;
}

export function boundName(rows, id) {
  return citedName(rows, id) || "Not linked";
}

export function attributeCount(record) {
  return Array.isArray(record?.attributeIds) ? record.attributeIds.length : 0;
}

export function entryCount(record) {
  return Array.isArray(record?.entries) ? record.entries.length : 0;
}

function studentModelFor(record, competencyModels) {
  return (competencyModels || []).find((row) => row.id === record?.competencyModelId);
}

function attributeLabel(studentModel, id) {
  const variable = (studentModel?.smVariables || []).find((row) => row.id === id);
  return variable?.label || id || "Untitled";
}

function bindingItem(rows, id, secondary) {
  const key = String(id || "").trim();
  if (!key) return [];
  const item = { id: key, primary: citedName(rows, key) || key };
  if (secondary) item.secondary = secondary;
  return [item];
}

function itemIngredientItems(record, studentModel) {
  const byItem = new Map();
  for (const entry of record?.entries || []) {
    if (!entry?.itemId || entry?.observableId) continue;
    const labels = byItem.get(entry.itemId) || [];
    labels.push(attributeLabel(studentModel, entry.attributeId));
    byItem.set(entry.itemId, labels);
  }
  return [...byItem.entries()].map(([itemId, labels]) => ({
    id: itemId,
    primary: itemId,
    secondary: labels.filter(Boolean).join(", "),
  }));
}

function observableIngredientItems(record, studentModel, evidenceModels) {
  const byKey = new Map();
  for (const entry of record?.entries || []) {
    if (!entry?.observableId) continue;
    const key = `${entry.evidenceModelId || ""}::${entry.observableId}::${entry.itemId || ""}`;
    const current = byKey.get(key) || { entry, labels: [] };
    current.labels.push(attributeLabel(studentModel, entry.attributeId));
    byKey.set(key, current);
  }
  return [...byKey.values()].map(({ entry, labels }) => {
    const display = observableDisplay(evidenceModels, entry);
    const parts = [display.evidenceModelName, entry.itemId ? `item ${entry.itemId}` : "Any item"]
      .filter(Boolean);
    return {
      id: `${entry.evidenceModelId || "observable"}:${entry.observableId}:${entry.itemId || ""}`,
      primary: display.statement || entry.observableId,
      secondary: [...parts, labels.filter(Boolean).join(", ")].filter(Boolean).join("; "),
    };
  });
}

export function ingredientGroupsForDesign(record, context) {
  const studentModel = studentModelFor(record, context.competencyModels);
  const evidenceModels = context.evidenceModels || [];
  const description = String(record.description || "").trim();
  const versionItems = record.versionNumber
    ? [
        {
          primary: `v${record.versionNumber}`,
          secondary: record.parentModelId ? `parent ${record.parentModelId}` : "",
        },
      ]
    : [];

  return [
    {
      key: "description",
      label: "Description",
      items: description ? [{ primary: description }] : [],
    },
    {
      key: "studentModel",
      label: "Student Model",
      items: bindingItem(
        context.competencyModels,
        record.competencyModelId,
        record.competencyModelVersion != null ? `version ${record.competencyModelVersion}` : ""
      ),
    },
    {
      key: "attributes",
      label: "Attributes",
      items: (record.attributeIds || []).map((id) => ({
        id,
        primary: attributeLabel(studentModel, id),
      })),
    },
    {
      key: "items",
      label: "Items",
      items: itemIngredientItems(record, studentModel),
    },
    {
      key: "observables",
      label: "Observables",
      items: observableIngredientItems(record, studentModel, evidenceModels),
    },
    {
      key: "domainAnalysis",
      label: "Domain Analysis",
      items: bindingItem(context.domainAnalyses, record.domainAnalysisId),
    },
    {
      key: "version",
      label: "Version",
      items: versionItems,
    },
  ];
}

function sortValue(record, key, context) {
  switch (key) {
    case "id":
      return record.id || "";
    case "name":
      return record.name || "";
    case "status":
      return record.status || "draft";
    case "readiness":
      return readinessLabel(record);
    case "studentModel":
      return boundName(context.competencyModels, record.competencyModelId);
    case "attributes":
      return attributeCount(record);
    case "entries":
      return entryCount(record);
    case "domainAnalysis":
      return boundName(context.domainAnalyses, record.domainAnalysisId);
    case "locked":
      return record.locked ? "yes" : "no";
    case "updatedAt":
      return record.updatedAt ? new Date(record.updatedAt).getTime() : 0;
    default:
      return "";
  }
}

const COLUMNS = [
  { key: "id", label: "ID" },
  { key: "name", label: "Name" },
  { key: "status", label: "Status" },
  { key: "readiness", label: "Readiness" },
  { key: "studentModel", label: "Student Model" },
  { key: "attributes", label: "Attributes" },
  { key: "entries", label: "Entries" },
  { key: "domainAnalysis", label: "Domain Analysis" },
  { key: "locked", label: "Locked" },
  { key: "updatedAt", label: "Updated" },
];

export default function DiagnosticDesignTable() {
  const designQuery = useQMatrixModels();
  const competencyQuery = useCompetencyModels();
  const analysisQuery = useDomainAnalyses();
  const evidenceQuery = useEvidenceModels();

  const designs = designQuery.data || [];
  const competencyModels = competencyQuery.data || [];
  const domainAnalyses = analysisQuery.data || [];
  const evidenceModels = evidenceQuery.data || [];

  const loading = [designQuery, competencyQuery, analysisQuery, evidenceQuery].some(
    (query) => query.isLoading
  );
  const queryError =
    designQuery.error || competencyQuery.error || analysisQuery.error || evidenceQuery.error;
  const error = queryError
    ? apiErrorMessage(queryError, "Failed to fetch diagnostic designs.")
    : null;

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("updatedAt");
  const [sortDir, setSortDir] = useState("desc");
  const [viewMode, setViewMode] = useState("table");

  const context = useMemo(
    () => ({ competencyModels, domainAnalyses, evidenceModels }),
    [competencyModels, domainAnalyses, evidenceModels]
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return designs;
    return designs.filter((record) => {
      const studentModel = studentModelFor(record, competencyModels);
      const attributeNames = (record.attributeIds || []).map((id) =>
        attributeLabel(studentModel, id)
      );
      return [
        record.id,
        record.name,
        record.description,
        record.status,
        citedName(competencyModels, record.competencyModelId),
        citedName(domainAnalyses, record.domainAnalysisId),
        ...attributeNames,
        ...(record.entries || []).flatMap((entry) => [entry.itemId, entry.observableId, entry.evidenceModelId]),
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [designs, search, competencyModels, domainAnalyses]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      const aVal = sortValue(a, sortKey, context);
      const bVal = sortValue(b, sortKey, context);
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [filtered, sortKey, sortDir, context]);

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-600">Loading diagnostic designs...</div>;
  }

  if (error) {
    return <div className="p-6 text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Diagnostic Design Structure</h1>
          <p className="text-sm text-gray-500 max-w-3xl">
            Attributes are binary Student Model Variables. Each entry marks an
            item that requires one of those attributes. A Domain Analysis can
            name this design; it does not store the cells.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            aria-label="Search diagnostic designs"
            placeholder="Search by ID or name..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="border rounded-xl px-4 py-2 text-sm w-72 bg-white text-slate-900"
          />

          <div className="flex border rounded-xl overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`px-3 py-2 ${
                viewMode === "table"
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              Table View
            </button>
            <button
              type="button"
              onClick={() => setViewMode("ingredients")}
              className={`px-3 py-2 border-l ${
                viewMode === "ingredients"
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              Ingredients View
            </button>
          </div>
        </div>
      </div>

      {viewMode === "table" && (
        <div className="overflow-x-auto bg-white rounded-2xl shadow">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                {COLUMNS.map((column) => (
                  <th key={column.key} className="px-4 py-3">
                    <button type="button" className="font-medium" onClick={() => toggleSort(column.key)}>
                      {column.label}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((record) => (
                <tr key={record.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{record.id}</td>
                  <td className="px-4 py-3 font-medium">{record.name}</td>
                  <td className="px-4 py-3 capitalize">{record.status || "draft"}</td>
                  <td className="px-4 py-3">{readinessLabel(record)}</td>
                  <td className="px-4 py-3">
                    {boundName(competencyModels, record.competencyModelId)}
                  </td>
                  <td className="px-4 py-3">{attributeCount(record)}</td>
                  <td className="px-4 py-3">{entryCount(record)}</td>
                  <td className="px-4 py-3">
                    {boundName(domainAnalyses, record.domainAnalysisId)}
                  </td>
                  <td className="px-4 py-3">{record.locked ? "Yes" : "No"}</td>
                  <td className="px-4 py-3">
                    {record.updatedAt ? new Date(record.updatedAt).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-6 text-center text-gray-500">
                    No diagnostic designs found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === "ingredients" && (
        <div className="space-y-4">
          {sorted.map((record) => (
            <ModelIngredientsCard
              key={record.id}
              model={{
                id: record.id,
                name: record.name,
                status: record.status || "draft",
                locked: record.locked,
                versionNumber: record.versionNumber,
                updatedAt: record.updatedAt,
              }}
              groups={ingredientGroupsForDesign(record, context)}
              subtitle={`${boundName(competencyModels, record.competencyModelId)} • ${readinessLabel(record)}`}
            />
          ))}
          {sorted.length === 0 && (
            <div className="bg-white rounded-2xl shadow px-4 py-6 text-center text-gray-500 text-sm">
              No diagnostic designs found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
