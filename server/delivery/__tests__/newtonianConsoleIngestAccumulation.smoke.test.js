// server/delivery/__tests__/newtonianConsoleIngestAccumulation.smoke.test.js
//
// EM-R2 exit check: Newtonian Theta 2PL receives a *console-ingest*
// converged parameter set (calibrationMethod r-job / packageVersion ≠
// ecd-pilot), and Accumulation consumes that set — not attach-seed alone.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { accumulateEvidence } from "../evidenceAccumulation.js";
import { ingestCalibrationJob } from "../../r/calibrationIngest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packPath = join(
  __dirname,
  "../../../samples/newtonian_mechanics_evidence_models_confirm_ready.json"
);

const CONSOLE_PACKAGE = "mirt-2pl-console-1.0.0";

describe("Newtonian console ingest — Accumulation smoke (EM-R2)", () => {
  it("ingests a converged irt-parameters job onto Theta 2PL and accumulates from that set", () => {
    const pack = JSON.parse(readFileSync(packPath, "utf8"));
    const emSrc = pack.evidenceModels.find((e) =>
      String(e.name || "").includes("Newtonian Proficiency Theta")
    );
    expect(emSrc).toBeTruthy();

    const smSrc = (emSrc.statisticalModels || []).find((s) => s.active && s.type === "irt");
    expect(smSrc?.id).toBe("sm_theta_2pl");
    const obsIds = smSrc.structureConfig?.observableIds || [];
    expect(obsIds.length).toBeGreaterThanOrEqual(2);

    // Simulate confirm-ready EM *before* console ingest: no live parameterSets
    // (attach-seed remains a draft bridge only). Keep fields ingest validation
    // requires on a confirmed EM.
    const em = {
      id: "em-theta-newt",
      name: emSrc.name,
      competencyId: "c_theta",
      competencyModelId: emSrc.competencyModelId || "cm-newt",
      competencyModelVersion: emSrc.competencyModelVersion || 1,
      versionNumber: 1,
      status: "confirmed",
      fairnessNotes: emSrc.fairnessNotes || "Console-ingest smoke fairness notes for Newtonian Theta (EM-R2).",
      difReviewChecklist: emSrc.difReviewChecklist || [
        { id: "d1", prompt: "Gender DIF reviewed?", status: "pass", note: "ok" },
        { id: "d2", prompt: "Language load reviewed?", status: "pass", note: "ok" },
        { id: "d3", prompt: "Access reviewed?", status: "na", note: "n/a" },
      ],
      decisionRule: emSrc.decisionRule || {
        type: "score_band",
        threshold: 0,
        direction: "above",
        justification: "Theta EAP above zero supports higher proficiency.",
      },
      observables: (emSrc.observables || []).map((o) => ({
        id: o.id,
        evidenceRule: o.evidenceRule || { direction: "supports", strengthLevel: 4 },
      })),
      evaluationProcedures: emSrc.evaluationProcedures || [],
      evidenceRules: emSrc.evidenceRules || [],
      statisticalModels: [
        {
          ...smSrc,
          parameterSets: [],
          activeParameterSetId: null,
        },
      ],
    };

    const db = {
      competencyModels: [
        {
          id: "cm-newt",
          versionNumber: 1,
          smVariables: [
            {
              id: "c_theta",
              label: "Newtonian Proficiency Theta",
              type: "continuous",
              scale: { min: -4, max: 4 },
              priorDistribution: { family: "normal", params: { mean: 0, sd: 1 } },
            },
          ],
        },
      ],
      competencies: [{ id: "c_theta", modelId: "cm-newt", name: "Newtonian Proficiency Theta" }],
      evidenceModels: [em],
    };

    const parameters = Object.fromEntries(
      obsIds.map((id, i) => [id, { a: 1.2 + i * 0.05, b: -0.4 + i * 0.25 }])
    );

    const job = {
      id: "job-newt-theta-console",
      kind: "irt-parameters",
      status: "succeeded",
      evidenceModelId: em.id,
      statisticalModelId: smSrc.id,
      requestedBy: "admin1",
      ingestedParameterSetId: null,
      ingestedAnalysisArtefactId: null,
      response: {
        contractVersion: "1.0",
        jobId: "job-newt-theta-console",
        converged: true,
        packageVersion: CONSOLE_PACKAGE,
        sampleSize: 480,
        calibratedAt: "2026-09-16T12:00:00.000Z",
        parameters,
      },
    };

    const ingest = ingestCalibrationJob(job, db, {
      parameterSetId: "ps_console_sm_theta_2pl",
      calibratedBy: "calibration-console",
    });
    expect(ingest.ok).toBe(true);
    expect(ingest.parameterSet?.packageVersion).toBe(CONSOLE_PACKAGE);
    expect(ingest.parameterSet?.packageVersion).not.toBe("ecd-pilot-1.0.0");
    expect(ingest.parameterSet?.calibrationMethod).toBe("r-job");
    expect(em.statisticalModels[0].activeParameterSetId).toBe("ps_console_sm_theta_2pl");
    expect(em.statisticalModels[0].parameterSets).toHaveLength(1);

    const o1 = obsIds[0];
    const session = {
      id: "s-newt-console",
      status: "in_progress",
      responses: [
        {
          taskId: "t1",
          itemId: "item-theta-1",
          evidenceModelId: em.id,
          parameterSetId: "ps_console_sm_theta_2pl",
          observationId: o1,
          observableId: o1,
          activated: true,
          direction: "supports",
          strength: 4,
        },
      ],
    };

    const { posteriors, warnings } = accumulateEvidence(session, db);
    expect(warnings || []).toEqual([]);
    expect(posteriors?.length || Object.keys(posteriors || {}).length).toBeGreaterThan(0);
  });

  it("documents Force DINA: Q-matrix must be confirmed before EM confirm (README gate)", () => {
    const readme = readFileSync(
      join(__dirname, "../../../samples/README.md"),
      "utf8"
    );
    expect(readme).toMatch(/Force.*Q-matrix.*confirm/i);
    expect(readme).toMatch(/attach-seed-parameter-sets/);
    expect(readme).toMatch(/Calibration console|ingest/i);
  });
});
