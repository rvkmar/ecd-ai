// Delivery models under Admin, Models.
//
// The default export is the three-tab shell: Dashboard, Delivery
// Structure, Manage Delivery Models. The form is DeliveryModelForm.
// Manage opens it for New, Edit, and Duplicate.
// ?tab=deliverymodels selects this leaf. focus or id opens Manage on
// that record.
//
// There is no clone route. Duplicate prefills a new draft. Confirm posts
// to /:id/confirm. Names stay unique. Delete stays disabled while a
// session cites the id.

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/Modal";
import { apiErrorMessage } from "@/api/apiClient";
import {
  useDeliveryModels,
  useSessionsForDeliveryModels,
  useCreateDeliveryModel,
  useUpdateDeliveryModel,
  useConfirmDeliveryModel,
  useDeleteDeliveryModel,
} from "@/api/queries/deliveryModels";
import { useCompetencyModels } from "@/api/queries/competencies";
import { useAssemblyModels } from "@/api/queries/assemblyModels";
import { usePolicies } from "@/api/queries/policies";
import { usePresentationModels } from "@/api/queries/presentationModels";
import ModelManageList, {
  manageOpenButtonClass,
  manageQuietButtonClass,
  manageDangerButtonClass,
} from "@/components/shared/ModelManageList";
import ModelTabShell from "@/components/shared/ModelTabShell";
import DeliveryModelDashboard from "./DeliveryModelDashboard";
import DeliveryModelTable from "./DeliveryModelTable";
import { PRESENTATION_FEEDBACK_TIMINGS } from "@/utils/ecdVocabulary";
import {
  administrationSummary,
  deleteBlockedMessage,
  isDeliveryModelInUse,
  labelOf,
  readinessErrors,
  readinessOf,
  readinessText,
  sessionsCiting,
  uniqueDeliveryCopyName,
} from "./deliveryModelUsage";

const fieldClass =
  "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950";

function emptyAdministration() {
  return {
    timeLimitMinutes: "",
    attempts: "1",
    allowedReview: true,
    feedbackMode: "none",
  };
}

function emptyForm() {
  return {
    name: "",
    description: "",
    competencyModelId: "",
    assemblyModelId: "",
    policyId: "",
    presentationModelId: "",
    administration: emptyAdministration(),
  };
}

function formFromRow(row) {
  const admin = row.administration || {};
  return {
    name: row.name || "",
    description: row.description || "",
    competencyModelId: row.competencyModelId || "",
    assemblyModelId: row.assemblyModelId || "",
    policyId: row.policyId || "",
    presentationModelId: row.presentationModelId || "",
    administration: {
      timeLimitMinutes:
        admin.timeLimitMinutes == null || admin.timeLimitMinutes === ""
          ? ""
          : String(admin.timeLimitMinutes),
      attempts: admin.attempts == null ? "1" : String(admin.attempts),
      allowedReview: admin.allowedReview !== false,
      feedbackMode: admin.feedbackMode || "none",
    },
  };
}

function buildPayload(form) {
  const minutes = String(form.administration.timeLimitMinutes ?? "").trim();
  return {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    competencyModelId: form.competencyModelId || undefined,
    assemblyModelId: form.assemblyModelId || undefined,
    policyId: form.policyId || undefined,
    presentationModelId: form.presentationModelId || "",
    administration: {
      timeLimitMinutes: minutes === "" ? null : Number(minutes),
      attempts: Number(form.administration.attempts),
      allowedReview: Boolean(form.administration.allowedReview),
      feedbackMode: form.administration.feedbackMode || "none",
    },
  };
}

function recordFocus(searchParams) {
  return searchParams.get("focus") || searchParams.get("id") || "";
}

