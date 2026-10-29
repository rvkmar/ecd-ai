// src/components/itemBank/ItemWizard/steps/Step7Operations.jsx
// ------------------------------------------------------------
// Step 7 — Psychometrics & Exposure
//
// THIS STEP DID NOT EXIST, AND ITS ABSENCE MADE ACTIVATION IMPOSSIBLE.
//
// Promoting an item to `operational` requires `equivalenceGroupId` and
// `exposureControl.maxUsageBeforeRetire` — both enforced by
// src/utils/schema.js and by the lifecycle route. Neither had any
// authoring path anywhere in the wizard: ItemWizardContext's default item
// did not even carry `equivalenceGroupId`, so it was dropped on every
// save. Two components that would have authored them,
// ExposureControlPanel.jsx (213 lines) and PsychometricPanel.jsx (223
// lines), were written and never imported by anything — orphans, exactly
// like SubTaskSelector was on the Task Model side. Their concerns are
// folded in here rather than mounted as-is, because PsychometricPanel was
// built against useItemLifecycle.js, a third orphan that re-implemented
// mutations the wizard context already owns.
//
// Calibration is offered here for confirmed, operational and suspended
// items. The route used to require `status === "confirmed"` and then
// refuse operational and suspended ones on the next line — unreachable
// code guarding a state the first check had already excluded — with the
// effect that an operational item could never be calibrated. That is
// backwards: calibration is estimated from live response data, which only
// exists once the item is in service.
// ------------------------------------------------------------

import React, { useMemo, useState } from "react";
import {
  Lock,
  Info,
  AlertTriangle,
  CheckCircle2,
  Gauge,
} from "lucide-react";
import { useItemWizard } from "../ItemWizardContext";
import { CALIBRATION_STATUSES, labelFor, exposureBand } from "../../itemConstants";

const inputClasses =
  "w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed";

function NumberInput({ value, onChange, disabled, placeholder, min }) {
  return (
    <input
      type="number"
      min={min}
      step="any"
      disabled={disabled}
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") return onChange(null);
        const parsed = Number(raw);
        onChange(Number.isFinite(parsed) ? parsed : null);
      }}
      className={inputClasses}
    />
  );
}

