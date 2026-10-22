// Read-only Presentation Structure: a searchable table and an Ingredients
// view. A Presentation Model stores the overlay for one Task Model: item
// order, grouping, navigation, conditional display, and accessibility.
// Templates cite it by presentationModelId.

import React, { useMemo, useState } from "react";
import { usePresentationModels } from "@/api/queries/presentationModels";
import { useTaskModels } from "@/api/queries/taskModels";
import { useTemplates } from "@/api/queries/templates";
import { apiErrorMessage } from "@/api/apiClient";
import ModelIngredientsCard from "@/components/shared/ModelIngredientsCard";
import { meetsPresentationConfirmedGates } from "./presentationModelReadiness";
import {
  presentationAccessibilityProfileLabel,
  presentationFeedbackTimingLabel,
  presentationGroupingLabel,
  presentationItemOrderLabel,
  presentationNavigationLabel,
} from "@/utils/ecdVocabulary";

export function readinessLabel(record) {
  return meetsPresentationConfirmedGates(record) ? "Ready" : "Not ready";
}

export function citedName(rows, id) {
  const key = String(id || "").trim();
  if (!key) return "";
  return (rows || []).find((row) => row.id === key)?.name || key;
}

export function boundName(rows, id) {
  return citedName(rows, id) || "Not linked";
}

export function orderLabel(record) {
  return presentationItemOrderLabel(record?.layout?.itemOrder);
}

export function groupingLabel(record) {
  return presentationGroupingLabel(record?.layout?.grouping);
}

export function navigationLabel(record) {
  return presentationNavigationLabel(record?.layout?.navigation);
}

export function profileLabel(record) {
  return presentationAccessibilityProfileLabel(record?.accessibility?.profile);
}

export function feedbackLabel(record) {
  return presentationFeedbackTimingLabel(record?.conditionalDisplay?.showFeedback);
}

export function templatesForPresentation(templates, presentationModelId) {
  if (!presentationModelId) return [];
  return (templates || []).filter((row) => row.presentationModelId === presentationModelId);
}

function bindingItem(rows, id, secondary) {
  const key = String(id || "").trim();
  if (!key) return [];
  const item = { id: key, primary: citedName(rows, key) || key };
  if (secondary) item.secondary = secondary;
  return [item];
}

function labelledItem(primary, secondary) {
  if (!primary || primary === "—") return [];
  const item = { primary };
  if (secondary) item.secondary = secondary;
  return [item];
}

function flagItem(primary, value) {
  if (value === true) return { primary, secondary: "On" };
  if (value === false) return { primary, secondary: "Off" };
  return null;
}

function layoutItems(record) {
  return [
    ...labelledItem(orderLabel(record) === "—" ? "" : `Order: ${orderLabel(record)}`),
    ...labelledItem(groupingLabel(record) === "—" ? "" : `Grouping: ${groupingLabel(record)}`),
    ...labelledItem(
      navigationLabel(record) === "—" ? "" : `Navigation: ${navigationLabel(record)}`
    ),
  ];
}

function conditionalItems(record) {
  const display = record?.conditionalDisplay || {};
  const feedback = feedbackLabel(record);
  return [
    ...labelledItem(feedback === "—" ? "" : `Feedback: ${feedback}`),
    flagItem("Allow skip", display.allowSkip),
    flagItem("Allow review", display.allowReview),
    flagItem("Show progress", display.showProgress),
  ].filter(Boolean);
}

function accessibilityItems(record) {
  const accessibility = record?.accessibility || {};
  const profile = profileLabel(record);
  const items = labelledItem(profile === "—" ? "" : profile);
  if (typeof accessibility.fontScale === "number") {
    items.push({ primary: "Font scale", secondary: String(accessibility.fontScale) });
  }
  if (typeof accessibility.timeMultiplier === "number") {
    items.push({ primary: "Time multiplier", secondary: String(accessibility.timeMultiplier) });
  }
  return items;
}

