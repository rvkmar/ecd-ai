// Assembly Model shell: Dashboard, Assembly Structure, Manage.
// Manage opens the existing wizard for New, Edit, and Duplicate.
// There is no clone route, so Duplicate prefills a new draft.
// focus, id, and assemblyModelId on the URL open Manage on that record.

import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";

import Modal from "@/components/ui/Modal";
import { apiErrorMessage } from "@/api/apiClient";
import { openActionLabel } from "@/utils/modelActionLabel";
import ModelManageList, {
  manageOpenButtonClass,
  manageQuietButtonClass,
  manageDangerButtonClass,
  manageSecondaryButtonClass,
} from "@/components/shared/ModelManageList";
import ModelTabShell from "@/components/shared/ModelTabShell";
import { useCompetencyModels } from "@/api/queries/competencies";
import { usePolicies } from "@/api/queries/policies";
import { useAssemblyModels, useDeleteAssemblyModel } from "@/api/queries/assemblyModels";
import { meetsAssemblyConfirmedGates } from "./assemblyModelReadiness";
import AssemblyModelDashboard from "./AssemblyModelDashboard";
import AssemblyModelTable, { boundName, stoppingRulesLabel, targetCount } from "./AssemblyModelTable";
import AssemblyModelWizard from "./AssemblyModelWizard/AssemblyModelWizard";
import { AssemblyModelWizardProvider } from "./AssemblyModelWizard/AssemblyModelWizardContext";

const FOCUS_KEYS = ["focus", "id", "assemblyModelId"];

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "reviewed", label: "Reviewed" },
  { value: "confirmed", label: "Confirmed" },
  { value: "operational", label: "Operational" },
  { value: "suspended", label: "Suspended" },
  { value: "archived", label: "Archived" },
];

export function assemblyFocusId(searchParams) {
  for (const key of FOCUS_KEYS) {
    const value = searchParams.get(key);
    if (value) return value;
  }
  return "";
}

export function duplicateAssemblyDraft(row) {
  const name = String(row?.name || "").trim();
  return {
    name: name ? `${name} copy` : "copy",
    description: row?.description || "",
    competencyModelId: row?.competencyModelId || "",
    competencyModelVersion: row?.competencyModelVersion,
    targetsBySMV: Array.isArray(row?.targetsBySMV)
      ? row.targetsBySMV.map((target) => ({ ...target }))
      : [],
    stoppingRules: row?.stoppingRules ? { ...row.stoppingRules } : {},
    selectionAlgorithm: row?.selectionAlgorithm?.policyId
      ? { policyId: row.selectionAlgorithm.policyId }
      : {},
  };
}

function assemblyReadinessValue(record) {
  return meetsAssemblyConfirmedGates(record) ? "ready" : "not-ready";
}

function clearAssemblyFocus(searchParams) {
  const next = new URLSearchParams(searchParams);
  for (const key of FOCUS_KEYS) next.delete(key);
  return next;
}

