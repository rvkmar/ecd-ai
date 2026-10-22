// Read-only Assembly Structure: a searchable table and an Ingredients
// view. An Assembly Model stores Student Model targets, stopping rules,
// and a pointer at a selection policy.

import React, { useMemo, useState } from "react";
import { useAssemblyModels } from "@/api/queries/assemblyModels";
import { useCompetencyModels } from "@/api/queries/competencies";
import { usePolicies } from "@/api/queries/policies";
import { apiErrorMessage } from "@/api/apiClient";
import ModelIngredientsCard from "@/components/shared/ModelIngredientsCard";
import { meetsAssemblyConfirmedGates } from "./assemblyModelReadiness";

export function readinessLabel(record) {
  return meetsAssemblyConfirmedGates(record) ? "Ready" : "Not ready";
}

export function citedName(rows, id) {
  const key = String(id || "").trim();
  if (!key) return "";
  return (rows || []).find((row) => row.id === key)?.name || key;
}

export function boundName(rows, id) {
  return citedName(rows, id) || "Not linked";
}

export function stoppingRulesLabel(record) {
  const rules = record?.stoppingRules || {};
  const parts = [];
  if (rules.minItems !== undefined) parts.push(`min ${rules.minItems}`);
  if (rules.maxItems !== undefined) parts.push(`max ${rules.maxItems}`);
  if (rules.targetsMet === true) parts.push("targets met");
  else if (rules.targetsMet === false) parts.push("targets met off");
  return parts.length ? parts.join(", ") : "—";
}

export function targetCount(record) {
  return Array.isArray(record?.targetsBySMV) ? record.targetsBySMV.length : 0;
}

function policyIdOf(record) {
  return record?.selectionAlgorithm?.policyId || "";
}

function bindingItem(rows, id, secondary) {
  const key = String(id || "").trim();
  if (!key) return [];
  const item = { id: key, primary: citedName(rows, key) || key };
  if (secondary) item.secondary = secondary;
  return [item];
}

function studentModelFor(record, competencyModels) {
  return (competencyModels || []).find((row) => row.id === record?.competencyModelId);
}

function targetSecondary(target) {
  if (typeof target?.requiredSEM === "number") return `SEM ≤ ${target.requiredSEM}`;
  if (typeof target?.requiredClassificationAccuracy === "number") {
    return `accuracy ≥ ${target.requiredClassificationAccuracy}`;
  }
  return "";
}

function stoppingRuleItems(record) {
  const rules = record?.stoppingRules || {};
  const items = [];
  if (rules.minItems !== undefined) {
    items.push({ primary: "Minimum items", secondary: String(rules.minItems) });
  }
  if (rules.maxItems !== undefined) {
    items.push({ primary: "Maximum items", secondary: String(rules.maxItems) });
  }
  if (rules.targetsMet === true) items.push({ primary: "Stop when every target is met" });
  else if (rules.targetsMet === false) items.push({ primary: "Targets-met rule is off" });
  return items;
}

export function ingredientGroupsForAssembly(record, context) {
  const studentModel = studentModelFor(record, context.competencyModels);
  const variables = studentModel?.smVariables || [];
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
      key: "targets",
      label: "SMV targets",
      items: (record.targetsBySMV || []).map((target) => {
        const variable = variables.find((row) => row.id === target.smvId);
        return {
          id: target.smvId,
          primary: variable?.label || target.smvId || "Untitled",
          secondary: targetSecondary(target),
        };
      }),
    },
    {
      key: "stoppingRules",
      label: "Stopping rules",
      items: stoppingRuleItems(record),
    },
    {
      key: "selectionPolicy",
      label: "Selection policy",
      items: bindingItem(context.policies, policyIdOf(record)),
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
    case "targets":
      return targetCount(record);
    case "stoppingRules":
      return stoppingRulesLabel(record);
    case "policy":
      return boundName(context.policies, policyIdOf(record));
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
  { key: "targets", label: "SMV targets" },
  { key: "stoppingRules", label: "Stopping rules" },
  { key: "policy", label: "Selection policy" },
  { key: "locked", label: "Locked" },
  { key: "updatedAt", label: "Updated" },
];

export default function AssemblyModelTable() {
  const assemblyQuery = useAssemblyModels();
  const competencyQuery = useCompetencyModels();
  const policyQuery = usePolicies();

  const assemblyModels = assemblyQuery.data || [];
  const competencyModels = competencyQuery.data || [];
  const policies = policyQuery.data || [];

  const loading = [assemblyQuery, competencyQuery, policyQuery].some((query) => query.isLoading);
  const queryError = assemblyQuery.error || competencyQuery.error || policyQuery.error;
  const error = queryError
    ? apiErrorMessage(queryError, "Failed to fetch assembly models.")
    : null;

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("updatedAt");
  const [sortDir, setSortDir] = useState("desc");
  const [viewMode, setViewMode] = useState("table");

  const context = useMemo(
    () => ({ competencyModels, policies }),
    [competencyModels, policies]
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return assemblyModels;
    return assemblyModels.filter((record) => {
      const studentModel = studentModelFor(record, competencyModels);
      const variableNames = (studentModel?.smVariables || []).map((row) => row.label);
      return [
        record.id,
        record.name,
        record.description,
        record.status,
        citedName(competencyModels, record.competencyModelId),
        citedName(policies, policyIdOf(record)),
        ...variableNames,
        ...(record.targetsBySMV || []).map((target) => target.smvId),
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [assemblyModels, search, competencyModels, policies]);

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
    return <div className="p-6 text-sm text-gray-600">Loading assembly models...</div>;
  }

  if (error) {
    return <div className="p-6 text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Assembly Structure</h1>
          <p className="text-sm text-gray-500 max-w-3xl">
            Targets, stopping rules, and the selection policy are stored on the
            Assembly Model. The Student Model owns the variables those targets name.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            aria-label="Search assembly models"
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
                  <td className="px-4 py-3">{targetCount(record)}</td>
                  <td className="px-4 py-3">{stoppingRulesLabel(record)}</td>
                  <td className="px-4 py-3">{boundName(policies, policyIdOf(record))}</td>
                  <td className="px-4 py-3">{record.locked ? "Yes" : "No"}</td>
                  <td className="px-4 py-3">
                    {record.updatedAt ? new Date(record.updatedAt).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-6 text-center text-gray-500">
                    No assembly models found.
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
              groups={ingredientGroupsForAssembly(record, context)}
              subtitle={`${boundName(competencyModels, record.competencyModelId)} • ${readinessLabel(record)}`}
            />
          ))}
          {sorted.length === 0 && (
            <div className="bg-white rounded-2xl shadow px-4 py-6 text-center text-gray-500 text-sm">
              No assembly models found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
