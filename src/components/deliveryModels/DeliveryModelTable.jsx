// Read-only Delivery Structure: a searchable table and an Ingredients view.

import React, { useMemo, useState } from "react";
import { useDeliveryModels, useSessionsForDeliveryModels } from "@/api/queries/deliveryModels";
import { useCompetencyModels } from "@/api/queries/competencies";
import { useAssemblyModels } from "@/api/queries/assemblyModels";
import { usePolicies } from "@/api/queries/policies";
import { usePresentationModels } from "@/api/queries/presentationModels";
import { apiErrorMessage } from "@/api/apiClient";
import ModelIngredientsCard from "@/components/shared/ModelIngredientsCard";
import {
  ingredientGroups,
  labelOf,
  readinessText,
  statusText,
} from "./deliveryModelUsage";

const COLUMNS = [
  { key: "id", label: "ID" },
  { key: "name", label: "Name" },
  { key: "status", label: "Status" },
  { key: "readiness", label: "Readiness" },
  { key: "student", label: "Student model" },
  { key: "assembly", label: "Assembly model" },
  { key: "policy", label: "Policy" },
  { key: "presentation", label: "Presentation" },
  { key: "updatedAt", label: "Updated" },
];

function sortValue(record, key, lists) {
  switch (key) {
    case "id":
      return record.id || "";
    case "name":
      return record.name || "";
    case "status":
      return statusText(record);
    case "readiness":
      return readinessText(record, lists);
    case "student":
      return labelOf(lists.competencyModels, record.competencyModelId);
    case "assembly":
      return labelOf(lists.assemblyModels, record.assemblyModelId);
    case "policy":
      return labelOf(lists.policies, record.policyId);
    case "presentation":
      return labelOf(lists.presentationModels, record.presentationModelId);
    case "updatedAt":
      return record.updatedAt ? new Date(record.updatedAt).getTime() : 0;
    default:
      return "";
  }
}

export default function DeliveryModelTable() {
  const modelsQuery = useDeliveryModels();
  const sessionsQuery = useSessionsForDeliveryModels();
  const studentQuery = useCompetencyModels();
  const assemblyQuery = useAssemblyModels();
  const policiesQuery = usePolicies();
  const presentationQuery = usePresentationModels();

  const queries = [modelsQuery, sessionsQuery, studentQuery, assemblyQuery, policiesQuery, presentationQuery];
  const loading = queries.some((query) => query.isLoading);
  const queryError = queries.find((query) => query.error)?.error;

  const models = modelsQuery.data || [];
  const lists = useMemo(
    () => ({
      deliveryModels: models,
      sessions: sessionsQuery.data || [],
      competencyModels: studentQuery.data || [],
      assemblyModels: assemblyQuery.data || [],
      policies: policiesQuery.data || [],
      presentationModels: presentationQuery.data || [],
    }),
    [models, sessionsQuery.data, studentQuery.data, assemblyQuery.data, policiesQuery.data, presentationQuery.data]
  );

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("updatedAt");
  const [sortDir, setSortDir] = useState("desc");
  const [viewMode, setViewMode] = useState("table");

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return models;
    return models.filter((record) =>
      [
        record.id,
        record.name,
        record.description,
        statusText(record),
        readinessText(record, lists),
        labelOf(lists.competencyModels, record.competencyModelId),
        labelOf(lists.assemblyModels, record.assemblyModelId),
        labelOf(lists.policies, record.policyId),
        labelOf(lists.presentationModels, record.presentationModelId),
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle))
    );
  }, [models, search, lists]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      const aVal = sortValue(a, sortKey, lists);
      const bVal = sortValue(b, sortKey, lists);
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [filtered, sortKey, sortDir, lists]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  if (loading) return <div className="p-6 text-sm text-gray-600">Loading delivery models...</div>;
  if (queryError) {
    return (
      <div className="p-6 text-sm text-red-600">
        {apiErrorMessage(queryError, "Failed to fetch delivery models.")}
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Delivery Structure</h1>
          <p className="text-sm text-gray-500 max-w-3xl">
            Each delivery model names the student model, the assembly model,
            the selection policy, and the administration rules a session will
            follow. The presentation model is an optional override.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            aria-label="Search delivery models"
            placeholder="Search by ID or name..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="border rounded-xl px-4 py-2 text-sm w-72"
          />
          <div className="flex border rounded-xl overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`px-3 py-2 ${viewMode === "table" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              Table View
            </button>
            <button
              type="button"
              onClick={() => setViewMode("ingredients")}
              className={`px-3 py-2 border-l ${viewMode === "ingredients" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
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
                  <td className="px-4 py-3">{statusText(record)}</td>
                  <td className="px-4 py-3">{readinessText(record, lists)}</td>
                  <td className="px-4 py-3">{labelOf(lists.competencyModels, record.competencyModelId)}</td>
                  <td className="px-4 py-3">{labelOf(lists.assemblyModels, record.assemblyModelId)}</td>
                  <td className="px-4 py-3">{labelOf(lists.policies, record.policyId)}</td>
                  <td className="px-4 py-3">
                    {record.presentationModelId
                      ? labelOf(lists.presentationModels, record.presentationModelId)
                      : "None"}
                  </td>
                  <td className="px-4 py-3">
                    {record.updatedAt ? new Date(record.updatedAt).toLocaleDateString() : "Not saved"}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-6 text-center text-gray-500">
                    No delivery models found.
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
              groups={ingredientGroups(record, lists)}
              subtitle={[
                statusText(record) === "confirmed" ? "Confirmed" : "Draft",
                readinessText(record, lists),
                labelOf(lists.assemblyModels, record.assemblyModelId) || "No assembly model",
              ].join(" | ")}
            />
          ))}
          {sorted.length === 0 && (
            <div className="bg-white rounded-2xl shadow px-4 py-6 text-center text-gray-500 text-sm">
              No delivery models found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
