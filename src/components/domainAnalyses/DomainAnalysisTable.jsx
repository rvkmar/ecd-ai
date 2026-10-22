// src/components/domainAnalyses/DomainAnalysisTable.jsx
//
// Read-only Domain Analysis Structure: a searchable table and an
// Ingredients view. The seven sections are the statement lists on the
// record. The linked policy is contentStandards (the copied curricular
// policy). Design patterns and Q-matrices are the other records that
// store this analysis as domainAnalysisId.

import React, { useMemo, useState } from "react";
import { useDomainAnalyses } from "@/api/queries/domainAnalyses";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import { useQMatrixModels } from "@/api/queries/qMatrixModels";
import { apiErrorMessage } from "@/api/apiClient";
import ModelIngredientsCard from "@/components/shared/ModelIngredientsCard";
import { psychologicalPerspectiveLabel } from "@/utils/ecdVocabulary";
import { domainAnalysisReadiness } from "@/utils/domainAnalysisReadiness";
import { DOMAIN_ANALYSIS_ENTITIES } from "@/utils/schema";

function readinessLabel(record) {
  return domainAnalysisReadiness(record, { strict: true }).ready ? "Ready" : "Not ready";
}

export function policyName(record) {
  const name = String(record?.contentStandards?.name || "").trim();
  return name || "Not linked";
}

export function patternsForAnalysis(analysisId, patterns = []) {
  if (!analysisId) return [];
  return patterns.filter((row) => row?.domainAnalysisId === analysisId);
}

export function qMatricesForAnalysis(analysisId, matrices = []) {
  if (!analysisId) return [];
  return matrices.filter((row) => row?.domainAnalysisId === analysisId);
}

function statementItems(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => String(row?.label || "").trim())
    .filter(Boolean)
    .map((label) => ({ primary: label }));
}

export function policyItems(standards) {
  if (!standards || typeof standards !== "object" || Array.isArray(standards)) return [];
  const items = [];
  for (const goal of standards.curricularGoals || []) {
    const statement = String(goal?.statement || "").trim();
    if (statement) {
      items.push({
        id: goal.code || undefined,
        primary: statement,
        secondary: goal.code ? `Goal ${goal.code}` : "Goal",
      });
    }
    for (const comp of goal?.competencies || []) {
      const compStatement = String(comp?.statement || "").trim();
      if (compStatement) {
        items.push({
          id: comp.code || undefined,
          primary: compStatement,
          secondary: comp.code ? `Competency ${comp.code}` : "Competency",
        });
      }
      for (const outcome of comp?.learningOutcomes || []) {
        const text = String(outcome || "").trim();
        if (text) items.push({ primary: text, secondary: "Learning outcome" });
      }
    }
  }
  return items;
}

export function ingredientGroupsForAnalysis(record, context) {
  const patterns = patternsForAnalysis(record.id, context.patterns);
  const matrices = qMatricesForAnalysis(record.id, context.qMatrices);
  const perspective = String(record.psychologicalPerspective || "").trim();

  return [
    ...DOMAIN_ANALYSIS_ENTITIES.map((section) => ({
      key: section.field,
      label: section.padi,
      items: statementItems(record[section.field]),
    })),
    {
      key: "perspective",
      label: "Perspective",
      items: perspective
        ? [{ primary: psychologicalPerspectiveLabel(perspective) }]
        : [],
    },
    {
      key: "policy",
      label: "Linked policy",
      items: policyItems(record.contentStandards),
    },
    {
      key: "patterns",
      label: "Design patterns",
      items: patterns.map((row) => ({
        id: row.id,
        primary: row.name || row.id,
      })),
    },
    {
      key: "qmatrices",
      label: "Q-matrices",
      items: matrices.map((row) => ({
        id: row.id,
        primary: row.name || row.id,
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
    case "policy":
      return policyName(record);
    case "patterns":
      return patternsForAnalysis(record.id, context.patterns).length;
    case "qmatrices":
      return qMatricesForAnalysis(record.id, context.qMatrices).length;
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
  { key: "policy", label: "Linked policy" },
  { key: "patterns", label: "Design Patterns" },
  { key: "qmatrices", label: "Q-matrices" },
  { key: "updatedAt", label: "Updated" },
];

export default function DomainAnalysisTable() {
  const analysesQuery = useDomainAnalyses();
  const patternsQuery = useDesignPatterns();
  const matricesQuery = useQMatrixModels();

  const analyses = analysesQuery.data || [];
  const patterns = patternsQuery.data || [];
  const qMatrices = matricesQuery.data || [];

  const loading = analysesQuery.isLoading || patternsQuery.isLoading || matricesQuery.isLoading;
  const queryError = analysesQuery.error || patternsQuery.error || matricesQuery.error;
  const error = queryError
    ? apiErrorMessage(queryError, "Failed to fetch domain analyses.")
    : null;

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("updatedAt");
  const [sortDir, setSortDir] = useState("desc");
  const [viewMode, setViewMode] = useState("table");

  const context = useMemo(
    () => ({ patterns, qMatrices }),
    [patterns, qMatrices]
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return analyses;
    return analyses.filter((record) =>
      [record.id, record.name, record.status, policyName(record)]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle))
    );
  }, [analyses, search]);

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
    return <div className="p-6 text-sm text-gray-600">Loading domain analyses...</div>;
  }

  if (error) {
    return <div className="p-6 text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Domain Analysis Structure</h1>
          <p className="text-sm text-gray-500 max-w-3xl">
            Design Patterns and Q-matrices count records that store this analysis
            as domainAnalysisId. Linked policy is the name on contentStandards.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            aria-label="Search domain analyses"
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
                  <td className="px-4 py-3">{policyName(record)}</td>
                  <td className="px-4 py-3">{patternsForAnalysis(record.id, patterns).length}</td>
                  <td className="px-4 py-3">{qMatricesForAnalysis(record.id, qMatrices).length}</td>
                  <td className="px-4 py-3">
                    {record.updatedAt ? new Date(record.updatedAt).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-6 text-center text-gray-500">
                    No domain analyses found.
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
              groups={ingredientGroupsForAnalysis(record, context)}
              subtitle={`${policyName(record)} • ${readinessLabel(record)}`}
            />
          ))}
          {sorted.length === 0 && (
            <div className="bg-white rounded-2xl shadow px-4 py-6 text-center text-gray-500 text-sm">
              No domain analyses found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
