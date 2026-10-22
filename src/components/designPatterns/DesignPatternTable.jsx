// src/components/designPatterns/DesignPatternTable.jsx
//
// Read-only Design Pattern Structure: a searchable table and an
// Ingredients view. Groups for the menus come from formFromRow.
// Linked templates use templatesForPattern. Seeded models are Evidence
// and Task Models that still store seededFrom.designPatternId.
// Deleting a pattern drops that back-link (D150), so the count is not
// a history of every seed.

import React, { useMemo, useState } from "react";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import { useDomainAnalyses } from "@/api/queries/domainAnalyses";
import { useTemplates } from "@/api/queries/templates";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import { useTaskModels } from "@/api/queries/taskModels";
import { apiErrorMessage } from "@/api/apiClient";
import ModelIngredientsCard from "@/components/shared/ModelIngredientsCard";
import { designPatternReadiness } from "@/utils/designPatternReadiness";
import { formFromRow, templatesForPattern } from "./DesignPatternBuilder";

function readinessLabel(record) {
  return designPatternReadiness(record, { strict: true }).ready ? "Ready" : "Not ready";
}

function domainLabel(record, analysesById) {
  const id = String(record.domainAnalysisId || "").trim();
  if (!id) return "Not linked";
  return analysesById[id]?.name || id;
}

export function seededModelsForPattern(patternId, evidenceModels = [], taskModels = []) {
  if (!patternId) return [];
  const evidence = evidenceModels
    .filter((row) => row?.seededFrom?.designPatternId === patternId)
    .map((row) => ({ ...row, kind: "Evidence Model" }));
  const tasks = taskModels
    .filter((row) => row?.seededFrom?.designPatternId === patternId)
    .map((row) => ({ ...row, kind: "Task Model" }));
  return [...evidence, ...tasks];
}

function labelledItems(entries, secondaryOf) {
  return (entries || []).map((entry, index) => {
    const item = { primary: entry.label || "Untitled" };
    const secondary = secondaryOf ? secondaryOf(entry) : "";
    if (secondary) item.secondary = secondary;
    if (!entry.label) item.id = `row-${index}`;
    return item;
  });
}

