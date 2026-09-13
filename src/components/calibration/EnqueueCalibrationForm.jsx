// src/components/calibration/EnqueueCalibrationForm.jsx
// Admin-only start form. The only named fixture is LSAT7; the server
// expands the published 1000×5 matrix. This form binds evidenceModelId /
// statisticalModelId and does not invent item parameters.

import React, { useMemo, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { apiErrorMessage } from "@/api/apiClient";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import { useEnqueueCalibrationJob } from "@/api/queries/calibrationJobs";
import {
  LSAT7_JOB_KIND,
  statisticalModelsForLsat7,
} from "./calibrationConsoleUtils";

export default function EnqueueCalibrationForm({ onEnqueued }) {
  const { data: evidenceModels = [], isLoading } = useEvidenceModels();
  const enqueue = useEnqueueCalibrationJob();
  const [evidenceModelId, setEvidenceModelId] = useState("");
  const [statisticalModelId, setStatisticalModelId] = useState("");
  const [formError, setFormError] = useState(null);

  const bindableModels = useMemo(
    () =>
      (evidenceModels || []).filter((em) => statisticalModelsForLsat7(em).length > 0),
    [evidenceModels]
  );

  const selectedModel = bindableModels.find((em) => em.id === evidenceModelId);
  const statisticalModels = statisticalModelsForLsat7(selectedModel);

  function handleEvidenceChange(nextId) {
    setEvidenceModelId(nextId);
    const next = bindableModels.find((em) => em.id === nextId);
    const sms = statisticalModelsForLsat7(next);
    setStatisticalModelId(sms[0]?.id || "");
    setFormError(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError(null);
    if (!evidenceModelId || !statisticalModelId) {
      setFormError("Choose an evidence model and an IRT statistical model.");
      return;
    }
    try {
      const job = await enqueue.mutateAsync({
        fixture: "lsat7",
        kind: LSAT7_JOB_KIND,
        evidenceModelId,
        statisticalModelId,
      });
      toast.success("LSAT7 calibration job queued.");
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
          LSAT section 7 (Bock &amp; Lieberman 1970 / <code>mirt::LSAT7</code>): 1000
          examinees × 5 dichotomous items. The server fills the ADR 0002 request
          from the published fixture. This form does not invent item parameters.
        </p>
      </div>

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
          No evidence model has an IRT or Rasch statistical model to bind. Author
          one before enqueueing LSAT7.
        </p>
      )}

      {formError && (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={enqueue.isPending || bindableModels.length === 0}>
          {enqueue.isPending ? "Enqueueing…" : "Enqueue LSAT7"}
        </Button>
        <p className="text-caption text-muted-foreground">
          Compose autorun starts queued jobs. If this environment does not
          autorun, use Process on the queued row.
        </p>
      </div>
    </form>
  );
}
