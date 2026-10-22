// List console shared by Manage Design Pattern, Manage Domain Analysis,
// Manage Templates, Manage Assembly Models, Manage Diagnostic Designs,
// and Manage Presentation Models.
// The header, filters, and expandable cards follow TaskModelBuilderPanel
// and TaskModelList: title and description on the left, a black
// "+ New …" button on the right, then status and search, then one card
// per record. Competency, Evidence, and Task keep their own panels.

import React, { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import LifecycleStatusBadge from "@/components/ui/LifecycleStatusBadge";

export const manageNewButtonClass =
  "flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40";

export const manageSecondaryButtonClass =
  "rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

export const manageOpenButtonClass =
  "rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800";

export const manageQuietButtonClass =
  "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

export const manageDangerButtonClass =
  "rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50";

const controlClass =
  "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm";

function byRecent(records) {
  return [...records].sort((a, b) => {
    const aTime = Date.parse(a?.updatedAt || "") || 0;
    const bTime = Date.parse(b?.updatedAt || "") || 0;
    return bTime - aTime;
  });
}

export default function ModelManageList({
  title,
  description,
  newLabel,
  onCreate,
  secondaryActions = null,
  records = [],
  emptyMessage,
  filteredEmptyMessage,
  statusOptions = [
    { value: "draft", label: "Draft" },
    { value: "confirmed", label: "Confirmed" },
  ],
  statusOf = (record) => record.status || "draft",
  readinessOf = null,
  searchLabel = "Search",
  searchPlaceholder = "Search…",
  searchText = (record) => record.name || "",
  renderMeta,
  renderDetails,
  renderActions,
}) {
  const [expandedId, setExpandedId] = useState(null);
  const [filters, setFilters] = useState({
    status: "all",
    readiness: "all",
    search: "",
  });

  const ordered = useMemo(() => byRecent(records), [records]);

  const filtered = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return ordered.filter((record) => {
      if (filters.status !== "all" && statusOf(record) !== filters.status) return false;
      if (readinessOf && filters.readiness !== "all" && readinessOf(record) !== filters.readiness) {
        return false;
      }
      if (query && !String(searchText(record) || "").toLowerCase().includes(query)) return false;
      return true;
    });
  }, [ordered, filters, statusOf, readinessOf, searchText]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {secondaryActions}
          {typeof onCreate === "function" ? (
            <button type="button" onClick={onCreate} className={manageNewButtonClass}>
              <Plus size={16} strokeWidth={2.25} />
              {newLabel}
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={filters.search}
          onChange={(event) => setFilters({ ...filters, search: event.target.value })}
          placeholder={searchPlaceholder}
          aria-label={searchLabel}
          className={controlClass}
        />
        <select
          value={filters.status}
          onChange={(event) => setFilters({ ...filters, status: event.target.value })}
          className={controlClass}
          aria-label="Filter by lifecycle status"
        >
          <option value="all">All statuses</option>
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {readinessOf ? (
          <select
            value={filters.readiness}
            onChange={(event) => setFilters({ ...filters, readiness: event.target.value })}
            className={controlClass}
            aria-label="Filter by readiness"
          >
            <option value="all">All readiness</option>
            <option value="ready">Ready</option>
            <option value="not-ready">Not ready</option>
          </select>
        ) : null}
        <span className="text-sm text-slate-400">
          {filtered.length} of {records.length}
        </span>
      </div>

      {records.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyMessage}</p>
      ) : null}
      {records.length > 0 && filtered.length === 0 ? (
        <p className="text-sm text-slate-500">{filteredEmptyMessage}</p>
      ) : null}

      {filtered.map((record) => {
        const expanded = expandedId === record.id;
        return (
          <div
            key={record.id}
            className="rounded-xl border border-slate-200 bg-white shadow-sm"
          >
            <button
              type="button"
              onClick={() => setExpandedId(expanded ? null : record.id)}
              className="flex w-full items-start justify-between gap-4 p-4 text-left"
              aria-expanded={expanded}
            >
              <div className="min-w-0">
                <h3 className="truncate font-semibold text-slate-900">
                  {expanded ? "▾" : "▸"} {record.name || "Untitled"}
                </h3>
                {renderMeta ? renderMeta(record) : null}
              </div>
              <LifecycleStatusBadge status={statusOf(record)} className="shrink-0" />
            </button>
            {expanded ? (
              <div className="space-y-4 border-t border-slate-100 px-6 py-5 text-sm">
                {renderDetails ? renderDetails(record) : null}
                {renderActions ? (
                  <div className="flex flex-wrap gap-2 pt-1">{renderActions(record)}</div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