function AssemblyManage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = assemblyFocusId(searchParams);
  const [screen, setScreen] = useState(focusId ? "edit" : "list");
  const [seed, setSeed] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const { data: assemblyModels = [], isLoading, error } = useAssemblyModels();
  const { data: competencyModels = [] } = useCompetencyModels();
  const { data: policies = [] } = usePolicies();
  const deleteMut = useDeleteAssemblyModel();

  useEffect(() => {
    if (focusId) setScreen("edit");
  }, [focusId]);

  function clearFocus() {
    const next = clearAssemblyFocus(searchParams);
    if (next.toString() === searchParams.toString()) return;
    setSearchParams(next, { replace: true });
  }

  function backToList() {
    clearFocus();
    setSeed(null);
    setScreen("list");
  }

  function openCreate() {
    clearFocus();
    setSeed(null);
    setScreen("create");
  }

  function openEdit(row) {
    const next = new URLSearchParams(searchParams);
    next.set("focus", row.id);
    next.delete("id");
    next.delete("assemblyModelId");
    setSearchParams(next);
    setSeed(null);
    setScreen("edit");
  }

  function openDuplicate(row) {
    clearFocus();
    setSeed(duplicateAssemblyDraft(row));
    setScreen("create");
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <h2 className="mb-4 text-2xl font-semibold">Manage Assembly Models</h2>
        <p className="text-sm text-slate-500">Loading assembly models…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h2 className="mb-4 text-2xl font-semibold">Manage Assembly Models</h2>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {apiErrorMessage(error, "Failed to load assembly models")}
        </div>
      </div>
    );
  }

  if (screen === "create" || screen === "edit") {
    const editing = screen === "edit" ? assemblyModels.find((row) => row.id === focusId) : null;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 px-2">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">
              {editing?.name || seed?.name || "New Assembly Model"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              The wizard saves a draft once a selection policy is bound. Cancel
              returns to the list.
            </p>
          </div>
          <button type="button" onClick={backToList} className={manageSecondaryButtonClass}>
            Back to list
          </button>
        </div>
        <AssemblyModelWizardProvider
          key={
            screen === "edit"
              ? `edit-${focusId || "record"}`
              : `create-${seed?.name || "blank"}`
          }
          assemblyModelId={screen === "edit" ? focusId : undefined}
          initialDraft={screen === "create" ? seed : null}
          onSaved={backToList}
        >
          <AssemblyModelWizard onCancel={backToList} />
        </AssemblyModelWizardProvider>
      </div>
    );
  }

  return (
    <>
      <ModelManageList
        title="Manage Assembly Models"
        description="Set the Student Model targets, the stopping rules, and the selection policy for a test. Confirming locks the specification."
        newLabel="New Assembly Model"
        onCreate={openCreate}
        records={assemblyModels}
        emptyMessage="No Assembly Models defined yet."
        filteredEmptyMessage="No Assembly Models match the current filters."
        statusOptions={STATUS_OPTIONS}
        searchLabel="Search assembly models"
        searchPlaceholder="Search assembly models…"
        searchText={(row) =>
          [
            row.name,
            row.description,
            boundName(competencyModels, row.competencyModelId),
            boundName(policies, row.selectionAlgorithm?.policyId),
          ]
            .filter((part) => part && part !== "Not linked")
            .join(" ")
        }
        readinessOf={assemblyReadinessValue}
        renderMeta={(row) => {
          const ready = assemblyReadinessValue(row) === "ready";
          const targets = targetCount(row);
          return (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide ${
                  ready ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                {ready ? "Ready" : "Not ready"}
              </span>
              <span>{boundName(competencyModels, row.competencyModelId)}</span>
              <span>
                {targets} target{targets === 1 ? "" : "s"}
              </span>
              <span>{stoppingRulesLabel(row)}</span>
            </div>
          );
        }}
        renderDetails={(row) => (
          <>
            <p className="leading-relaxed text-slate-600">
              {String(row.description || "").trim() || "No description yet."}
            </p>
            <p className="leading-relaxed text-slate-600">
              Student Model: {boundName(competencyModels, row.competencyModelId)}. Selection
              policy: {boundName(policies, row.selectionAlgorithm?.policyId)}. Stopping:{" "}
              {stoppingRulesLabel(row)}.
            </p>
          </>
        )}
        renderActions={(row) => (
          <>
            <button type="button" onClick={() => openEdit(row)} className={manageOpenButtonClass}>
              {openActionLabel(row)}
            </button>
            <button
              type="button"
              onClick={() => openDuplicate(row)}
              className={manageQuietButtonClass}
              title="Open the create wizard with these targets copied"
            >
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => setPendingDelete(row)}
              disabled={Boolean(row.locked) || deleteMut.isPending}
              title={
                row.locked
                  ? "A locked Assembly Model stays in place. Return it to draft before deleting."
                  : undefined
              }
              className={manageDangerButtonClass}
            >
              Delete
            </button>
          </>
        )}
      />
      <Modal
        isOpen={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await deleteMut.mutateAsync(pendingDelete.id);
            toast.success("Assembly model deleted.");
          } catch (err) {
            toast.error(apiErrorMessage(err, "Delete failed."));
          }
          setPendingDelete(null);
        }}
        title="Delete Assembly Model"
        message={
          pendingDelete
            ? `Delete "${pendingDelete.name || pendingDelete.id}"? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        confirmClass="bg-red-600 hover:bg-red-700 text-white"
      />
    </>
  );
}

export default function AssemblyModelBuilder() {
  const [searchParams] = useSearchParams();
  const focusId = assemblyFocusId(searchParams);
  const [mode, setMode] = useState(focusId ? "manage" : "dashboard");

  useEffect(() => {
    if (focusId) setMode("manage");
  }, [focusId]);

  return (
    <ModelTabShell
      mode={mode}
      onModeChange={setMode}
      tabs={[
        { id: "dashboard", label: "Dashboard", panel: <AssemblyModelDashboard /> },
        { id: "structure", label: "Assembly Structure", panel: <AssemblyModelTable /> },
        { id: "manage", label: "Manage Assembly Models", panel: <AssemblyManage /> },
      ]}
    />
  );
}
