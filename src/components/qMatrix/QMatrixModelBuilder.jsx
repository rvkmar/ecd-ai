// Diagnostic Design shell: Dashboard, Diagnostic Design Structure, Manage.
// The artifact is a Q-matrix. Manage opens the existing editor for New,
// Edit, and Duplicate. There is no clone route, so Duplicate prefills a
// new draft.
//
// focus, id, and qMatrixId open Manage on that record.
// domainAnalysisId is the Domain Analysis handoff: it opens the Manage
// list of designs that name that analysis, and New keeps the citation.
// It is not a diagnostic-design id.

import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";

import Modal from "@/components/ui/Modal";
import WorkedExample from "@/components/authoring/WorkedExample";
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
import { useDomainAnalyses } from "@/api/queries/domainAnalyses";
import { useQMatrixModels, useDeleteQMatrixModel } from "@/api/queries/qMatrixModels";
import { meetsDiagnosticDesignConfirmedGates } from "./diagnosticDesignReadiness";
import DiagnosticDesignDashboard from "./DiagnosticDesignDashboard";
import DiagnosticDesignTable, {
  attributeCount,
  boundName,
  entryCount,
} from "./DiagnosticDesignTable";
import QMatrixEditor from "./QMatrixEditor";

const RECORD_KEYS = ["focus", "id", "qMatrixId"];

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "reviewed", label: "Reviewed" },
  { value: "confirmed", label: "Confirmed" },
  { value: "operational", label: "Operational" },
  { value: "suspended", label: "Suspended" },
  { value: "archived", label: "Archived" },
];

export function diagnosticDesignFocusId(searchParams) {
  for (const key of RECORD_KEYS) {
    const value = searchParams.get(key);
    if (value) return value;
  }
  return "";
}

export function duplicateDiagnosticDesignDraft(row) {
  const name = String(row?.name || "").trim();
  return {
    name: name ? `${name} copy` : "copy",
    description: row?.description || "",
    competencyModelId: row?.competencyModelId || "",
    competencyModelVersion: row?.competencyModelVersion,
    attributeIds: Array.isArray(row?.attributeIds) ? [...row.attributeIds] : [],
    entries: Array.isArray(row?.entries) ? row.entries.map((entry) => ({ ...entry })) : [],
    domainAnalysisId: row?.domainAnalysisId || "",
  };
}

function designReadinessValue(record) {
  return meetsDiagnosticDesignConfirmedGates(record) ? "ready" : "not-ready";
}

function clearRecordFocus(searchParams) {
  const next = new URLSearchParams(searchParams);
  for (const key of RECORD_KEYS) next.delete(key);
  return next;
}