export function ingredientGroupsForPattern(record, context) {
  const form = formFromRow(record);
  const analysesById = context.analysesById || {};
  const linked = templatesForPattern(context.templates || [], record.id);
  const seeded = seededModelsForPattern(
    record.id,
    context.evidenceModels,
    context.taskModels
  );

  return [
    { key: "focalKsas", label: "Focal KSAs", items: labelledItems(form.focalKsas) },
    {
      key: "additionalKsas",
      label: "Additional KSAs",
      items: labelledItems(form.additionalKsas, (entry) => entry.relationship),
    },
    {
      key: "potentialObservations",
      label: "Potential observations",
      items: labelledItems(form.potentialObservations, (entry) => entry.observationId),
    },
    {
      key: "potentialWorkProducts",
      label: "Potential work products",
      items: labelledItems(form.potentialWorkProducts, (entry) => entry.workProductId),
    },
    {
      key: "potentialRubrics",
      label: "Potential rubrics",
      items: labelledItems(form.potentialRubrics, (entry) => entry.rubricId),
    },
    {
      key: "characteristicFeatures",
      label: "Characteristic features",
      items: labelledItems(form.characteristicFeatures),
    },
    {
      key: "variableFeatures",
      label: "Variable features",
      items: labelledItems(form.variableFeatures, (entry) => entry.taskModelVariableId),
    },
    {
      key: "relationships",
      label: "Relations",
      items: (form.relationships || []).map((entry, index) => ({
        id: entry.targetPatternId || `rel-${index}`,
        primary: entry.type || "kind-of",
        secondary:
          context.patternsById?.[entry.targetPatternId]?.name || entry.targetPatternId || "",
      })),
    },
    {
      key: "references",
      label: "References",
      items: (form.references || []).map((entry) => {
        const item = { primary: entry.label || "Untitled" };
        if (entry.url) item.secondary = entry.url;
        return item;
      }),
    },
    {
      key: "templates",
      label: "Linked templates",
      items: linked.map((row) => ({
        id: row.id,
        primary: row.name || row.id,
      })),
    },
    {
      key: "seeded",
      label: "Seeded models",
      items: seeded.map((row) => ({
        id: row.id,
        primary: row.name || row.id,
        secondary: row.kind,
      })),
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
    case "domainAnalysis":
      return domainLabel(record, context.analysesById);
    case "templates":
      return templatesForPattern(context.templates, record.id).length;
    case "seeded":
      return seededModelsForPattern(record.id, context.evidenceModels, context.taskModels)
        .length;
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
  { key: "domainAnalysis", label: "Domain Analysis" },
  { key: "templates", label: "Templates" },
  { key: "seeded", label: "Seeded models" },
  { key: "updatedAt", label: "Updated" },
];

export default function DesignPatternTable() {
  const patternsQuery = useDesignPatterns();
  const analysesQuery = useDomainAnalyses();
  const templatesQuery = useTemplates();
  const evidenceQuery = useEvidenceModels();
  const taskQuery = useTaskModels();

  const patterns = patternsQuery.data || [];
  const domainAnalyses = analysesQuery.data || [];
  const templates = templatesQuery.data || [];
  const evidenceModels = evidenceQuery.data || [];
  const taskModels = taskQuery.data || [];

  const loading = [
    patternsQuery,
    analysesQuery,
    templatesQuery,
    evidenceQuery,
    taskQuery,
  ].some((query) => query.isLoading);

  const queryError =
    patternsQuery.error ||
    analysesQuery.error ||
    templatesQuery.error ||
    evidenceQuery.error ||
    taskQuery.error;
  const error = queryError
    ? apiErrorMessage(queryError, "Failed to fetch design patterns.")
    : null;

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("updatedAt");
  const [sortDir, setSortDir] = useState("desc");
  const [viewMode, setViewMode] = useState("table");

  const analysesById = useMemo(() => {
    const map = {};
    domainAnalyses.forEach((row) => {
      map[row.id] = row;
    });
    return map;
  }, [domainAnalyses]);

  const patternsById = useMemo(() => {
    const map = {};
    patterns.forEach((row) => {
      map[row.id] = row;
    });
    return map;
  }, [patterns]);

  const context = useMemo(
    () => ({ analysesById, patternsById, templates, evidenceModels, taskModels }),
    [analysesById, patternsById, templates, evidenceModels, taskModels]
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return patterns;
    return patterns.filter((record) =>
      [record.id, record.name, record.status, domainLabel(record, analysesById)]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle))
    );
  }, [patterns, search, analysesById]);

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
    return <div className="p-6 text-sm text-gray-600">Loading design patterns...</div>;
  }

  if (error) {
    return <div className="p-6 text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Design Pattern Structure</h1>
          <p id="dp-seeded-note" className="text-sm text-gray-500 max-w-3xl">
            Seeded models counts Evidence Models and Task Models that still store
            this pattern on seededFrom.designPatternId. Deleting a pattern drops
            that back-link, so this is not a history of every seed.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            aria-label="Search design patterns"
            placeholder="Search by ID or name..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="border rounded-xl px-4 py-2 text-sm w-72"
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
                    <button
                      type="button"
                      className="font-medium"
                      onClick={() => toggleSort(column.key)}
                      aria-describedby={column.key === "seeded" ? "dp-seeded-note" : undefined}
                    >
                      {column.label}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((record) => {
                const templateCount = templatesForPattern(templates, record.id).length;
                const seededCount = seededModelsForPattern(
                  record.id,
                  evidenceModels,
                  taskModels
                ).length;
                return (
                  <tr key={record.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{record.id}</td>
                    <td className="px-4 py-3 font-medium">{record.name}</td>
                    <td className="px-4 py-3 capitalize">{record.status || "draft"}</td>
                    <td className="px-4 py-3">{readinessLabel(record)}</td>
                    <td className="px-4 py-3">{domainLabel(record, analysesById)}</td>
                    <td className="px-4 py-3">{templateCount}</td>
                    <td className="px-4 py-3">{seededCount}</td>
                    <td className="px-4 py-3">
                      {record.updatedAt
                        ? new Date(record.updatedAt).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-6 text-center text-gray-500">
                    No design patterns found.
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
              }}
              groups={ingredientGroupsForPattern(record, context)}
              subtitle={`${domainLabel(record, analysesById)} • ${readinessLabel(record)}`}
            />
          ))}
          {sorted.length === 0 && (
            <div className="bg-white rounded-2xl shadow px-4 py-6 text-center text-gray-500 text-sm">
              No design patterns found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