export function ingredientGroupsForPresentation(record, context) {
  const description = String(record.description || "").trim();
  const versionItems = record.versionNumber
    ? [
        {
          primary: `v${record.versionNumber}`,
          secondary: record.parentModelId ? `parent ${record.parentModelId}` : "",
        },
      ]
    : [];
  const templates = templatesForPresentation(context.templates, record.id);

  return [
    {
      key: "description",
      label: "Description",
      items: description ? [{ primary: description }] : [],
    },
    {
      key: "taskModel",
      label: "Task Model",
      items: bindingItem(
        context.taskModels,
        record.taskModelId,
        record.taskModelVersion != null ? `version ${record.taskModelVersion}` : ""
      ),
    },
    {
      key: "layout",
      label: "Layout",
      items: layoutItems(record),
    },
    {
      key: "conditionalDisplay",
      label: "Conditional display",
      items: conditionalItems(record),
    },
    {
      key: "accessibility",
      label: "Accessibility",
      items: accessibilityItems(record),
    },
    {
      key: "templates",
      label: "Templates",
      items: templates.map((row) => ({
        id: row.id,
        primary: row.name || row.id,
      })),
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
    case "taskModel":
      return boundName(context.taskModels, record.taskModelId);
    case "order":
      return orderLabel(record);
    case "grouping":
      return groupingLabel(record);
    case "navigation":
      return navigationLabel(record);
    case "profile":
      return profileLabel(record);
    case "templates":
      return templatesForPresentation(context.templates, record.id).length;
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
  { key: "taskModel", label: "Task Model" },
  { key: "order", label: "Order" },
  { key: "grouping", label: "Grouping" },
  { key: "navigation", label: "Navigation" },
  { key: "profile", label: "Profile" },
  { key: "templates", label: "Templates" },
  { key: "locked", label: "Locked" },
  { key: "updatedAt", label: "Updated" },
];

export default function PresentationModelTable() {
  const presentationQuery = usePresentationModels();
  const taskQuery = useTaskModels();
  const templateQuery = useTemplates();

  const presentationModels = presentationQuery.data || [];
  const taskModels = taskQuery.data || [];
  const templates = templateQuery.data || [];

  const loading = [presentationQuery, taskQuery, templateQuery].some((query) => query.isLoading);
  const queryError = presentationQuery.error || taskQuery.error || templateQuery.error;
  const error = queryError
    ? apiErrorMessage(queryError, "Failed to fetch presentation models.")
    : null;

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("updatedAt");
  const [sortDir, setSortDir] = useState("desc");
  const [viewMode, setViewMode] = useState("table");

  const context = useMemo(
    () => ({ taskModels, templates }),
    [taskModels, templates]
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return presentationModels;
    return presentationModels.filter((record) => {
      const linked = templatesForPresentation(templates, record.id);
      return [
        record.id,
        record.name,
        record.description,
        record.status,
        citedName(taskModels, record.taskModelId),
        orderLabel(record),
        groupingLabel(record),
        navigationLabel(record),
        profileLabel(record),
        feedbackLabel(record),
        ...linked.map((row) => row.name),
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [presentationModels, search, taskModels, templates]);

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
    return <div className="p-6 text-sm text-gray-600">Loading presentation models...</div>;
  }

  if (error) {
    return <div className="p-6 text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Presentation Structure</h1>
          <p className="text-sm text-gray-500 max-w-3xl">
            Order, grouping, navigation, feedback, and the accessibility profile
            are stored on the Presentation Model. The Task Model owns the items
            this overlay presents.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            aria-label="Search presentation models"
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
                  <td className="px-4 py-3">{boundName(taskModels, record.taskModelId)}</td>
                  <td className="px-4 py-3">{orderLabel(record)}</td>
                  <td className="px-4 py-3">{groupingLabel(record)}</td>
                  <td className="px-4 py-3">{navigationLabel(record)}</td>
                  <td className="px-4 py-3">{profileLabel(record)}</td>
                  <td className="px-4 py-3">
                    {templatesForPresentation(templates, record.id).length}
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
                    No presentation models found.
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
              groups={ingredientGroupsForPresentation(record, context)}
              subtitle={`${boundName(taskModels, record.taskModelId)} • ${readinessLabel(record)}`}
            />
          ))}
          {sorted.length === 0 && (
            <div className="bg-white rounded-2xl shadow px-4 py-6 text-center text-gray-500 text-sm">
              No presentation models found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