function DiagnosticDesignManage({ readOnly = false, analysisId = "" }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = diagnosticDesignFocusId(searchParams);
  const [screen, setScreen] = useState(focusId ? "edit" : "list");
  const [seed, setSeed] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const { data: designs = [], isLoading, error } = useQMatrixModels();
  const { data: competencyModels = [] } = useCompetencyModels();
  const { data: domainAnalyses = [] } = useDomainAnalyses();
  const deleteMut = useDeleteQMatrixModel();

  const shown = analysisId
    ? designs.filter((row) => row.domainAnalysisId === analysisId)
    : designs;
  const analysisName = analysisId ? boundName(domainAnalyses, analysisId) : "";

  useEffect(() => {
    if (focusId) setScreen("edit");
  }, [focusId]);

  function clearFocus() {
    const next = clearRecordFocus(searchParams);
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
    next.delete("qMatrixId");
    setSearchParams(next);
    setSeed(null);
    setScreen("edit");
  }

  function openDuplicate(row) {
    clearFocus();
    setSeed(duplicateDiagnosticDesignDraft(row));
    setScreen("create");
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <h2 className="mb-4 text-2xl font-semibold">Manage Diagnostic Designs</h2>
        <p className="text-sm text-slate-500">Loading diagnostic designs…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h2 className="mb-4 text-2xl font-semibold">Manage Diagnostic Designs</h2>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {apiErrorMessage(error, "Failed to load diagnostic designs")}
        </div>
      </div>
    );
  }

  if (screen === "create" || screen === "edit") {
    const editing = screen === "edit" ? designs.find((row) => row.id === focusId) : null;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 px-2">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">
              {editing?.name || seed?.name || "New Diagnostic Design"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              The editor saves the attributes and the item cells. Cancel returns
              to the list.
            </p>
          </div>
          <button type="button" onClick={backToList} className={manageSecondaryButtonClass}>
            Back to list
          </button>
        </div>
        <QMatrixEditor
          key={
            screen === "edit"
              ? `edit-${focusId || "record"}`
              : `create-${seed?.name || analysisId || "blank"}`
          }
          qMatrixId={screen === "edit" ? focusId : undefined}
          initialDraft={screen === "create" ? seed : null}
          readOnly={readOnly}
          domainAnalysisId={analysisId || undefined}
          domainAnalyses={domainAnalyses}
          onCancel={backToList}
          onSaved={backToList}
        />
      </div>
    );
  }

  return (
    <>
      <ModelManageList
        title="Manage Diagnostic Designs"
        description={
          analysisId
            ? `These diagnostic designs name ${analysisName}. Their cells stay on the design. Knowledge–task statements are not those cells.`
            : "Bind binary Student Model attributes to the items that give evidence about them. Confirming locks the design a DINA or G-DINA Evidence Model can cite."
        }
        newLabel="New Diagnostic Design"
        onCreate={readOnly ? undefined : openCreate}
        records={shown}
        emptyMessage={
          analysisId
            ? "No diagnostic designs name this Domain Analysis yet."
            : "No diagnostic designs yet."
        }
        filteredEmptyMessage="No diagnostic designs match the current filters."
        statusOptions={STATUS_OPTIONS}
        searchLabel="Search diagnostic designs"
        searchPlaceholder="Search diagnostic designs…"
        searchText={(row) =>
          [
            row.name,
            row.description,
            boundName(competencyModels, row.competencyModelId),
            boundName(domainAnalyses, row.domainAnalysisId),
          ]
            .filter((part) => part && part !== "Not linked")
            .join(" ")
        }
        readinessOf={designReadinessValue}
        renderMeta={(row) => {
          const ready = designReadinessValue(row) === "ready";
          const attributes = attributeCount(row);
          const entries = entryCount(row);
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
                {attributes} attribute{attributes === 1 ? "" : "s"}
              </span>
              <span>
                {entries} entr{entries === 1 ? "y" : "ies"}
              </span>
            </div>
          );
        }}
        renderDetails={(row) => (
          <>
            <p className="leading-relaxed text-slate-600">
              {String(row.description || "").trim() || "No description yet."}
            </p>
            <p className="leading-relaxed text-slate-600">
              Student Model: {boundName(competencyModels, row.competencyModelId)}. Domain
              Analysis: {boundName(domainAnalyses, row.domainAnalysisId)}. {attributeCount(row)}{" "}
              attribute{attributeCount(row) === 1 ? "" : "s"}, {entryCount(row)} entr
              {entryCount(row) === 1 ? "y" : "ies"}.
            </p>
          </>
        )}
        renderActions={(row) => (
          <>
            <button type="button" onClick={() => openEdit(row)} className={manageOpenButtonClass}>
              {readOnly ? "View" : openActionLabel(row)}
            </button>
            {readOnly ? null : (
              <button
                type="button"
                onClick={() => openDuplicate(row)}
                className={manageQuietButtonClass}
                title="Open the create form with these attributes copied"
              >
                Duplicate
              </button>
            )}
            {readOnly ? null : (
              <button
                type="button"
                onClick={() => setPendingDelete(row)}
                disabled={Boolean(row.locked) || deleteMut.isPending}
                title={
                  row.locked
                    ? "A locked diagnostic design stays in place. Return it to draft before deleting."
                    : undefined
                }
                className={manageDangerButtonClass}
              >
                Delete
              </button>
            )}
          </>
        )}
      />
      {shown.length === 0 && !readOnly ? (
        <div className="px-6 pb-6">
          <WorkedExample
            title="Plant part naming"
            lines={[
              "Student Model: one binary attribute, Names a plant part.",
              "One row per item. A marked cell means that item gives evidence about that attribute.",
              "A row with no marks is unfinished.",
            ]}
            citedBy="a DINA or G-DINA Evidence Model, as structureConfig.qMatrixId. A Domain Analysis can open this list for its own analysis"
          />
        </div>
      ) : null}
      <Modal
        isOpen={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await deleteMut.mutateAsync(pendingDelete.id);
            toast.success("Diagnostic design deleted.");
          } catch (err) {
            toast.error(apiErrorMessage(err, "Delete failed."));
          }
          setPendingDelete(null);
        }}
        title="Delete Diagnostic Design"
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

export default function QMatrixModelBuilder({ readOnly = false, domainAnalysisId }) {
  const [searchParams] = useSearchParams();
  const focusId = diagnosticDesignFocusId(searchParams);
  const analysisId = domainAnalysisId || searchParams.get("domainAnalysisId") || "";
  const [mode, setMode] = useState(focusId || analysisId ? "manage" : "dashboard");

  useEffect(() => {
    if (focusId || analysisId) setMode("manage");
  }, [focusId, analysisId]);

  return (
    <ModelTabShell
      mode={mode}
      onModeChange={setMode}
      tabs={[
        { id: "dashboard", label: "Dashboard", panel: <DiagnosticDesignDashboard /> },
        { id: "structure", label: "Diagnostic Design Structure", panel: <DiagnosticDesignTable /> },
        {
          id: "manage",
          label: "Manage Diagnostic Designs",
          panel: <DiagnosticDesignManage readOnly={readOnly} analysisId={analysisId} />,
        },
      ]}
    />
  );
}