export default function Step7Operations() {
  const {
    item,
    ctx,
    updateField,
    updateNestedField,
    mergeObject,
    canEdit,
    calibrate,
  } = useItemWizard();

  const psychometrics = item.psychometrics || {};
  const exposure = item.exposureControl || {};
  const activeModel = ctx.activeStatisticalModel;

  /* PILOT PARAMETERS vs CALIBRATION -- two different things that were
     conflated, with the result that no item could ever be confirmed.

     Every input in this section used to be `disabled` whenever the item
     was a draft, on the reasoning that "calibration applies to confirmed,
     operational and suspended items". True of CALIBRATION. But
     itemReadiness requires an IRT-scored item to carry `a` and `b` BEFORE
     it can be confirmed, and the readiness row linked back to this panel
     -- where the fields were disabled. A closed loop: a draft could never
     reach reviewed or confirmed through the UI at all. The panel's own
     help text claimed pilot values could be entered "on the Review step's
     readiness list", where no such affordance existed either.

     Worse, the fields were bound to LOCAL STATE and never written to the
     item, so even enabling them would not have satisfied readiness.

     They are separate concerns and are separated here:

       Pilot parameters  the author's starting estimate. Part of the item,
                         edited on the draft, saved by the ordinary
                         autosave. Required before confirmation.
       Calibration       an estimate from real response data, posted to
                         /api/items/:id/calibrate against a locked record.
                         Replaces the pilot values and takes ownership of
                         them.

     So the gate is on WHO OWNS THE NUMBERS, not on lifecycle status: once
     `calibrationStatus === "calibrated"`, real data owns them and hand
     editing is refused. Before that they are the author's to set. */

  const isParametric = ["irt", "rasch"].includes(activeModel?.type);
  const irtParams = psychometrics.irtParams || {};
  const isCalibrated = psychometrics.calibrationStatus === "calibrated";

  // Pilot values are authored on the draft. Locked records go through the
  // calibration endpoint instead -- the wizard cannot write to them.
  const canEditPilot = canEdit && isParametric && !isCalibrated;

  // D53b: the 'dina' analogue of isParametric/irtParams/canEditPilot above.
  // R8 also shows this panel for 'gdina': the author still enters slip and
  // guess; delivery expands them into a conjunctive table of length 2^m.
  // Authoring a saturated table by hand is still not this field's job.
  // There is also no DINA/G-DINA calibration submission endpoint yet
  // (that is the D65 calibration console's job, against the R service) --
  // so unlike IRT below, this section stops at the pilot estimate and
  // offers no "Calibration from response data" panel.
  const isDina = activeModel?.type === "dina" || activeModel?.type === "gdina";
  const isGdinaPilot = activeModel?.type === "gdina";
  const dinaParams = psychometrics.dinaParams || {};
  const canEditDinaPilot = canEdit && isDina && !isCalibrated;

  // Calibration needs a persisted, structurally frozen record: a draft's
  // structure can still change under the estimate.
  const canCalibrate =
    !!item.id &&
    isParametric &&
    ["confirmed", "operational", "suspended"].includes(item.status);

  const [calibrationForm, setCalibrationForm] = useState({
    a: irtParams.a ?? "",
    b: irtParams.b ?? "",
    c: irtParams.c ?? "",
    sampleSize: "",
    method: "manual",
  });
  const [calibrating, setCalibrating] = useState(false);

  const setPilot = (key) => (value) =>
    updateNestedField("psychometrics", "irtParams", {
      ...irtParams,
      // Rasch fixes discrimination at 1 by definition; storing anything
      // else would record a parameter the model does not use.
      ...(activeModel?.type === "rasch" ? { a: 1 } : {}),
      [key]: value,
    });

  const setDinaPilot = (key) => (value) =>
    updateNestedField("psychometrics", "dinaParams", {
      ...dinaParams,
      [key]: value,
    });


  const band = exposureBand(item);
  const blueprintCeiling = ctx.blueprint?.exposurePolicy?.maxUses || 0;

  const usagePercent = useMemo(() => {
    const ceiling = exposure.maxUsageBeforeRetire || 0;
    if (!ceiling) return null;
    return Math.min(100, Math.round(((exposure.usageCount || 0) / ceiling) * 100));
  }, [exposure]);

  const submitCalibration = async () => {
    setCalibrating(true);
    try {
      await calibrate({
        a: activeModel?.type === "rasch" ? 1 : Number(calibrationForm.a),
        b: Number(calibrationForm.b),
        c: calibrationForm.c === "" ? 0 : Number(calibrationForm.c),
        sampleSize:
          calibrationForm.sampleSize === ""
            ? 0
            : Number(calibrationForm.sampleSize),
        method: calibrationForm.method,
      });
    } finally {
      setCalibrating(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Psychometrics &amp; Exposure
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          What the scoring engine needs from this item, and the operational
          governance it needs before it can go into service.
        </p>
      </div>

      {/* --- Statistical model --- */}
      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Statistical model</h3>

        {activeModel ? (
          <>
            <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <Info size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
              <span>
                This item uses the Evidence Model&apos;s active model,{" "}
                <strong className="font-semibold">{activeModel.type}</strong>
                {activeModel.subtype ? ` (${activeModel.subtype})` : ""}. Saving
                copies that type onto the item.
              </span>
            </div>

            <div className="text-sm text-slate-700">
              <span className="font-medium text-slate-900">Statistical model:</span>{" "}
              {activeModel.type}
              {psychometrics.statisticalModelType === activeModel.type && (
                <CheckCircle2
                  size={14}
                  strokeWidth={2.25}
                  className="ml-1.5 inline text-emerald-600"
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
            No active statistical model on the Evidence Model, so nothing can be
            declared here.
          </div>
        )}
      </section>

      {/* --- Item parameters --- */}
      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Item parameters</h3>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            {labelFor(CALIBRATION_STATUSES, psychometrics.calibrationStatus)}
          </span>
        </div>

        {!isParametric && (
          <p className="text-sm text-slate-500">
            A{" "}
            <span className="font-medium text-slate-700">
              {activeModel?.type || "non-parametric"}
            </span>{" "}
            model does not take item parameters. Nothing to enter — and
            writing IRT parameters here would make the record permanently
            invalid.
          </p>
        )}

        {isParametric && (
          <>
            <p className="text-sm text-slate-600">
              {isCalibrated
                ? "These parameters were estimated from real response data. They are owned by the calibration and cannot be hand-edited — recalibrate to change them."
                : "Enter the pilot estimate this item starts life with. An IRT-scored item needs at least discrimination (a) and difficulty (b) before it can be confirmed; calibration replaces these once real responses exist."}
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  a (discrimination)
                </label>
                <NumberInput
                  value={activeModel.type === "rasch" ? 1 : irtParams.a}
                  disabled={!canEditPilot || activeModel.type === "rasch"}
                  onChange={setPilot("a")}
                  placeholder="1.0"
                />
                {activeModel.type === "rasch" && (
                  <p className="mt-1.5 text-xs text-slate-500">
                    Fixed at 1 by definition under Rasch.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  b (difficulty)
                </label>
                <NumberInput
                  value={irtParams.b}
                  disabled={!canEditPilot}
                  onChange={setPilot("b")}
                  placeholder="0.0"
                />
                <p className="mt-1.5 text-xs text-slate-500">In logits.</p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  c (guessing)
                </label>
                <NumberInput
                  value={irtParams.c}
                  disabled={!canEditPilot}
                  onChange={setPilot("c")}
                  min={0}
                  placeholder="0.0"
                />
              </div>
            </div>

            {isCalibrated && canEdit && (
              <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                <Info size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
                Calibrated values are read-only here. Recalibrate below, or clone
                the item to start again from a pilot estimate.
              </div>
            )}

            {irtParams.calibratedAt && (
              <p className="text-xs text-slate-500">
                Last calibrated{" "}
                {new Date(irtParams.calibratedAt).toLocaleString()} by{" "}
                {irtParams.calibratedBy || "unknown"} (
                {irtParams.method || "manual"}, n={irtParams.sampleSize ?? 0}).
              </p>
            )}
          </>
        )}
      </section>

      {/* --- DINA / G-DINA pilot parameters (D53b / R8) --- */}
      {isDina && (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">
              {isGdinaPilot ? "G-DINA pilot parameters" : "DINA pilot parameters"}
            </h3>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              {labelFor(CALIBRATION_STATUSES, psychometrics.calibrationStatus)}
            </span>
          </div>

          <p className="text-sm text-slate-600">
            {isCalibrated
              ? "These parameters were estimated from real response data. They are owned by the calibration and cannot be hand-edited here."
              : isGdinaPilot
                ? "Enter the pilot slip/guess estimate this item starts life with. Delivery expands them into a conjunctive G-DINA table of length 2^m from the item's Q-vector (every pattern except full mastery uses guess). A G-DINA-scored item needs both, each in [0,1) with guess < 1 - slip, before it can be confirmed."
                : "Enter the pilot slip/guess estimate this item starts life with. A DINA-scored item needs both, each in [0,1) with guess < 1 - slip, before it can be confirmed."}
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                slip
              </label>
              <NumberInput
                value={dinaParams.slip}
                disabled={!canEditDinaPilot}
                onChange={setDinaPilot("slip")}
                min={0}
                placeholder="0.10"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                P(incorrect | has every required attribute).
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                guess
              </label>
              <NumberInput
                value={dinaParams.guess}
                disabled={!canEditDinaPilot}
                onChange={setDinaPilot("guess")}
                min={0}
                placeholder="0.20"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                P(correct | missing a required attribute).
              </p>
            </div>
          </div>

          {isCalibrated && canEdit && (
            <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <Info size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
              Calibrated values are read-only here. Clone the item to start
              again from a pilot estimate.
            </div>
          )}

          <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <Lock size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
            <span>
              There is no calibration-from-response-data submission for DINA
              or G-DINA yet — that is the calibration console's job. Pilot
              values are hand-entered here and used to score sessions until
              a real calibrated parameter set is ingested.
            </span>
          </div>
        </section>
      )}

      {/* --- Calibration --- */}
      {isParametric && (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800">
            Calibration from response data
          </h3>

          {!canCalibrate ? (
            <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <Lock size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
              <span>
                Available once the item is confirmed. A draft's structure can
                still change under the estimate, so calibrating one would date
                the moment it was edited. Use the pilot estimate above until
                then.
              </span>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Replaces the parameters above with an estimate from real
                responses. Recording a sample size marks the item calibrated;
                leaving it at zero records the values as a pilot.
              </p>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                {[
                  { key: "a", label: "a (discrimination)", disabled: activeModel.type === "rasch" },
                  { key: "b", label: "b (difficulty)" },
                  { key: "c", label: "c (guessing)" },
                  { key: "sampleSize", label: "Sample size" },
                ].map((f) => (
                  <div key={f.key}>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      {f.label}
                    </label>
                    <input
                      type="number"
                      step="any"
                      disabled={f.disabled}
                      value={
                        f.disabled ? 1 : calibrationForm[f.key] ?? ""
                      }
                      onChange={(e) =>
                        setCalibrationForm((prev) => ({
                          ...prev,
                          [f.key]: e.target.value,
                        }))
                      }
                      className={inputClasses}
                    />
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={submitCalibration}
                disabled={calibrating || calibrationForm.b === ""}
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                <Gauge size={15} strokeWidth={2.25} />
                {calibrating ? "Saving…" : "Save calibration"}
              </button>
            </>
          )}
        </section>
      )}


      {/* --- Equivalence group --- */}
      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Equivalence group</h3>
        <p className="text-xs text-slate-500">
          Items in a group are interchangeable at delivery. This is what lets an
          over-exposed or retired item be replaced without changing what the
          form measures — which is why it is required before activation.
          Grouping compares these strings literally, so copy an existing group
          id exactly.
        </p>

        <input
          type="text"
          disabled={!canEdit}
          value={item.equivalenceGroupId || ""}
          onChange={(e) => updateField("equivalenceGroupId", e.target.value)}
          placeholder="multistep-linear-equation-v1"
          className={`${inputClasses} font-mono`}
        />
      </section>

      {/* --- Exposure --- */}
      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Exposure control</h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Retire after (deliveries)
            </label>
            <NumberInput
              min={0}
              value={exposure.maxUsageBeforeRetire}
              disabled={!canEdit}
              onChange={(v) =>
                mergeObject("exposureControl", { maxUsageBeforeRetire: v ?? 0 })
              }
              placeholder="0 = unbounded"
            />

            {/* Seeded from the blueprint when the Task Model is bound; this
                is the recovery path for items created before that, and for
                a ceiling the author cleared. The value is shown rather than
                described, so a disagreement between the blueprint and what
                is stored here is visible instead of implied. */}
            {canEdit &&
              blueprintCeiling > 0 &&
              exposure.maxUsageBeforeRetire !== blueprintCeiling && (
                <button
                  type="button"
                  onClick={() =>
                    mergeObject("exposureControl", {
                      maxUsageBeforeRetire: blueprintCeiling,
                    })
                  }
                  className="mt-1.5 text-xs font-medium text-blue-600 transition hover:underline"
                >
                  Use the blueprint's ceiling of {blueprintCeiling}
                </button>
              )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Maximum reactivations
            </label>
            <NumberInput
              min={0}
              value={exposure.maxReactivations}
              disabled={!canEdit}
              onChange={(v) =>
                mergeObject("exposureControl", { maxReactivations: v ?? 0 })
              }
              placeholder="0 = unlimited"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              How many times a suspended item may be returned to service before
              it must be cloned instead.
            </p>
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-900">Current exposure</span>
            <span className="text-slate-600">
              {exposure.usageCount || 0}
              {exposure.maxUsageBeforeRetire
                ? ` / ${exposure.maxUsageBeforeRetire}`
                : " (no ceiling)"}
              {exposure.reactivationCount
                ? ` · ${exposure.reactivationCount} reactivation(s)`
                : ""}
            </span>
          </div>

          {usagePercent !== null && (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full transition-all ${
                  band === "exhausted"
                    ? "bg-red-500"
                    : band === "nearing"
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                }`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
          )}

          {/* Honest about the state of the integration rather than
              presenting a permanently-zero counter as a measurement. */}
          <p className="mt-2 text-xs text-slate-500">
            Deliveries are recorded through{" "}
            <code className="font-mono">POST /api/items/:id/record-usage</code>,
            which auto-suspends the item on exhaustion. Session delivery still
            runs on the legacy <code className="font-mono">questions</code>{" "}
            collection and does not yet call it, so this counter only moves for
            items reported explicitly.
          </p>
        </div>
      </section>
    </div>
  );
}
