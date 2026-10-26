// Read-only Rubric Structure: a searchable table and an Ingredients
// view. Each rubric shows its criteria-by-levels shape, plus the
// evidence models and design patterns that cite it.

import React, { useMemo, useState } from "react";
import { useRubrics } from "@/api/queries/rubrics";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import { apiErrorMessage } from "@/api/apiClient";
import ModelIngredientsCard from "@/components/shared/ModelIngredientsCard";
import {
  countLabel,
  criteriaCount,
  ingredientGroupsForRubric,
  levelCount,
  readinessText,
  recordLabel,
  statusText,
  usageCounts,
} from "./rubricUsage";

function sortValue(record, key, context) {
  const counts = usageCounts(record, context);
  switch (key) {
    case "id":
      return record.id || "";
    case "name":
      return record.name || "";
    case "status":
      return statusText(record);
    case "readiness":
      return readinessText(record);
    case "criteria":
      return criteriaCount(record);
    case "levels":
      return levelCount(record);
    case "evidenceModels":
      return counts.evidenceModels.length;
    case "designPatterns":
      return counts.designPatterns.length;
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
  { key: "criteria", label: "Criteria" },
  { key: "levels", label: "Levels" },
  { key: "evidenceModels", label: "Evidence models" },
  { key: "designPatterns", label: "Design patterns" },
  { key: "updatedAt", label: "Updated" },
];

export default function RubricTable() {
  const rubricsQuery = useRubrics();
  const evidenceQuery = useEvidenceModels();
  const patternsQuery = useDesignPatterns();

  const rubrics = rubricsQuery.data || [];
  const evidenceModels = evidenceQuery.data || [];
  const designPatterns = patternsQuery.data || [];

  const loading = [rubricsQuery, evidenceQuery, patternsQuery].some((query) => query.isLoading);
  const queryError = rubricsQuery.error || evidenceQuery.error || patternsQuery.error;
  const error = queryError ? apiErrorMessage(queryError, "Failed to fetch rubrics.") : null;

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("updatedAt");
  const [sortDir, setSortDir] = useState("desc");
  const [viewMode, setViewMode] = useState("table");

  const context = useMemo(
    () => ({ evidenceModels, designPatterns }),
    [evidenceModels, designPatterns]
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rubrics;
    return rubrics.filter((record) => {
      const counts = usageCounts(record, context);
      const criterionText = (record.dimensions || []).flatMap((dimension) => [
        dimension?.name,
        dimension?.id,
        ...(dimension?.levels || []).map((level) =>
          level && typeof level === "object" ? level.label : level
        ),
      ]);
      return [
        record.id,
        record.name,
        record.description,
        statusText(record),
        readinessText(record),
        ...criterionText,
        ...counts.evidenceModels.map((row) => recordLabel(row)),
        ...counts.designPatterns.map((row) => recordLabel(row)),
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [rubrics, search, context]);

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
    return <div className="p-6 text-sm text-gray-600">Loading rubrics...</div>;
  }

  if (error) {
    return <div className="p-6 text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Rubric Structure</h1>
          <p id="rubric-usage-note" className="text-sm text-gray-500 max-w-3xl">
            Criteria run down the side and levels run across. Evidence models
            cite a rubric on evaluationProcedures.rubricId or on
            phases.rubricId. Design patterns list it under potential rubrics.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            aria-label="Search rubrics"
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
                      aria-describedby={
                        column.key === "evidenceModels" || column.key === "designPatterns"
                          ? "rubric-usage-note"
                          : undefined
                      }
                    >
                      {column.label}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((record) => {
                const counts = usageCounts(record, context);
                return (
                  <tr key={record.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{record.id}</td>
                    <td className="px-4 py-3 font-medium">{record.name}</td>
                    <td className="px-4 py-3">{statusText(record)}</td>
                    <td className="px-4 py-3">{readinessText(record)}</td>
                    <td className="px-4 py-3">{criteriaCount(record)}</td>
                    <td className="px-4 py-3">{levelCount(record)}</td>
                    <td className="px-4 py-3">{counts.evidenceModels.length}</td>
                    <td className="px-4 py-3">{counts.designPatterns.length}</td>
                    <td className="px-4 py-3">
                      {record.updatedAt
                        ? new Date(record.updatedAt).toLocaleDateString()
                        : "Not saved"}
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-6 text-center text-gray-500">
                    No rubrics found.
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
                status: statusText(record),
                updatedAt: record.updatedAt,
              }}
              groups={ingredientGroupsForRubric(record, context)}
              subtitle={[
                statusText(record).charAt(0).toUpperCase() + statusText(record).slice(1),
                readinessText(record),
                countLabel(criteriaCount(record), "criterion", "criteria"),
                countLabel(levelCount(record), "level", "levels"),
              ].join(" • ")}
            />
          ))}
          {sorted.length === 0 && (
            <div className="bg-white rounded-2xl shadow px-4 py-6 text-center text-gray-500 text-sm">
              No rubrics found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
