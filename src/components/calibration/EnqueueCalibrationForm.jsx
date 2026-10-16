// src/components/calibration/EnqueueCalibrationForm.jsx
// Admin-only start form. Named fixtures are LSAT7 (IRT), sim10GDINA
// (DINA/G-DINA), LSAT7 CTT, and planted DIF. The server expands the
// published or seeded matrix (and Q). This form binds evidenceModelId /
// statisticalModelId and does not invent item parameters.

import React, { useMemo, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { apiErrorMessage } from "@/api/apiClient";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import {
  useEnqueueCalibrationJob,
  useSessionItemAnalysisPreview,
} from "@/api/queries/calibrationJobs";
import {
  namedCalibrationFixture,
  NAMED_CALIBRATION_FIXTURES,
  LSAT7_ITEM_ANALYSIS_JOB_KIND,
  LSAT7_ITEM_ANALYSIS_STATISTICAL_MODEL_TYPES,
  statisticalModelsForFixture,
} from "./calibrationConsoleUtils";

export default function EnqueueCalibrationForm({ onEnqueued }) {
  const { data: evidenceModels = [], isLoading } = useEvidenceModels();
  const enqueue = useEnqueueCalibrationJob();
  const [source, setSource] = useState("fixture");
  const [fixtureId, setFixtureId] = useState("lsat7");
  const [evidenceModelId, setEvidenceModelId] = useState("");
  const [statisticalModelId, setStatisticalModelId] = useState("");
  const [formError, setFormError] = useState(null);

  const fromSessions = source === "sessions";
  const fixture = namedCalibrationFixture(fixtureId);
  const bindTypes = fromSessions
    ? LSAT7_ITEM_ANALYSIS_STATISTICAL_MODEL_TYPES
    : fixture.statisticalModelTypes;
  const preview = useSessionItemAnalysisPreview(evidenceModelId, { enabled: fromSessions });

  const bindableModels = useMemo(
    () =>
      (evidenceModels || []).filter(
        (em) => statisticalModelsForFixture(em, bindTypes).length > 0
      ),
    [evidenceModels, bindTypes]
  );

  const selectedModel = bindableModels.find((em) => em.id === evidenceModelId);
  const statisticalModels = statisticalModelsForFixture(selectedModel, bindTypes);
  const sessionReady = fromSessions && preview.data?.ok === true;

  function handleSourceChange(next) {
    setSource(next);
    setEvidenceModelId("");
    setStatisticalModelId("");
    setFormError(null);
  }

  function handleFixtureChange(nextId) {
    setFixtureId(nextId);
    setEvidenceModelId("");
    setStatisticalModelId("");
    setFormError(null);
  }

  function handleEvidenceChange(nextId) {
    setEvidenceModelId(nextId);
    const next = bindableModels.find((em) => em.id === nextId);
    const sms = statisticalModelsForFixture(next, bindTypes);
    setStatisticalModelId(sms[0]?.id || "");
    setFormError(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError(null);
    if (!evidenceModelId || !statisticalModelId) {
      setFormError(
        fromSessions
          ? "Choose an evidence model and a CTT, IRT, or Rasch statistical model."
          : fixture.choosePrompt
      );
      return;
    }
    if (fromSessions && !sessionReady) {
      setFormError(preview.data?.message || "Completed sessions are not ready for item analysis.");
      return;
    }
    try {
      const job = await enqueue.mutateAsync(
        fromSessions
          ? {
              source: "sessions",
              kind: LSAT7_ITEM_ANALYSIS_JOB_KIND,
              evidenceModelId,
              statisticalModelId,
            }
          : {
              fixture: fixture.id,
              kind: fixture.kind,
              evidenceModelId,
              statisticalModelId,
            }
      );
      toast.success(fromSessions ? "Session item-analysis job queued." : fixture.successToast);
      onEnqueued?.(job);
    } catch (err) {
      const message = apiErrorMessage(err, "Could not enqueue the calibration job.");
      setFormError(message);
      toast.error(message);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading evidence models…</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-label="Enqueue calibration job">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Start a calibration</h2>
        <p className="text-sm text-muted-foreground">
          {fromSessions
            ? "Item analysis uses completed session responses for the evidence model you choose. Sample size is the number of students with a scored response. LSAT7 stays a published fixture."
            : fixture.description}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="calibration-source">Response source</Label>
        <select
          id="calibration-source"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm md:max-w-sm"
          value={source}
          onChange={(e) => handleSourceChange(e.target.value)}
        >
          <option value="fixture">Published fixture</option>
          <option value="sessions">Completed sessions</option>
        </select>
      </div>

      {!fromSessions && (
      <div className="space-y-2">
        <Label htmlFor="calibration-fixture">Published fixture</Label>
        <select
          id="calibration-fixture"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm md:max-w-sm"
          value={fixtureId}
          onChange={(e) => handleFixtureChange(e.target.value)}
        >
          {NAMED_CALIBRATION_FIXTURES.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="calibration-evidence-model">Evidence model</Label>
          <select
            id="calibration-evidence-model"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            value={evidenceModelId}
            onChange={(e) => handleEvidenceChange(e.target.value)}
          >
            <option value="">Select an evidence model</option>
            {bindableModels.map((em) => (
              <option key={em.id} value={em.id}>
                {em.name || em.id}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="calibration-statistical-model">Statistical model</Label>
          <select
            id="calibration-statistical-model"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            value={statisticalModelId}
            onChange={(e) => setStatisticalModelId(e.target.value)}
            disabled={!evidenceModelId}
          >
            <option value="">
              {evidenceModelId ? "Select a statistical model" : "Choose an evidence model first"}
            </option>
            {statisticalModels.map((sm) => (
              <option key={sm.id} value={sm.id}>
                {sm.id}
                {sm.type ? ` (${sm.type}${sm.subtype ? ` / ${sm.subtype}` : ""})` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {bindableModels.length === 0 && (
        <p className="text-sm text-muted-foreground" role="status">
          {fromSessions
            ? "No evidence model has a CTT, IRT, or Rasch statistical model to bind."
            : fixture.emptyBind}
        </p>
      )}

      {fromSessions && evidenceModelId && preview.data && (
        <div className="space-y-1 text-sm" role="status">
          <p>
            Sample size: <strong>{preview.data.sampleSize ?? 0}</strong>
          </p>
          {Array.isArray(preview.data.studentIds) && preview.data.studentIds.length > 0 && (
            <p>Students: {preview.data.studentIds.join(", ")}</p>
          )}
          {preview.data.message && <p className="text-destructive">{preview.data.message}</p>}
        </div>
      )}

      {formError && (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          disabled={
            enqueue.isPending ||
            bindableModels.length === 0 ||
            (fromSessions && !sessionReady)
          }
        >
          {enqueue.isPending
            ? "Enqueueing…"
            : fromSessions
              ? "Enqueue session item analysis"
              : fixture.buttonLabel}
        </Button>
        <p className="text-caption text-muted-foreground">
          Compose autorun starts queued jobs. If this environment does not
          autorun, use Process on the queued row.
        </p>
      </div>
    </form>
  );
}
