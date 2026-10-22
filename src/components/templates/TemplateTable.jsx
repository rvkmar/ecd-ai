// src/components/templates/TemplateTable.jsx
//
// Read-only Template Structure: a searchable table and an Ingredients
// view. A template binds Student, Evidence, Task, and Presentation.
// Family size is projected from the bound Task Model. The template does
// not store those Task Model Variable settings.

import React, { useMemo, useState } from "react";
import { useTemplates } from "@/api/queries/templates";
import { useCompetencyModels } from "@/api/queries/competencies";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import { useTaskModels } from "@/api/queries/taskModels";
import { usePresentationModels } from "@/api/queries/presentationModels";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import { useTaskModelVariables } from "@/api/queries/taskModelVariables";
import { apiErrorMessage } from "@/api/apiClient";
import ModelIngredientsCard from "@/components/shared/ModelIngredientsCard";
import { templateReadiness } from "@/utils/templateReadiness";
import { familySizeFromTaskModel } from "./TemplateBuilder";

function readinessLabel(record) {
  return templateReadiness(record, { strict: true }).ready ? "Ready" : "Not ready";
}

export function citedName(rows, id) {
  const key = String(id || "").trim();
  if (!key) return "";
  return (rows || []).find((row) => row.id === key)?.name || key;
}

export function boundName(rows, id) {
  return citedName(rows, id) || "Not linked";
}

export function familySizeForTemplate(record, taskModels = [], variables = []) {
  const taskModel = (taskModels || []).find((row) => row.id === record?.taskModelId);
  if (!taskModel) return null;
  return familySizeFromTaskModel(taskModel, variables);
}

function familySizeLabel(record, context) {
  const size = familySizeForTemplate(record, context.taskModels, context.taskModelVariables);
  return size == null ? "—" : String(size);
}

function bindingItem(rows, id, secondary) {
  const key = String(id || "").trim();
  if (!key) return [];
  const item = {
    id: key,
    primary: citedName(rows, key) || key,
  };
  if (secondary) item.secondary = secondary;
  return [item];
}

