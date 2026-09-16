// server/delivery/__tests__/d49cIdentificationLibrary.test.js
//
// D49c. Library as the Identification / scoring source. Exit check:
//
//   1. When the active package matches the authoring graph, the identified
//      observable equals the pre-D49c (live-graph) result.
//   2. When structural authoring changes without a rebuild, delivery does
//      NOT quietly use the new live map — it scores the package snapshot
//      or refuses if the package is version-stale.
//   3. A parameter flip without a rebuild takes effect on the next score.
//   4. A missing / inactive / stale package is a refusal, never a silent
//      live-graph score.
//   5. A source-level guard would catch a reintroduction of
//      `db.evidenceModels` as Identification's structural reader.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, it, expect } from "vitest";
import { identifyEvidence } from "../evidenceIdentification.js";
import { buildCompositeLibrary } from "../../compositeLibrary/builder.js";
import { seedActivePackages } from "../../test/seedActivePackage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const evidenceModel = {
  id: "em1",
  versionNumber: 1,
  observables: [
    {
      id: "o1",
      type: "selected_response",
      evidenceRule: {
        direction: "supports",
        strengthLevel: 4,
        activationCondition: "any",
        justification: "Direct evidence.",
      },
    },
  ],
};

const taskModel = {
  id: "tm1",
  versionNumber: 1,
  status: "operational",
  locked: true,
  evidenceModelIds: ["em1"],
  expectedObservations: [{ observationId: "o1", evidenceModelId: "em1", required: true, weight: 1 }],
};

const item = {
  id: "item1",
  taskModelId: "tm1",
  taskModelVersion: 1,
  status: "confirmed",
  observationId: "o1",
  evidenceModelId: "em1",
  evidenceModelVersion: 1,
  scoring: {
    method: "dichotomous",
    evidenceActivationMap: [
      { responsePattern: { selected: "opt_a" }, activatesObservable: true, strengthOverride: 4, rationale: "Correct." },
      { responsePattern: { selected: "opt_b" }, activatesObservable: false, rationale: "Distractor." },
    ],
  },
};

function dbWithPackage(overrides = {}) {
  const db = {
    evidenceModels: [structuredClone(evidenceModel)],
    taskModels: [structuredClone(taskModel)],
    items: [structuredClone(item)],
    ...overrides,
  };
  if (!Object.prototype.hasOwnProperty.call(overrides, "compositeLibrary")) {
    seedActivePackages(db);
  }
  return db;
}

describe("D49c — happy path: package matching the authoring graph scores identically", () => {
  it("an activating response produces the same observable value the live graph would have", () => {
    const db = dbWithPackage();
    const result = identifyEvidence({ selected: "opt_a" }, db.items[0], db);

    expect(result.refused).toBeUndefined();
    expect(result).toEqual({
      observationId: "o1",
      observableId: "o1",
      activated: true,
      direction: "supports",
      strength: 4,
      rationale: "Correct.",
      evaluationMethod: null,
      evaluationProcedureId: null,
    });
  });

  it("a distractor response is still a non-activating identification, not a refusal", () => {
    const db = dbWithPackage();
    const result = identifyEvidence({ selected: "opt_b" }, db.items[0], db);

    expect(result.refused).toBeUndefined();
    expect(result.activated).toBe(false);
    expect(result.direction).toBe("supports");
    expect(result.rationale).toBe("Distractor.");
  });
});

describe("D49c — structural authoring change without rebuild does not use the live map", () => {
  it("a live activation-map edit is ignored; the package snapshot is scored", () => {
    const db = dbWithPackage();

    // Live authoring now says opt_a does NOT activate. The package still
    // says it does. Using the live map here is the quiet failure D49c exists
    // to prevent.
    db.items[0] = {
      ...db.items[0],
      scoring: {
        method: "dichotomous",
        evidenceActivationMap: [
          { responsePattern: { selected: "opt_a" }, activatesObservable: false, rationale: "Live edit — must not be used." },
        ],
      },
    };

    const result = identifyEvidence({ selected: "opt_a" }, db.items[0], db);

    expect(result.refused).toBeUndefined();
    expect(result.activated).toBe(true);
    expect(result.rationale).toBe("Correct.");
    expect(result.rationale).not.toMatch(/Live edit/);
  });

  it("a version-stale package is refused rather than scored against either snapshot or live graph", () => {
    const db = dbWithPackage();
    db.evidenceModels[0] = { ...db.evidenceModels[0], versionNumber: 2 };

    const result = identifyEvidence({ selected: "opt_a" }, db.items[0], db);

    expect(result.refused).toBe(true);
    expect(result.activated).toBeNull();
    expect(result.error).toMatch(/stale/);
    expect(result.error).toMatch(/Rebuild via POST \/api\/compositeLibrary\/rebuild\/tm1/);
  });
});

describe("D49c — missing / inactive package is a loud refusal", () => {
  it("no package at all is refused, not scored from the live item", () => {
    const db = dbWithPackage({ compositeLibrary: [] });
    const result = identifyEvidence({ selected: "opt_a" }, db.items[0], db);

    expect(result.refused).toBe(true);
    expect(result.activated).toBeNull();
    expect(result.error).toMatch(/No active composite library package/);
  });

  it("an inactive package is treated as missing", () => {
    const db = dbWithPackage();
    db.compositeLibrary[0].active = false;

    const result = identifyEvidence({ selected: "opt_a" }, db.items[0], db);

    expect(result.refused).toBe(true);
    expect(result.error).toMatch(/No active composite library package/);
  });

  it("an item absent from the active package is refused", () => {
    const db = dbWithPackage();
    db.compositeLibrary[0].items = [];

    const result = identifyEvidence({ selected: "opt_a" }, db.items[0], db);

    expect(result.refused).toBe(true);
    expect(result.error).toMatch(/is not in the active composite library package/);
  });
});

describe("D49c — parameter flip without rebuild is not a staleness signal", () => {
  it("isCompositeLibraryStale stays false when only a parameter set changes", () => {
    // Parameters are not Identification's input, but the staleness check
    // Identification uses must not treat a recalibration as structural drift
    // (ADR 0003: recalibration does not invalidate the package).
    const db = dbWithPackage();
    const { record } = buildCompositeLibrary(db.taskModels[0], db);
    db.evidenceModels[0] = {
      ...db.evidenceModels[0],
      statisticalModels: [
        {
          id: "sm1",
          type: "irt",
          active: true,
          activeParameterSetId: "ps-new",
          parameterSets: [{ parameterSetId: "ps-new", parameters: { o1: { a: 2, b: -1 } } }],
        },
      ],
    };

    const result = identifyEvidence({ selected: "opt_a" }, db.items[0], db);

    expect(result.refused).toBeUndefined();
    expect(result.activated).toBe(true);
    expect(record.items[0].scoring).not.toHaveProperty("parameterSets");
    expect(JSON.stringify(db.compositeLibrary[0])).not.toMatch(/parameterSets/);
  });
});

describe("D49c — mutation guard: Identification must not re-walk live structural fields", () => {
  it("evidenceIdentification.js does not read db.evidenceModels or item.scoring for structure", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../evidenceIdentification.js"), "utf8");
    const live = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => {
        const i = line.indexOf("//");
        return i === -1 ? line : line.slice(0, i);
      })
      .join("\n");

    expect(live).toMatch(/resolveIdentificationStructure/);
    expect(live).not.toMatch(/db\.evidenceModels/);
    expect(live).not.toMatch(/item\.scoring/);
    expect(live).not.toMatch(/item\.evidenceModelId/);
  });
});
