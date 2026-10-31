// src/components/itemBank/ItemWizard/steps/Step8Review.jsx
// ------------------------------------------------------------
// Step 8 — Review & Confirm
//
// ONE confirmation gate. There used to be three, and they disagreed:
//
//   Step9_Review     confirmed on `!hasErrors` alone — no simulation, no
//                    acknowledgement.
//   Step10_Confirm   required a passing simulation AND an acknowledgement
//                    checkbox AND `!hasErrors`.
//   ItemWizard's nav required neither, just `canConfirm`.
//
// Three paths to one irreversible transition is three chances for the
// weakest one to be the one an author happens to click. The nav bar's
// Confirm button now routes through the same preconditions this step
// states, and this step is where they are stated.
//
// The readiness list is itemReadiness() — the SAME function the step
// gating uses and the same rules src/utils/schema.js enforces at the
// write. A disabled Confirm names the failing check and the step that
// fixes it, rather than reporting that something, somewhere, is wrong.
// ------------------------------------------------------------

import React, { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Circle,
  ArrowRight,
  Lock,
  ShieldAlert,
} from "lucide-react";
import { useItemWizard } from "../ItemWizardContext";
import {
  ITEM_WIZARD_STEPS,
  ITEM_WIZARD_STEP_KEYS,
  interactionLabel,
  scoringLabel,
  versionLabel,
} from "../../itemConstants";
import { itemFeedbackSummary } from "@/utils/itemFeedback";

function Row({ label, value, mono = false }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
      <span className="shrink-0 font-medium text-slate-900">{label}:</span>
      <span className={`break-words text-slate-700 ${mono ? "font-mono text-[13px]" : ""}`}>
        {value ?? "—"}
      </span>
    </div>
  );
}

