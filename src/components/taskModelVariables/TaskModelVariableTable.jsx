// Read-only Task Model Variable Structure: a searchable table and an
// Ingredients view. The groups are the levels, plus the task models and
// design patterns that cite each variable.

import React, { useMemo, useState } from "react";
import { useTaskModelVariables } from "@/api/queries/taskModelVariables";
import { useTaskModels } from "@/api/queries/taskModels";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import { apiErrorMessage } from "@/api/apiClient";
import ModelIngredientsCard from "@/components/shared/ModelIngredientsCard";
import {
  ingredientGroupsForVariable,
  readinessText,
  recordLabel,
  usageCounts,
  valueSetKindText,
  variableTypeText,
} from "./taskModelVariableUsage";

function sortValue(record, key, context) {
  const counts = usageCounts(record, context);
  switch (key) {
    case "id":
      return record.id || "";
    case "name":
      return record.name || "";
    case "type":
      return variableTypeText(record.type);
    case "valueSet":
      return valueSetKindText(record);
    case "readiness":
      return readinessText(record);
    case "taskModels":
      return counts.taskModels.length;
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
  { key: "type", label: "Type" },
  { key: "valueSet", label: "Value set" },
  { key: "readiness", label: "Readiness" },
  { key: "taskModels", label: "Task models" },
  { key: "designPatterns", label: "Design patterns" },
  { key: "updatedAt", label: "Updated" },
];

export default function TaskModelVariableTable() {
  const variablesQuery = useTaskModelVariables();
  const taskModelsQuery = useTaskModels();
  const patternsQuery = useDesignPatterns();

  const variables = variablesQuery.data || [];
  const taskModels = taskModelsQuery.data || [];
  const designPatterns = patternsQuery.data || [];

  const loading = [variablesQuery, taskModelsQuery, patternsQuery].some(
    (query) => query.isLoading
  );
  const queryError = variablesQuery.error || taskModelsQuery.error || patternsQuery.error;
  const error = queryError
    ? apiErrorMessage(queryError, "Failed to fetch task model variables.")
    : null;

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("updatedAt");
  const [sortDir, setSortDir] = useState("desc");
  const [viewMode, setViewMode] = useState("table");

  const context = useMemo(
    () => ({ taskModels, designPatterns }),
    [taskModels, designPatterns]
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return variables;
    return variables.filter((record) => {
      const counts = usageCounts(record, context);
      return [
        record.id,
        record.name,
        record.description,
        variableTypeText(record.type),
        valueSetKindText(record),
        readinessText(record),
        ...counts.taskModels.map((row) => recordLabel(row)),
        ...counts.designPatterns.map((row) => recordLabel(row)),
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [variables, search, context]);

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
    return <div className="p-6 text-sm text-gray-600">Loading task model variables...</div>;
  }

  if (error) {
    return <div className="p-6 text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Task Model Variable Structure</h1>
          <p id="tmv-usage-note" className="text-sm text-gray-500 max-w-3xl">
            Task models list a variable in taskModelVariableIds. Design patterns
            list it under variable features.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            aria-label="Search task model variables"
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
                        column.key === "taskModels" || column.key === "designPatterns"
                          ? "tmv-usage-note"
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
                    <td className="px-4 py-3">{variableTypeText(record.type)}</td>
                    <td className="px-4 py-3">{valueSetKindText(record)}</td>
                    <td className="px-4 py-3">{readinessText(record)}</td>
                    <td className="px-4 py-3" data-testid={`tmv-consumers-${record.id}`}>
                      {counts.taskModels.length}
                    </td>
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
                    No task model variables found.
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
                updatedAt: record.updatedAt,
              }}
              groups={ingredientGroupsForVariable(record, context)}
              subtitle={`${variableTypeText(record.type)} • ${valueSetKindText(record)} • ${readinessText(record)}`}
            />
          ))}
          {sorted.length === 0 && (
            <div className="bg-white rounded-2xl shadow px-4 py-6 text-center text-gray-500 text-sm">
              No task model variables found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
