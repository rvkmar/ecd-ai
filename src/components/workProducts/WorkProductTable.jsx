// Read-only Work Product Structure: a searchable table and an
// Ingredients view. The groups are the records that cite each work
// product: items, evidence models, and design patterns.

import React, { useMemo, useState } from "react";
import { useWorkProducts } from "@/api/queries/workProducts";
import { useItems } from "@/api/queries/items";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import { apiErrorMessage } from "@/api/apiClient";
import ModelIngredientsCard from "@/components/shared/ModelIngredientsCard";
import {
  ingredientGroupsForWorkProduct,
  readinessText,
  recordLabel,
  usageCounts,
  workProductTypeText,
} from "./workProductUsage";

function sortValue(record, key, context) {
  const counts = usageCounts(record, context);
  switch (key) {
    case "id":
      return record.id || "";
    case "name":
      return record.name || "";
    case "type":
      return workProductTypeText(record.type);
    case "readiness":
      return readinessText(record);
    case "items":
      return counts.items.length;
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
  { key: "type", label: "Type" },
  { key: "readiness", label: "Readiness" },
  { key: "items", label: "Items" },
  { key: "evidenceModels", label: "Evidence models" },
  { key: "designPatterns", label: "Design patterns" },
  { key: "updatedAt", label: "Updated" },
];

export default function WorkProductTable() {
  const productsQuery = useWorkProducts();
  const itemsQuery = useItems();
  const evidenceQuery = useEvidenceModels();
  const patternsQuery = useDesignPatterns();

  const workProducts = productsQuery.data || [];
  const items = itemsQuery.data || [];
  const evidenceModels = evidenceQuery.data || [];
  const designPatterns = patternsQuery.data || [];

  const loading = [productsQuery, itemsQuery, evidenceQuery, patternsQuery].some(
    (query) => query.isLoading
  );
  const queryError =
    productsQuery.error || itemsQuery.error || evidenceQuery.error || patternsQuery.error;
  const error = queryError
    ? apiErrorMessage(queryError, "Failed to fetch work products.")
    : null;

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("updatedAt");
  const [sortDir, setSortDir] = useState("desc");
  const [viewMode, setViewMode] = useState("table");

  const context = useMemo(
    () => ({ items, evidenceModels, designPatterns }),
    [items, evidenceModels, designPatterns]
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return workProducts;
    return workProducts.filter((record) => {
      const counts = usageCounts(record, context);
      return [
        record.id,
        record.name,
        record.description,
        workProductTypeText(record.type),
        readinessText(record),
        ...counts.items.map((row) => recordLabel(row)),
        ...counts.evidenceModels.map((row) => recordLabel(row)),
        ...counts.designPatterns.map((row) => recordLabel(row)),
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [workProducts, search, context]);

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
    return <div className="p-6 text-sm text-gray-600">Loading work products...</div>;
  }

  if (error) {
    return <div className="p-6 text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Work Product Structure</h1>
          <p id="wp-usage-note" className="text-sm text-gray-500 max-w-3xl">
            Items cite a work product on interaction.workProductId. Evidence
            models cite it on an evaluation procedure. Design patterns list it
            under potential work products.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            aria-label="Search work products"
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
                        column.key === "items" ||
                        column.key === "evidenceModels" ||
                        column.key === "designPatterns"
                          ? "wp-usage-note"
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
                    <td className="px-4 py-3">{workProductTypeText(record.type)}</td>
                    <td className="px-4 py-3">{readinessText(record)}</td>
                    <td className="px-4 py-3">{counts.items.length}</td>
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
                    No work products found.
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
              groups={ingredientGroupsForWorkProduct(record, context)}
              subtitle={`${workProductTypeText(record.type)} • ${readinessText(record)}`}
            />
          ))}
          {sorted.length === 0 && (
            <div className="bg-white rounded-2xl shadow px-4 py-6 text-center text-gray-500 text-sm">
              No work products found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
