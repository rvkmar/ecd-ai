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
import { useEnqueueCalibrationJob } from "@/api/queries/calibrationJobs";
import {
  namedCalibrationFixture,
  NAMED_CALIBRATION_FIXTURES,
  statisticalModelsForFixture,
} from "./calibrationConsoleUtils";

export default function EnqueueCalibrationForm({ onEnqueued }) {
  const { data: evidenceModels = [], isLoading } = useEvidenceModels();
  const enqueue = useEnqueueCalibrationJob();
  const [fixtureId, setFixtureId] = useState("lsat7");
  const [evidenceModelId, setEvidenceModelId] = useState("");
  const [statisticalModelId, setStatisticalModelId] = useState("");
  const [formError, setFormError] = useState(null);

  const fixture = namedCalibrationFixture(fixtureId);

  const bindableModels = useMemo(
    () =>
      (evidenceModels || []).filter(
        (em) => statisticalModelsForFixture(em, fixture.statisticalModelTypes).length > 0
      ),
    [evidenceModels, fixture.statisticalModelTypes]
  );

  const selectedModel = bindableModels.find((em) => em.id === evidenceModelId);
  const statisticalModels = statisticalModelsForFixture(
    selectedModel,
    fixture.statisticalModelTypes
  );

  function handleFixtureChange(nextId) {
    setFixtureId(nextId);
    setEvidenceModelId("");
    setStatisticalModelId("");
    setFormError(null);
  }

  function handleEvidenceChange(nextId) {
    setEvidenceModelId(nextId);
    const next = bindableModels.find((em) => em.id === nextId);
    const sms = statisticalModelsForFixture(next, fixture.statisticalModelTypes);
    setStatisticalModelId(sms[0]?.id || "");
    setFormError(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError(null);
    if (!evidenceModelId || !statisticalModelId) {
      setFormError(fixture.choosePrompt);
      return;
    }
    try {
      const job = await enqueue.mutateAsync({
        fixture: fixture.id,
        kind: fixture.kind,
        evidenceModelId,
        statisticalModelId,
      });
      toast.success(fixture.successToast);
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
        <p className="text-sm text-muted-foreground">{fixture.description}</p>
      </div>

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
          {fixture.emptyBind}
        </p>
      )}

      {formError && (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={enqueue.isPending || bindableModels.length === 0}>
          {enqueue.isPending ? "Enqueueing…" : fixture.buttonLabel}
        </Button>
        <p className="text-caption text-muted-foreground">
          Compose autorun starts queued jobs. If this environment does not
          autorun, use Process on the queued row.
        </p>
      </div>
    </form>
  );
}