export function DeliveryModelForm({
  models = [],
  competencyModels = [],
  assemblyModels = [],
  policies = [],
  presentationModels = [],
  sessions = [],
  onCreate,
  onUpdate,
  onConfirm,
  createPending = false,
  updatePending = false,
  confirmPending = false,
  onDismiss = null,
  initialForm = null,
  focusId = null,
}) {
  const editing = focusId ? models.find((row) => row.id === focusId) : null;
  const [form, setForm] = useState(() => {
    if (initialForm) return initialForm;
    if (editing) return formFromRow(editing);
    return emptyForm();
  });

  const assemblies = assemblyModels.filter(
    (row) => !form.competencyModelId || row.competencyModelId === form.competencyModelId
  );
  const lists = {
    deliveryModels: models,
    competencyModels,
    assemblyModels,
    policies,
    presentationModels,
    sessions,
  };
  const probe = editing ? { ...editing, ...buildPayload(form), id: editing.id, status: editing.status } : null;
  const problems = probe ? readinessErrors({ ...probe, status: "confirmed" }, lists) : [];

  function patch(partial) {
    setForm((current) => ({ ...current, ...partial }));
  }

  function patchAdmin(partial) {
    setForm((current) => ({
      ...current,
      administration: { ...current.administration, ...partial },
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const payload = buildPayload(form);
    if (editing) {
      await onUpdate?.({ id: editing.id, payload });
      return;
    }
    await onCreate?.(payload);
  }

  async function handleConfirm() {
    if (!editing) return;
    await onUpdate?.({ id: editing.id, payload: buildPayload(form) });
    await onConfirm?.(editing.id);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-semibold">
          {editing ? "Edit delivery model" : "New delivery model"}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Bind the student model, assembly model, selection policy, and
          administration rules. Presentation is an optional override. Confirm
          requires the cited models to be confirmed or operational.
        </p>
      </div>

      {editing && sessionsCiting(editing, sessions).length > 0 && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {sessionsCiting(editing, sessions).length} session(s) cite this delivery model.
          Delete stays off while a session cites it.
        </p>
      )}

      <label className="block text-sm">
        <span className="font-medium">Name</span>
        <input
          className={fieldClass}
          value={form.name}
          onChange={(event) => patch({ name: event.target.value })}
          required
        />
      </label>

      <label className="block text-sm">
        <span className="font-medium">Description</span>
        <textarea
          className={fieldClass}
          rows={2}
          value={form.description}
          onChange={(event) => patch({ description: event.target.value })}
        />
      </label>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">Student model</span>
          <select
            className={fieldClass}
            aria-label="Student model"
            value={form.competencyModelId}
            onChange={(event) =>
              patch({ competencyModelId: event.target.value, assemblyModelId: "" })
            }
          >
            <option value="">Choose a student model</option>
            {competencyModels.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name || row.id} ({row.status || "draft"})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Assembly model</span>
          <select
            className={fieldClass}
            aria-label="Assembly model"
            value={form.assemblyModelId}
            onChange={(event) => patch({ assemblyModelId: event.target.value })}
          >
            <option value="">Choose an assembly model</option>
            {assemblies.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name || row.id} ({row.status || "draft"})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Selection policy</span>
          <select
            className={fieldClass}
            aria-label="Selection policy"
            value={form.policyId}
            onChange={(event) => patch({ policyId: event.target.value })}
          >
            <option value="">Choose a selection policy</option>
            {policies.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name || row.id} ({row.type})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Presentation model</span>
          <select
            className={fieldClass}
            aria-label="Presentation model"
            value={form.presentationModelId}
            onChange={(event) => patch({ presentationModelId: event.target.value })}
          >
            <option value="">No override</option>
            {presentationModels.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name || row.id} ({row.status || "draft"})
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="space-y-3 rounded-md border border-slate-200 p-4">
        <legend className="px-1 text-sm font-medium">Administration</legend>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">Time limit (minutes)</span>
            <input
              className={fieldClass}
              type="number"
              min="1"
              aria-label="Time limit minutes"
              placeholder="No limit"
              value={form.administration.timeLimitMinutes}
              onChange={(event) => patchAdmin({ timeLimitMinutes: event.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Attempts</span>
            <input
              className={fieldClass}
              type="number"
              min="1"
              step="1"
              aria-label="Attempts"
              value={form.administration.attempts}
              onChange={(event) => patchAdmin({ attempts: event.target.value })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm md:mt-6">
            <input
              type="checkbox"
              aria-label="Allowed review"
              checked={form.administration.allowedReview}
              onChange={(event) => patchAdmin({ allowedReview: event.target.checked })}
            />
            <span className="font-medium">Allowed review</span>
          </label>
          <label className="block text-sm">
            <span className="font-medium">Feedback mode</span>
            <select
              className={fieldClass}
              aria-label="Feedback mode"
              value={form.administration.feedbackMode}
              onChange={(event) => patchAdmin({ feedbackMode: event.target.value })}
            >
              {PRESENTATION_FEEDBACK_TIMINGS.map((row) => (
                <option key={row.value} value={row.value}>
                  {row.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      {editing && problems.length > 0 && editing.status !== "confirmed" && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          {problems.slice(0, 4).map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={createPending || updatePending}>
          {editing ? "Save" : "Create draft"}
        </Button>
        {editing && editing.status !== "confirmed" && (
          <Button
            type="button"
            variant="outline"
            disabled={confirmPending || updatePending}
            onClick={handleConfirm}
          >
            Confirm
          </Button>
        )}
        {onDismiss && (
          <Button type="button" variant="outline" onClick={onDismiss}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

function DeliveryModelManage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = recordFocus(searchParams);
  const [screen, setScreen] = useState(focusId ? "edit" : "list");
  const [seedForm, setSeedForm] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const { data: models = [], isLoading, error } = useDeliveryModels();
  const { data: sessions = [] } = useSessionsForDeliveryModels();
  const { data: competencyModels = [] } = useCompetencyModels();
  const { data: assemblyModels = [] } = useAssemblyModels();
  const { data: policies = [] } = usePolicies();
  const { data: presentationModels = [] } = usePresentationModels();
  const createMut = useCreateDeliveryModel();
  const updateMut = useUpdateDeliveryModel();
  const confirmMut = useConfirmDeliveryModel();
  const deleteMut = useDeleteDeliveryModel();

  const lists = useMemo(
    () => ({
      deliveryModels: models,
      sessions,
      competencyModels,
      assemblyModels,
      policies,
      presentationModels,
    }),
    [models, sessions, competencyModels, assemblyModels, policies, presentationModels]
  );

  useEffect(() => {
    if (focusId) setScreen("edit");
  }, [focusId]);

  function clearFocus() {
    if (!searchParams.get("focus") && !searchParams.get("id")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("focus");
    next.delete("id");
    setSearchParams(next, { replace: true });
  }

  function backToList() {
    clearFocus();
    setSeedForm(null);
    setScreen("list");
  }

  function openCreate() {
    clearFocus();
    setSeedForm(null);
    setScreen("create");
  }

  function openEdit(row) {
    const next = new URLSearchParams(searchParams);
    next.delete("id");
    next.set("focus", row.id);
    setSearchParams(next);
    setSeedForm(null);
    setScreen("edit");
  }

  function openDuplicate(row) {
    clearFocus();
    const seeded = formFromRow(row);
    seeded.name = uniqueDeliveryCopyName(row.name, models);
    setSeedForm(seeded);
    setScreen("create");
  }

  function askDelete(row) {
    if (isDeliveryModelInUse(row, sessions)) {
      toast.error(deleteBlockedMessage(sessionsCiting(row, sessions).length));
      return;
    }
    setPendingDelete(row);
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <h2 className="mb-4 text-2xl font-semibold">Manage Delivery Models</h2>
        <p className="text-sm text-slate-500">Loading delivery models...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h2 className="mb-4 text-2xl font-semibold">Manage Delivery Models</h2>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {apiErrorMessage(error, "Failed to load delivery models")}
        </div>
      </div>
    );
  }

  if (screen === "create" || screen === "edit") {
    return (
      <div>
        <div className="px-6 pt-6">
          <button type="button" className="text-sm text-slate-600 underline" onClick={backToList}>
            Back to list
          </button>
        </div>
        <DeliveryModelForm
          key={screen === "edit" ? `edit-${focusId || "record"}` : `create-${seedForm?.name || "blank"}`}
          models={models}
          competencyModels={competencyModels}
          assemblyModels={assemblyModels}
          policies={policies}
          presentationModels={presentationModels}
          sessions={sessions}
          focusId={screen === "edit" ? focusId : null}
          initialForm={screen === "create" ? seedForm : null}
          onDismiss={backToList}
          createPending={createMut.isPending}
          updatePending={updateMut.isPending}
          confirmPending={confirmMut.isPending}
          onCreate={async (payload) => {
            try {
              await createMut.mutateAsync(payload);
              toast.success("Delivery model draft created");
              backToList();
            } catch (err) {
              toast.error(apiErrorMessage(err, "Create failed"));
            }
          }}
          onUpdate={async ({ id, payload }) => {
            try {
              await updateMut.mutateAsync({ id, payload });
              toast.success("Delivery model updated");
            } catch (err) {
              toast.error(apiErrorMessage(err, "Update failed"));
              throw err;
            }
          }}
          onConfirm={async (id) => {
            try {
              await confirmMut.mutateAsync(id);
              toast.success("Delivery model confirmed");
              backToList();
            } catch (err) {
              toast.error(apiErrorMessage(err, "Confirm failed"));
            }
          }}
        />
      </div>
    );
  }

  return (
    <>
      <ModelManageList
        title="Manage Delivery Models"
        description="Draft or confirmed delivery models. Confirm posts the saved record. Delete stays off while a session cites the model."
        newLabel="New Delivery Model"
        onCreate={openCreate}
        records={models}
        emptyMessage="No Delivery Models defined yet."
        filteredEmptyMessage="No Delivery Models match the current filters."
        searchLabel="Search delivery models"
        searchPlaceholder="Search delivery models..."
        searchText={(row) =>
          [
            row.name,
            row.description,
            row.status,
            readinessText(row, lists),
            labelOf(competencyModels, row.competencyModelId),
            labelOf(assemblyModels, row.assemblyModelId),
            labelOf(policies, row.policyId),
            labelOf(presentationModels, row.presentationModelId),
            administrationSummary(row.administration),
          ]
            .filter(Boolean)
            .join(" ")
        }
        readinessOf={(row) => readinessOf(row, lists)}
        renderMeta={(row) => {
          const ready = readinessOf(row, lists) === "ready";
          return (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide ${
                  ready ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                {ready ? "Ready" : "Not ready"}
              </span>
              <span>{administrationSummary(row.administration)}</span>
              <span>
                {sessionsCiting(row, sessions).length
                  ? `${sessionsCiting(row, sessions).length} session(s)`
                  : "Unused"}
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
              Student model: {labelOf(competencyModels, row.competencyModelId) || "none"}. Assembly
              model: {labelOf(assemblyModels, row.assemblyModelId) || "none"}. Policy:{" "}
              {labelOf(policies, row.policyId) || "none"}. Presentation:{" "}
              {row.presentationModelId
                ? labelOf(presentationModels, row.presentationModelId)
                : "no override"}
              .
            </p>
            <p className="leading-relaxed text-slate-600">
              {administrationSummary(row.administration)}. {readinessText(row, lists)}.
            </p>
          </>
        )}
        renderActions={(row) => {
          const inUse = isDeliveryModelInUse(row, sessions);
          return (
            <>
              <button type="button" onClick={() => openEdit(row)} className={manageOpenButtonClass}>
                Edit
              </button>
              <button
                type="button"
                onClick={() => openDuplicate(row)}
                className={manageQuietButtonClass}
                title="Open the create form with this delivery model copied as a draft"
              >
                Duplicate
              </button>
              <button
                type="button"
                onClick={() => askDelete(row)}
                disabled={deleteMut.isPending || inUse}
                className={manageDangerButtonClass}
                title={inUse ? "Remove citations before deleting" : "Delete this delivery model"}
              >
                Delete
              </button>
            </>
          );
        }}
      />
      <Modal
        isOpen={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          if (isDeliveryModelInUse(pendingDelete, sessions)) {
            toast.error(deleteBlockedMessage(sessionsCiting(pendingDelete, sessions).length));
            setPendingDelete(null);
            return;
          }
          try {
            await deleteMut.mutateAsync(pendingDelete.id);
            toast.success("Delivery model deleted");
          } catch (err) {
            toast.error(apiErrorMessage(err, "Delete failed"));
          }
          setPendingDelete(null);
        }}
        title="Delete Delivery Model"
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

export default function DeliveryModelBuilder() {
  const [searchParams] = useSearchParams();
  const focusId = recordFocus(searchParams);
  const [mode, setMode] = useState(focusId ? "manage" : "dashboard");

  useEffect(() => {
    if (focusId) setMode("manage");
  }, [focusId]);

  return (
    <ModelTabShell
      mode={mode}
      onModeChange={setMode}
      tabs={[
        { id: "dashboard", label: "Dashboard", panel: <DeliveryModelDashboard /> },
        { id: "structure", label: "Delivery Structure", panel: <DeliveryModelTable /> },
        { id: "manage", label: "Manage Delivery Models", panel: <DeliveryModelManage /> },
      ]}
    />
  );
}
