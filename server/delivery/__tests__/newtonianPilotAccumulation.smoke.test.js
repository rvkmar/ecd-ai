// server/delivery/__tests__/newtonianPilotAccumulation.smoke.test.js
// G4 smoke: confirm-ready Newtonian theta EM seed params drive Accumulation.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { accumulateEvidence } from "../evidenceAccumulation.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packPath = join(
  __dirname,
  "../../../samples/newtonian_mechanics_evidence_models_confirm_ready.json"
);

describe("Newtonian pilot parameterSets — Accumulation smoke", () => {
  it("produces a continuous posterior from seeded 2PL parameters", () => {
    const pack = JSON.parse(readFileSync(packPath, "utf8"));
    const emSrc = pack.evidenceModels.find((e) =>
      String(e.name || "").includes("Newtonian Proficiency Theta")
    );
    expect(emSrc).toBeTruthy();

    const sm = (emSrc.statisticalModels || []).find((s) => s.active && s.type === "irt");
    expect(sm?.parameterSets?.length).toBeGreaterThan(0);
    const obsIds = sm.structureConfig?.observableIds || [];
    expect(obsIds.length).toBeGreaterThan(0);
    const o1 = obsIds[0];
    const ps = sm.parameterSets.find((p) => p.parameterSetId === sm.activeParameterSetId);
    expect(ps?.parameters?.[o1] || ps?.parameters).toBeTruthy();

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
      competencies: [{ id: "c_theta", modelId: "cm-newt" }],
      evidenceModels: [
        {
          id: "em-theta",
          competencyId: "c_theta",
          versionNumber: 1,
          observables: obsIds.map((id) => ({
            id,
            evidenceRule: { direction: "supports", strengthLevel: 4 },
          })),
          statisticalModels: [
            {
              ...sm,
              structureConfig: { ...(sm.structureConfig || {}), observableIds: obsIds },
            },
          ],
        },
      ],
    };

    const session = {
      id: "s1",
      status: "in_progress",
      responses: [
        {
          taskId: "t1",
          itemId: "item-theta-1",
          evidenceModelId: "em-theta",
          parameterSetId: sm.activeParameterSetId,
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
});