export default function Step8Review() {
  const {
    item,
    ctx,
    readiness,
    failing,
    isReady,
    compatibilityNotes,
    blocking,
    operationalChecks,
    goToStep,
    simulate,
    transitionLifecycle,
    canConfirm,
    canSendToReview,
    isLocked,
    isDirty,
    saveDraft,
  } = useItemWizard();

  const [preflight, setPreflight] = useState(null);
  const [running, setRunning] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const stepIndexFor = (key) => ITEM_WIZARD_STEP_KEYS.indexOf(key);
  const stepLabelFor = (key) =>
    ITEM_WIZARD_STEPS.find((s) => s.key === key)?.label || key;

  const runPreflight = async () => {
    setRunning(true);
    setError(null);

    // Preflight reads the PERSISTED record, so unsaved edits would be
    // checked against a stale copy. Save first rather than reporting on
    // something the author is no longer looking at.
    if (isDirty && !isLocked) {
      const saved = await saveDraft();
      if (!saved.success) {
        setRunning(false);
        return;
      }
    }

    const result = await simulate();
    setPreflight(result.success ? result.data : null);
    if (!result.success) setError(result.error);
    setRunning(false);
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);

    if (isDirty) {
      const saved = await saveDraft();
      if (!saved.success) {
        setBusy(false);
        return;
      }
    }

    const result = await transitionLifecycle("confirmed");
    if (!result.success) setError(result.error);
    setBusy(false);
  };

  const sendToReview = async () => {
    setBusy(true);
    setError(null);

    if (isDirty) {
      const saved = await saveDraft();
      if (!saved.success) {
        setBusy(false);
        return;
      }
    }

    const result = await transitionLifecycle("reviewed");
    if (!result.success) setError(result.error);
    setBusy(false);
  };

  const pending = compatibilityNotes.filter((n) => n.severity === "pending");

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Review &amp; Confirm</h2>
        <p className="mt-1 text-sm text-slate-500">
          Confirmation freezes this item's structure. Everything below is the
          same set of rules the server applies at the write — nothing new is
          checked after you click.
        </p>
      </div>

      {/* --- Readiness --- */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Readiness</h3>
          <span
            className={`text-sm font-medium ${
              isReady ? "text-emerald-600" : "text-amber-600"
            }`}
          >
            {readiness.filter((c) => c.ok).length} of {readiness.length} complete
          </span>
        </div>

        <ul className="mt-4 space-y-2.5">
          {readiness.map((check) => (
            <li key={check.id} className="flex items-start gap-3">
              {check.ok ? (
                <CheckCircle2
                  size={16}
                  strokeWidth={2.25}
                  className="mt-0.5 shrink-0 text-emerald-600"
                />
              ) : (
                <Circle
                  size={16}
                  strokeWidth={2.25}
                  className="mt-0.5 shrink-0 text-slate-300"
                />
              )}

              <div className="min-w-0 flex-1">
                <div
                  className={`text-sm ${
                    check.ok ? "text-slate-600" : "font-medium text-slate-900"
                  }`}
                >
                  {check.label}
                </div>

                {!check.ok && check.detail && (
                  <div className="mt-0.5 text-xs text-slate-500">{check.detail}</div>
                )}
              </div>

              {!check.ok && (
                <button
                  type="button"
                  onClick={() => goToStep(stepIndexFor(check.step))}
                  className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  {stepLabelFor(check.step)}
                  <ArrowRight size={12} strokeWidth={2.25} />
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* --- Coherence --- */}
      {(blocking.length > 0 || pending.length > 0) && (
        <section className="space-y-3">
          {blocking.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-red-700">
                <AlertCircle size={16} strokeWidth={2.25} />
                Will fail confirmation
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-700">
                {blocking.map((n, i) => (
                  <li key={i}>{n.message}</li>
                ))}
              </ul>
            </div>
          )}

          {pending.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-amber-800">
                <AlertTriangle size={16} strokeWidth={2.25} />
                Worth resolving
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">
                {pending.map((n, i) => (
                  <li key={i}>{n.message}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* --- Structural summary --- */}
      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Summary</h3>

        <div className="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">
          <Row
            label="Task Model"
            value={`${ctx.taskModel?.name || item.taskModelId || "—"} · ${versionLabel(
              item.taskModelVersion
            )}`}
          />
          <Row
            label="Evidence Model"
            value={`${ctx.evidenceModel?.name || item.evidenceModelId || "—"} · ${versionLabel(
              item.evidenceModelVersion
            )}`}
          />
          <Row label="Observable" value={ctx.observable?.statement} />
          <Row label="Response mode" value={ctx.observable?.type} mono />
          <Row
            label="Interaction"
            value={
              item.interaction?.type
                ? `${interactionLabel(item.interaction.type)} · ${
                    item.interaction.responseComponents?.length || 0
                  } component(s)`
                : "—"
            }
          />
          <Row
            label="Scoring"
            value={
              item.scoring?.method
                ? `${scoringLabel(item.scoring.method)} · max ${
                    item.scoring.maxScore ?? "—"
                  } · ${item.scoring.evidenceActivationMap?.length || 0} rule(s)`
                : "—"
            }
          />
          <Row label="Learner feedback" value={itemFeedbackSummary(item.feedback)} />
          <Row
            label="Stimulus"
            value={`${item.stimulus?.layout || "single"} · ${
              item.stimulus?.blocks?.length || 0
            } block(s)`}
          />
          <Row
            label="Cognitive demand"
            value={
              [
                item.cognitiveDemand?.bloomLevel,
                item.cognitiveDemand?.soloLevel,
                item.cognitiveDemand?.reasoningType,
              ]
                .filter(Boolean)
                .join(" · ") || "—"
            }
          />
          <Row
            label="Placement"
            value={
              [item.metadata?.subject, item.metadata?.grade, item.metadata?.topic]
                .filter(Boolean)
                .join(" · ") || "—"
            }
          />
          <Row
            label="Intended difficulty"
            value={item.metadata?.difficulty || "—"}
          />
          <Row label="Equivalence group" value={item.equivalenceGroupId} mono />
          <Row
            label="Status"
            value={`${item.status} · ${versionLabel(item.versionNumber)} · ${
              item.locked ? "locked" : "editable"
            }`}
          />
        </div>
      </section>

      {/* --- Operational prerequisites --- */}
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">
          Before this item can be activated
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Not required to confirm. Confirmation freezes the design; activation
          puts it into delivery.
        </p>

        <ul className="mt-3 space-y-2">
          {operationalChecks.map((check) => (
            <li key={check.id} className="flex items-start gap-3">
              {check.ok ? (
                <CheckCircle2
                  size={16}
                  strokeWidth={2.25}
                  className="mt-0.5 shrink-0 text-emerald-600"
                />
              ) : (
                <Circle
                  size={16}
                  strokeWidth={2.25}
                  className="mt-0.5 shrink-0 text-slate-300"
                />
              )}
              <div>
                <div className="text-sm text-slate-700">{check.label}</div>
                {!check.ok && check.detail && (
                  <div className="mt-0.5 text-xs text-slate-500">{check.detail}</div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* --- Preflight --- */}
      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Server preflight</h3>
            <p className="mt-1 text-xs text-slate-500">
              Asks the server what confirming this item would say, using the
              same validators the transition runs. A green preflight and a red
              confirm can no longer disagree.
            </p>
          </div>

          <button
            type="button"
            onClick={runPreflight}
            disabled={running || !item.id}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            {running ? "Checking…" : "Run preflight"}
          </button>
        </div>

        {!item.id && (
          <p className="text-xs text-slate-500">
            Save the item first — preflight reads the persisted record.
          </p>
        )}

        {preflight && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              preflight.valid
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            <div className="font-medium">
              {preflight.valid
                ? "The server would accept this confirmation."
                : `The server would reject this confirmation (${preflight.errors.length} problem${
                    preflight.errors.length === 1 ? "" : "s"
                  }).`}
            </div>

            {preflight.errors?.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {preflight.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* --- Actions --- */}
      {isLocked ? (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-sm text-emerald-800">
          <Lock size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
          This item is {item.status} and locked. Structural changes require a
          clone; lifecycle actions are in the bar above.
        </div>
      ) : (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          {canSendToReview && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Sending this item to review hands it to a reviewer. It stays
                editable until they confirm it.
              </p>
              <button
                type="button"
                onClick={sendToReview}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                {busy ? "Working…" : "Send to review"}
              </button>
            </div>
          )}

          {canConfirm && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-800">
                <ShieldAlert size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <div className="font-semibold">Confirmation is irreversible.</div>
                  <ul className="list-disc pl-5">
                    <li>Structural bindings, stimulus, interaction and scoring freeze.</li>
                    <li>Revisions require a clone, which starts a new version.</li>
                    <li>
                      Any Task Model waiting on a confirmed item becomes
                      activatable.
                    </li>
                  </ul>
                </div>
              </div>

              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-slate-900"
                />
                I have reviewed this item and understand that confirming it locks
                its structure.
              </label>

              <button
                type="button"
                onClick={confirm}
                disabled={busy || !isReady || blocking.length > 0 || !acknowledged}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                {busy ? "Confirming…" : "Confirm & lock"}
              </button>

              {(failing.length > 0 || blocking.length > 0) && (
                <p className="text-xs text-slate-500">
                  Blocked by{" "}
                  {failing.length > 0 && (
                    <>
                      {failing.length} incomplete check
                      {failing.length === 1 ? "" : "s"}
                    </>
                  )}
                  {failing.length > 0 && blocking.length > 0 && " and "}
                  {blocking.length > 0 && (
                    <>
                      {blocking.length} coherence problem
                      {blocking.length === 1 ? "" : "s"}
                    </>
                  )}
                  , listed above.
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
