// Presentation Model shell: Dashboard, Presentation Structure, Manage.
// Manage opens the existing wizard for New, Edit, and Duplicate.
// There is no clone route, so Duplicate prefills a new draft.
//
// focus, id, and presentationModelId on the URL open Manage on that
// record. The Admin leaf id stays "presentation", so a Delivery-era
// ?tab=presentation address lands on this Models tab and still honors
// those record params. /admin/presentation-models does the same.

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
import { useTaskModels } from "@/api/queries/taskModels";
import {
  usePresentationModels,
  useDeletePresentationModel,
} from "@/api/queries/presentationModels";
import { meetsPresentationConfirmedGates } from "./presentationModelReadiness";
import PresentationModelDashboard from "./PresentationModelDashboard";
import PresentationModelTable, {
  boundName,
  feedbackLabel,
  navigationLabel,
  orderLabel,
  profileLabel,
} from "./PresentationModelTable";
import PresentationModelWizard from "./PresentationModelWizard/PresentationModelWizard";
import { PresentationModelWizardProvider } from "./PresentationModelWizard/PresentationModelWizardContext";

const FOCUS_KEYS = ["focus", "id", "presentationModelId"];

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "reviewed", label: "Reviewed" },
  { value: "confirmed", label: "Confirmed" },
  { value: "operational", label: "Operational" },
  { value: "suspended", label: "Suspended" },
  { value: "archived", label: "Archived" },
];

export function presentationFocusId(searchParams) {
  for (const key of FOCUS_KEYS) {
    const value = searchParams.get(key);
    if (value) return value;
  }
  return "";
}

export function duplicatePresentationDraft(row) {
  const name = String(row?.name || "").trim();
  return {
    name: name ? `${name} copy` : "copy",
    description: row?.description || "",
    taskModelId: row?.taskModelId || "",
    taskModelVersion: row?.taskModelVersion,
    layout: row?.layout && typeof row.layout === "object" ? { ...row.layout } : {},
    conditionalDisplay:
      row?.conditionalDisplay && typeof row.conditionalDisplay === "object"
        ? { ...row.conditionalDisplay }
        : {},
    accessibility:
      row?.accessibility && typeof row.accessibility === "object"
        ? { ...row.accessibility }
        : {},
  };
}

function presentationReadinessValue(record) {
  return meetsPresentationConfirmedGates(record) ? "ready" : "not-ready";
}

function clearPresentationFocus(searchParams) {
  const next = new URLSearchParams(searchParams);
  for (const key of FOCUS_KEYS) next.delete(key);
  return next;
}

function PresentationManage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = presentationFocusId(searchParams);
  const [screen, setScreen] = useState(focusId ? "edit" : "list");
  const [seed, setSeed] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const { data: presentationModels = [], isLoading, error } = usePresentationModels();
  const { data: taskModels = [] } = useTaskModels();
  const deleteMut = useDeletePresentationModel();

  useEffect(() => {
    if (focusId) setScreen("edit");
  }, [focusId]);

  function clearFocus() {
    const next = clearPresentationFocus(searchParams);
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
    next.delete("presentationModelId");
    setSearchParams(next);
    setSeed(null);
    setScreen("edit");
  }

  function openDuplicate(row) {
    clearFocus();
    setSeed(duplicatePresentationDraft(row));
    setScreen("create");
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <h2 className="mb-4 text-2xl font-semibold">Manage Presentation Models</h2>
        <p className="text-sm text-slate-500">Loading presentation models…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h2 className="mb-4 text-2xl font-semibold">Manage Presentation Models</h2>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {apiErrorMessage(error, "Failed to load presentation models")}
        </div>
      </div>
    );
  }

  if (screen === "create" || screen === "edit") {
    const editing = screen === "edit" ? presentationModels.find((row) => row.id === focusId) : null;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 px-2">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">
              {editing?.name || seed?.name || "New Presentation Model"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              The wizard saves a draft once a Task Model is bound. Cancel
              returns to the list.
            </p>
          </div>
          <button type="button" onClick={backToList} className={manageSecondaryButtonClass}>
            Back to list
          </button>
        </div>
        <PresentationModelWizardProvider
          key={
            screen === "edit"
              ? `edit-${focusId || "record"}`
              : `create-${seed?.name || "blank"}`
          }
          presentationModelId={screen === "edit" ? focusId : undefined}
          initialDraft={screen === "create" ? seed : null}
          onSaved={backToList}
        >
          <PresentationModelWizard onCancel={backToList} />
        </PresentationModelWizardProvider>
      </div>
    );
  }

  return (
    <>
      <ModelManageList
        title="Manage Presentation Models"
        description="Set how a Task Model is ordered, grouped, navigated, and shown. Confirming locks the overlay."
        newLabel="New Presentation Model"
        onCreate={openCreate}
        records={presentationModels}
        emptyMessage="No Presentation Models defined yet."
        filteredEmptyMessage="No Presentation Models match the current filters."
        statusOptions={STATUS_OPTIONS}
        searchLabel="Search presentation models"
        searchPlaceholder="Search presentation models…"
        searchText={(row) =>
          [row.name, row.description, boundName(taskModels, row.taskModelId)]
            .filter((part) => part && part !== "Not linked")
            .join(" ")
        }
        readinessOf={presentationReadinessValue}
        renderMeta={(row) => {
          const ready = presentationReadinessValue(row) === "ready";
          return (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide ${
                  ready ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                {ready ? "Ready" : "Not ready"}
              </span>
              <span>{boundName(taskModels, row.taskModelId)}</span>
              <span>{orderLabel(row)}</span>
              <span>{navigationLabel(row)}</span>
              <span>{profileLabel(row)}</span>
            </div>
          );
        }}
        renderDetails={(row) => (
          <>
            <p className="leading-relaxed text-slate-600">
              {String(row.description || "").trim() || "No description yet."}
            </p>
            <p className="leading-relaxed text-slate-600">
              Task Model: {boundName(taskModels, row.taskModelId)}. Order: {orderLabel(row)}.
              Navigation: {navigationLabel(row)}. Feedback: {feedbackLabel(row)}. Profile:{" "}
              {profileLabel(row)}.
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
              title="Open the create wizard with this overlay copied"
            >
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => setPendingDelete(row)}
              disabled={Boolean(row.locked) || deleteMut.isPending}
              title={
                row.locked
                  ? "A locked Presentation Model stays in place. Return it to draft before deleting."
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
            toast.success("Presentation model deleted.");
          } catch (err) {
            toast.error(apiErrorMessage(err, "Delete failed."));
          }
          setPendingDelete(null);
        }}
        title="Delete Presentation Model"
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

export default function PresentationModelBuilder() {
  const [searchParams] = useSearchParams();
  const focusId = presentationFocusId(searchParams);
  const [mode, setMode] = useState(focusId ? "manage" : "dashboard");

  useEffect(() => {
    if (focusId) setMode("manage");
  }, [focusId]);

  return (
    <ModelTabShell
      mode={mode}
      onModeChange={setMode}
      tabs={[
        { id: "dashboard", label: "Dashboard", panel: <PresentationModelDashboard /> },
        { id: "structure", label: "Presentation Structure", panel: <PresentationModelTable /> },
        { id: "manage", label: "Manage Presentation Models", panel: <PresentationManage /> },
      ]}
    />
  );
}