export function ingredientGroupsForTemplate(record, context) {
  const taskModel = (context.taskModels || []).find((row) => row.id === record.taskModelId);
  const familySize = familySizeForTemplate(
    record,
    context.taskModels,
    context.taskModelVariables
  );
  const description = String(record.description || "").trim();
  const variableIds = taskModel?.taskModelVariableIds || [];
  const settings = taskModel?.taskModelVariableSettings || [];

  return [
    {
      key: "description",
      label: "Description",
      items: description ? [{ primary: description }] : [],
    },
    {
      key: "studentModel",
      label: "Student Model",
      items: bindingItem(context.competencyModels, record.competencyModelId),
    },
    {
      key: "evidenceModel",
      label: "Evidence Model",
      items: bindingItem(context.evidenceModels, record.evidenceModelId),
    },
    {
      key: "taskModel",
      label: "Task Model",
      items: bindingItem(
        context.taskModels,
        record.taskModelId,
        familySize == null ? "" : `family size ${familySize}`
      ),
    },
    {
      key: "presentationModel",
      label: "Presentation Model",
      items: bindingItem(context.presentationModels, record.presentationModelId),
    },
    {
      key: "designPattern",
      label: "Design pattern",
      items: bindingItem(context.designPatterns, record.designPatternId),
    },
    {
      key: "taskModelVariables",
      label: "Task Model Variables",
      items: variableIds.map((id) => {
        const variable = (context.taskModelVariables || []).find((row) => row.id === id);
        const setting = settings.find((row) => row.taskModelVariableId === id);
        const variation = setting?.variation === "fixed" ? "fixed" : "varying";
        const fixedValue = String(setting?.fixedValue || "").trim();
        return {
          id,
          primary: variable?.name || id,
          secondary:
            variation === "fixed" && fixedValue ? `fixed · ${fixedValue}` : variation,
        };
      }),
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
    case "evidenceModel":
      return boundName(context.evidenceModels, record.evidenceModelId);
    case "taskModel":
      return boundName(context.taskModels, record.taskModelId);
    case "presentationModel":
      return boundName(context.presentationModels, record.presentationModelId);
    case "designPattern":
      return boundName(context.designPatterns, record.designPatternId);
    case "familySize": {
      const size = familySizeForTemplate(
        record,
        context.taskModels,
        context.taskModelVariables
      );
      return size == null ? -1 : size;
    }
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
  { key: "evidenceModel", label: "Evidence Model" },
  { key: "taskModel", label: "Task Model" },
  { key: "presentationModel", label: "Presentation Model" },
  { key: "designPattern", label: "Design Pattern" },
  { key: "familySize", label: "Family size" },
  { key: "updatedAt", label: "Updated" },
];

export default function TemplateTable() {
  const templatesQuery = useTemplates();
  const competencyQuery = useCompetencyModels();
  const evidenceQuery = useEvidenceModels();
  const taskQuery = useTaskModels();
  const presentationQuery = usePresentationModels();
  const patternsQuery = useDesignPatterns();
  const variablesQuery = useTaskModelVariables();

  const templates = templatesQuery.data || [];
  const competencyModels = competencyQuery.data || [];
  const evidenceModels = evidenceQuery.data || [];
  const taskModels = taskQuery.data || [];
  const presentationModels = presentationQuery.data || [];
  const designPatterns = patternsQuery.data || [];
  const taskModelVariables = variablesQuery.data || [];

  const loading = [
    templatesQuery,
    competencyQuery,
    evidenceQuery,
    taskQuery,
    presentationQuery,
    patternsQuery,
    variablesQuery,
  ].some((query) => query.isLoading);

  const queryError =
    templatesQuery.error ||
    competencyQuery.error ||
    evidenceQuery.error ||
    taskQuery.error ||
    presentationQuery.error ||
    patternsQuery.error ||
    variablesQuery.error;
  const error = queryError
    ? apiErrorMessage(queryError, "Failed to fetch templates.")
    : null;

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("updatedAt");
  const [sortDir, setSortDir] = useState("desc");
  const [viewMode, setViewMode] = useState("table");

  const context = useMemo(
    () => ({
      competencyModels,
      evidenceModels,
      taskModels,
      presentationModels,
      designPatterns,
      taskModelVariables,
    }),
    [
      competencyModels,
      evidenceModels,
      taskModels,
      presentationModels,
      designPatterns,
      taskModelVariables,
    ]
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return templates;
    return templates.filter((record) =>
      [
        record.id,
        record.name,
        record.description,
        record.status,
        citedName(competencyModels, record.competencyModelId),
        citedName(evidenceModels, record.evidenceModelId),
        citedName(taskModels, record.taskModelId),
        citedName(presentationModels, record.presentationModelId),
        citedName(designPatterns, record.designPatternId),
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle))
    );
  }, [
    templates,
    search,
    competencyModels,
    evidenceModels,
    taskModels,
    presentationModels,
    designPatterns,
  ]);

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
    return <div className="p-6 text-sm text-gray-600">Loading templates...</div>;
  }

  if (error) {
    return <div className="p-6 text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Template Structure</h1>
          <p id="tpl-family-note" className="text-sm text-gray-500 max-w-3xl">
            Family size is projected from the bound Task Model&apos;s Task Model
            Variables. The template does not store those settings.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            aria-label="Search templates"
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
                        column.key === "familySize" ? "tpl-family-note" : undefined
                      }
                    >
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
                  <td className="px-4 py-3">
                    {boundName(evidenceModels, record.evidenceModelId)}
                  </td>
                  <td className="px-4 py-3">
                    {boundName(taskModels, record.taskModelId)}
                  </td>
                  <td className="px-4 py-3">
                    {boundName(presentationModels, record.presentationModelId)}
                  </td>
                  <td className="px-4 py-3">
                    {boundName(designPatterns, record.designPatternId)}
                  </td>
                  <td className="px-4 py-3">{familySizeLabel(record, context)}</td>
                  <td className="px-4 py-3">
                    {record.updatedAt
                      ? new Date(record.updatedAt).toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-6 text-center text-gray-500">
                    No templates found.
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
              groups={ingredientGroupsForTemplate(record, context)}
              subtitle={`${boundName(designPatterns, record.designPatternId)} • ${readinessLabel(record)}`}
            />
          ))}
          {sorted.length === 0 && (
            <div className="bg-white rounded-2xl shadow px-4 py-6 text-center text-gray-500 text-sm">
              No templates found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
