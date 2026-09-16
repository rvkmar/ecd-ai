// src/utils/__tests__/newtonianForceAttributeSplit.test.js
// EM-R3: multi-column Force Q-matrix over binary attributes; DINA refuses continuous.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { validateEntity } from "../schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const samples = join(__dirname, "../../../samples");

function loadJson(name) {
  return JSON.parse(readFileSync(join(samples, name), "utf8"));
}

describe("EM-R3 Newtonian Force attribute split", () => {
  it("competency model declares three binary Force attributes", () => {
    const [cm] = loadJson("newtonian_mechanics_competency_model.json");
    const forceAttrs = (cm.smVariables || []).filter((v) =>
      String(v.id || "").startsWith("attr_force_")
    );
    expect(forceAttrs).toHaveLength(3);
    expect(forceAttrs.every((v) => v.type === "binary")).toBe(true);
  });

  it("Q-matrix is multi-column and validates against binary attributes only", () => {
    const [cmSrc] = loadJson("newtonian_mechanics_competency_model.json");
    const [qmSrc] = loadJson("newtonian_force_qmatrix.json");
    expect(qmSrc.attributeNames.length).toBeGreaterThanOrEqual(3);

    const cm = {
      id: "cm_newt",
      name: cmSrc.name,
      versionNumber: 1,
      status: "confirmed",
      locked: true,
      measurementIntent: "multidimensional",
      smVariables: cmSrc.smVariables,
    };

    const labelToId = Object.fromEntries(
      (cm.smVariables || []).map((v) => [String(v.label).trim(), v.id])
    );
    const attributeIds = qmSrc.attributeNames.map((n) => labelToId[n]);
    expect(attributeIds.every(Boolean)).toBe(true);

    const items = [
      { id: "item_pair", name: "Force item — obs_force_pair" },
      { id: "item_net", name: "Force item — obs_force_net" },
      { id: "item_diagram", name: "Force item — obs_force_diagram" },
    ];
    const nameToItem = Object.fromEntries(items.map((i) => [i.name, i.id]));

    const qm = {
      id: "qm_force",
      name: qmSrc.name,
      competencyModelId: cm.id,
      competencyModelVersion: 1,
      attributeIds,
      entries: qmSrc.entries.map((e) => ({
        itemId: nameToItem[e.itemName],
        attributeId: labelToId[e.attributeName],
        required: !!e.required,
      })),
      status: "confirmed",
      locked: true,
    };

    const db = {
      competencyModels: [cm],
      items,
      qMatrixModels: [qm],
    };

    const { valid, errors } = validateEntity("qMatrixModels", qm, db);
    expect(errors).toEqual([]);
    expect(valid).toBe(true);

    // Exit check: refuse a continuous attribute column.
    const bad = {
      ...qm,
      attributeIds: [...attributeIds, "smv_theta"],
    };
    const badResult = validateEntity("qMatrixModels", bad, db);
    expect(badResult.valid).toBe(false);
    expect(badResult.errors.some((e) => /binary|continuous/i.test(e))).toBe(true);
  });

  it("Force DINA statistical model validates against the multi-column Q-matrix", () => {
    const [cmSrc] = loadJson("newtonian_mechanics_competency_model.json");
    const [qmSrc] = loadJson("newtonian_force_qmatrix.json");
    const pack = loadJson("newtonian_mechanics_evidence_models_confirm_ready.json");
    const emSrc = (pack.evidenceModels || []).find((e) =>
      String(e.name || "").includes("Force Diagnostic")
    );
    expect(emSrc).toBeTruthy();

    const cm = {
      id: "cm_newt",
      name: cmSrc.name,
      versionNumber: 1,
      status: "confirmed",
      locked: true,
      smVariables: cmSrc.smVariables,
    };
    const labelToId = Object.fromEntries(
      (cm.smVariables || []).map((v) => [String(v.label).trim(), v.id])
    );
    const attributeIds = qmSrc.attributeNames.map((n) => labelToId[n]);
    const items = [
      { id: "item_pair", name: "Force item — obs_force_pair" },
      { id: "item_net", name: "Force item — obs_force_net" },
      { id: "item_diagram", name: "Force item — obs_force_diagram" },
    ];
    const nameToItem = Object.fromEntries(items.map((i) => [i.name, i.id]));
    const qm = {
      id: "qm_force",
      name: qmSrc.name,
      competencyModelId: cm.id,
      competencyModelVersion: 1,
      attributeIds,
      entries: qmSrc.entries.map((e) => ({
        itemId: nameToItem[e.itemName],
        attributeId: labelToId[e.attributeName],
        required: !!e.required,
      })),
      status: "confirmed",
      locked: true,
    };

    const sm = (emSrc.statisticalModels || []).find((s) => s.type === "dina" && s.active);
    expect(sm).toBeTruthy();
    const em = {
      ...emSrc,
      id: "em_force",
      competencyId: "attr_force_pair",
      competencyModelVersion: 1,
      status: "draft",
      statisticalModels: [
        {
          ...sm,
          structureConfig: {
            ...(sm.structureConfig || {}),
            qMatrixId: qm.id,
            qMatrixName: undefined,
          },
          parameterSets: [],
          activeParameterSetId: null,
        },
      ],
    };

    const db = {
      competencyModels: [cm],
      competencies: [
        {
          id: "attr_force_pair",
          modelId: cm.id,
          name: "Force Pair (Action-Reaction)",
          variableType: "binary",
        },
      ],
      items,
      qMatrixModels: [qm],
      evidenceModels: [em],
    };

    const { errors } = validateEntity("evidenceModels", em, db, { strict: false });
    const dinaErrors = errors.filter(
      (e) => /qMatrix|dina|attribute|binary|continuous/i.test(e)
    );
    expect(dinaErrors).toEqual([]);
  });
});
