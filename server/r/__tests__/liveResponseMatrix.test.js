import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { assessLiveResponseMatrix } from "../liveResponseMatrix.js";
import { assessSessionItemAnalysis } from "../sessionItemAnalysis.js";
import { validateCalibrationRequest } from "../calibrationContract.js";
import { redactCalibrationJobForViewer } from "../../utils/aggregatePrivacy.js";

function session(id, studentId, responses, extras = {}) {
  return {
    id,
    studentId,
    status: "completed",
    isCompleted: true,
    responses,
    ...extras,
  };
}

function scored(itemId, activated, extra = {}) {
  return {
    itemId,
    evidenceModelId: "em1",
    activated,
    timestamp: "2026-10-16T12:00:00.000Z",
    ...extra,
  };
}

function students(n, responsesFor) {
  return Array.from({ length: n }, (_, i) =>
    session(`s${String(i).padStart(2, "0")}`, `stud-${i}`, responsesFor(i))
  );
}

function irtModel(subtype = "2pl", type = "irt") {
  return {
    evidenceModels: [
      {
        id: "em1",
        statisticalModels: [{ id: "sm1", type, subtype, active: true, parameterSets: [] }],
      },
    ],
  };
}

describe("live response matrix", () => {
  it("builds an IRT matrix from finished sessions and keeps a missing answer null", () => {
    const sessions = students(2, (i) =>
      i === 0
        ? [scored("item-b", false), scored("item-a", true), scored("item-c", true)]
        : [scored("item-a", false), scored("item-c", false)]
    );
    sessions.push(
      session("open", "stud-open", [scored("item-a", true), scored("item-b", true)], {
        status: "in_progress",
        isCompleted: false,
      })
    );
    sessions.push(
      session("other", "stud-other", [
        scored("item-a", true, { evidenceModelId: "em-other" }),
        scored("item-b", true, { evidenceModelId: "em-other" }),
      ])
    );
    sessions.push(
      session("other-sm", "stud-sm", [
        scored("item-a", true, { statisticalModelId: "sm-other" }),
        scored("item-b", true, { statisticalModelId: "sm-other" }),
      ])
    );

    const assessed = assessLiveResponseMatrix(
      { ...irtModel(), sessions },
      { evidenceModelId: "em1", statisticalModelId: "sm1", kind: "irt-parameters" }
    );

    expect(assessed.ok).toBe(true);
    expect(assessed.kind).toBe("irt-parameters");
    expect(assessed.request.model).toEqual({
      family: "irt",
      subtype: "2PL",
      itemIds: ["item-a", "item-b", "item-c"],
    });
    expect(assessed.request.responseMatrix.personIds).toEqual(["stud-0", "stud-1"]);
    expect(assessed.request.responseMatrix.data).toEqual([
      [1, 0, 1],
      [0, null, 0],
    ]);
    expect(JSON.parse(JSON.stringify(assessed.request.responseMatrix.data))[1][1]).toBeNull();
    expect(assessed.request.provenance.missingResponses).toBe("null");
    expect(assessed.request.provenance.missingCellCount).toBe(1);
    expect(assessed.sourceSessionIds).toEqual(["s00", "s01"]);
    expect(assessed.qMatrixId).toBeNull();
    expect(assessed.request.qMatrix).toBeUndefined();
    expect(validateCalibrationRequest({ ...assessed.request, contractVersion: "1.0", jobId: "job-live" })).toEqual([]);
  });

  it("encodes GRM cells as ordinal categories, not 0/1", () => {
    const sessions = students(2, (i) =>
      i === 0
        ? [
            scored("item-a", true, { category: 2, value: 2 }),
            scored("item-b", false, { category: 0, value: 0 }),
            scored("item-c", true, { category: 1, value: 1 }),
          ]
        : [
            scored("item-a", true, { category: 1, value: 1 }),
            scored("item-b", true, { category: 2, value: 2 }),
            scored("item-c", false, { category: 0, value: 0 }),
          ]
    );
    const assessed = assessLiveResponseMatrix(
      { ...irtModel("grm"), sessions },
      { evidenceModelId: "em1", statisticalModelId: "sm1", kind: "irt-parameters" }
    );
    expect(assessed.ok).toBe(true);
    expect(assessed.request.model.subtype).toBe("GRM");
    expect(assessed.request.responseMatrix.data).toEqual([
      [2, 0, 1],
      [1, 2, 0],
    ]);
  });

  it("maps a Rasch statistical model onto the Rasch subtype", () => {
    const assessed = assessLiveResponseMatrix(
      {
        ...irtModel(undefined, "rasch"),
        sessions: students(2, () => [scored("item-a", true), scored("item-b", false)]),
      },
      { evidenceModelId: "em1", statisticalModelId: "sm1", kind: "irt-parameters" }
    );
    expect(assessed.ok).toBe(true);
    expect(assessed.request.model.subtype).toBe("Rasch");
  });

  it("scopes rows to the requested items, sessions, and dates", () => {
    const sessions = [
      session("keep", "stud-keep", [
        scored("item-a", true, { timestamp: "2026-10-20T08:00:00.000Z" }),
        scored("item-b", false, { timestamp: "2026-10-20T08:00:00.000Z" }),
        scored("item-c", true, { timestamp: "2026-10-20T08:00:00.000Z" }),
      ]),
      session("also", "stud-also", [
        scored("item-a", false, { timestamp: "2026-10-20T09:00:00.000Z" }),
        scored("item-b", true, { timestamp: "2026-10-20T09:00:00.000Z" }),
      ]),
      session("early", "stud-early", [
        scored("item-a", true, { timestamp: "2026-10-01T00:00:00.000Z" }),
        scored("item-b", true, { timestamp: "2026-10-01T00:00:00.000Z" }),
      ]),
      session("drop", "stud-drop", [
        scored("item-a", true, { timestamp: "2026-10-20T10:00:00.000Z" }),
        scored("item-b", true, { timestamp: "2026-10-20T10:00:00.000Z" }),
      ]),
    ];
    const assessed = assessLiveResponseMatrix(
      { ...irtModel("raw_total", "ctt"), sessions },
      {
        evidenceModelId: "em1",
        statisticalModelId: "sm1",
        kind: "ctt-statistics",
        itemIds: ["item-b", "item-a"],
        sessionIds: ["keep", "also", "early"],
        from: "2026-10-20",
        to: "2026-10-20",
      }
    );
    expect(assessed.ok).toBe(true);
    expect(assessed.request.model.family).toBe("ctt");
    expect(assessed.request.model.itemIds).toEqual(["item-a", "item-b"]);
    expect(assessed.request.responseMatrix.personIds).toEqual(["stud-also", "stud-keep"]);
    expect(assessed.sourceSessionIds).toEqual(["also", "keep"]);
    expect(assessed.request.qMatrix).toBeUndefined();
  });

  it("skips a short IRT sample with a readable reason", () => {
    const assessed = assessLiveResponseMatrix(
      {
        ...irtModel(),
        sessions: students(2, () => [scored("item-a", true), scored("item-b", false)]),
      },
      {
        evidenceModelId: "em1",
        statisticalModelId: "sm1",
        kind: "irt-parameters",
        minSampleSize: 30,
      }
    );
    expect(assessed.ok).toBe(false);
    expect(assessed.code).toBe("SAMPLE_TOO_SMALL");
    expect(assessed.sampleSize).toBe(2);
    expect(assessed.message).toMatch(/IRT calibration needs at least 30 students/);
    expect(assessed.message).toMatch(/This selection has 2/);
  });

  it("uses the observable Q-matrix row and leaves the item row out", () => {
    const qMatrix = {
      id: "qm1",
      attributeIds: ["attr-1", "attr-2"],
      entries: [
        { itemId: "item-a", attributeId: "attr-1" },
        { itemId: "item-b", attributeId: "attr-1" },
        { itemId: "item-a", observableId: "obs-a", evidenceModelId: "em1", attributeId: "attr-2" },
        { itemId: "item-b", observableId: "obs-b", evidenceModelId: "em1", attributeId: "attr-2" },
        { itemId: "item-c", attributeId: "attr-1" },
      ],
    };
    const db = {
      ...irtModel(),
      qMatrixModels: [qMatrix],
      items: [
        { id: "item-a", observationId: "obs-a" },
        { id: "item-b", observationId: "obs-b" },
        { id: "item-c", observationId: "obs-c" },
      ],
      sessions: students(2, () => [
        scored("item-a", true, { observableId: "obs-a" }),
        scored("item-b", false, { observableId: "obs-b" }),
        scored("item-c", true),
      ]),
    };
    db.evidenceModels[0].statisticalModels[0] = {
      id: "sm1",
      type: "dina",
      structureConfig: { qMatrixId: "qm1" },
    };

    const assessed = assessLiveResponseMatrix(db, {
      evidenceModelId: "em1",
      statisticalModelId: "sm1",
      kind: "dina-parameters",
    });
    expect(assessed.ok).toBe(true);
    expect(assessed.qMatrixId).toBe("qm1");
    expect(assessed.request.model.family).toBe("dina");
    expect(assessed.request.qMatrix).toEqual({
      id: "qm1",
      attributeIds: ["attr-1", "attr-2"],
      itemIds: ["item-a", "item-b", "item-c"],
      data: [
        [0, 1],
        [0, 1],
        [1, 0],
      ],
    });
    expect(assessed.request.provenance.qMatrixUsesObservableRows).toBe(true);
    expect(validateCalibrationRequest({ ...assessed.request, contractVersion: "1.0", jobId: "job-dina" })).toEqual([]);
  });

  it("keeps the item row when the response does not cite an observable", () => {
    const db = {
      qMatrixModels: [
        {
          id: "qm1",
          attributeIds: ["attr-1", "attr-2"],
          entries: [
            { itemId: "item-a", attributeId: "attr-1" },
            { itemId: "item-b", attributeId: "attr-2" },
            { itemId: "item-a", observableId: "obs-a", evidenceModelId: "em1", attributeId: "attr-2" },
            { itemId: "item-c", attributeId: "attr-1" },
          ],
        },
      ],
      items: [
        { id: "item-a", observationId: "obs-a" },
        { id: "item-c" },
      ],
      evidenceModels: [
        {
          id: "em1",
          statisticalModels: [
            { id: "sm1", type: "gdina", structureConfig: { qMatrixId: "qm1" } },
          ],
        },
      ],
      sessions: students(2, () => [scored("item-a", true), scored("item-b", false), scored("item-c", true)]),
    };
    const assessed = assessLiveResponseMatrix(db, {
      evidenceModelId: "em1",
      statisticalModelId: "sm1",
      kind: "dina-parameters",
    });
    expect(assessed.ok).toBe(true);
    expect(assessed.request.model.family).toBe("gdina");
    expect(assessed.request.qMatrix.data).toEqual([
      [1, 0],
      [0, 1],
      [1, 0],
    ]);
    expect(assessed.request.provenance.qMatrixUsesObservableRows).toBe(false);
  });

  it("refuses a DINA model that does not cite a Q-matrix", () => {
    const assessed = assessLiveResponseMatrix(
      {
        evidenceModels: [{ id: "em1", statisticalModels: [{ id: "sm1", type: "dina" }] }],
        sessions: students(2, () => [scored("item-a", true), scored("item-b", true)]),
      },
      { evidenceModelId: "em1", statisticalModelId: "sm1", kind: "dina-parameters" }
    );
    expect(assessed.ok).toBe(false);
    expect(assessed.code).toBe("MISSING_Q_MATRIX");
    expect(assessed.message).toMatch(/qMatrixId/);
  });

  it("leaves item analysis on the same scored-session contract", () => {
    const sessions = students(10, (i) => [scored("item-a", true), scored("item-b", i % 2 === 0)]);
    const assessed = assessSessionItemAnalysis({ sessions }, "em1");
    expect(assessed.ok).toBe(true);
    expect(assessed.request.model.family).toBe("item-analysis");
    expect(assessed.request.options.seed).toBe(20261016);
    expect(assessed.request.responseMatrix.data[1]).toEqual([1, 0]);
    expect(assessed.sourceSessionCount).toBe(10);
  });

  it("stores a count and a hash when the session list is long", () => {
    const n = 51;
    const sessions = students(n, () => [scored("item-a", true), scored("item-b", false), scored("item-c", true)]);
    const assessed = assessLiveResponseMatrix(
      { ...irtModel(), sessions },
      { evidenceModelId: "em1", statisticalModelId: "sm1", kind: "irt-parameters" }
    );
    expect(assessed.ok).toBe(true);
    expect(assessed.sourceSessionIds).toBeUndefined();
    expect(assessed.sourceSessionCount).toBe(n);
    const ids = sessions.map((row) => row.id).sort((a, b) => a.localeCompare(b));
    expect(assessed.sourceSessionIdsHash).toBe(
      createHash("sha256").update(ids.join("\n"), "utf8").digest("hex")
    );
  });

  it("hides session ids from a non-admin view and keeps the count and hash", () => {
    const assessed = assessLiveResponseMatrix(
      {
        ...irtModel(),
        sessions: students(2, () => [scored("item-a", true), scored("item-b", false), scored("item-c", true)]),
      },
      { evidenceModelId: "em1", statisticalModelId: "sm1", kind: "irt-parameters" }
    );
    const red = redactCalibrationJobForViewer(
      {
        responseSource: "sessions",
        sourceSessionIds: assessed.sourceSessionIds,
        sourceSessionCount: assessed.sourceSessionCount,
        sourceSessionIdsHash: assessed.sourceSessionIdsHash,
        qMatrixId: null,
        request: assessed.request,
      },
      false
    );
    expect(red.sourceSessionIds).toBeUndefined();
    expect(red.sourceSessionIdsRedacted).toBe(true);
    expect(red.sourceSessionCount).toBe(2);
    expect(red.sourceSessionIdsHash).toBe(assessed.sourceSessionIdsHash);
    expect(red.request.provenance.studentIds).toBeUndefined();
    expect(red.request.provenance.sourceSessionCount).toBe(2);
    expect(red.request.responseMatrix.personIds).toBeUndefined();
    expect(red.request.responseMatrix.data).toBeUndefined();
  });

  it("refuses 2PL with two items and 3PL with three, and names the floor", () => {
    const two = assessLiveResponseMatrix(
      {
        ...irtModel("2pl"),
        sessions: students(2, () => [scored("item-a", true), scored("item-b", false)]),
      },
      { evidenceModelId: "em1", statisticalModelId: "sm1", kind: "irt-parameters" }
    );
    expect(two.ok).toBe(false);
    expect(two.code).toBe("TOO_FEW_ITEMS");
    expect(two.message).toMatch(/at least 3 items/);
    expect(two.message).toMatch(/This selection has 2/);

    const threePl = assessLiveResponseMatrix(
      {
        ...irtModel("3pl"),
        sessions: students(2, () => [
          scored("item-a", true),
          scored("item-b", false),
          scored("item-c", true),
        ]),
      },
      { evidenceModelId: "em1", statisticalModelId: "sm1", kind: "irt-parameters" }
    );
    expect(threePl.ok).toBe(false);
    expect(threePl.code).toBe("TOO_FEW_ITEMS");
    expect(threePl.message).toMatch(/at least 4 items/);

    const four = assessLiveResponseMatrix(
      {
        ...irtModel("3pl"),
        sessions: students(2, () => [
          scored("item-a", true),
          scored("item-b", false),
          scored("item-c", true),
          scored("item-d", false),
        ]),
      },
      { evidenceModelId: "em1", statisticalModelId: "sm1", kind: "irt-parameters" }
    );
    expect(four.ok).toBe(true);
    expect(four.request.model.subtype).toBe("3PL");
    expect(four.request.model.itemIds).toEqual(["item-a", "item-b", "item-c", "item-d"]);
  });

  it("takes DINA items from the Q-matrix, including items scored on another evidence model", () => {
    const db = {
      evidenceModels: [
        { id: "em-plant", statisticalModels: [] },
        {
          id: "em-function",
          statisticalModels: [
            {
              id: "sm-plant-dina",
              type: "dina",
              structureConfig: { qMatrixId: "qm-plant" },
            },
          ],
        },
      ],
      qMatrixModels: [
        {
          id: "qm-plant",
          attributeIds: ["smv-names-part", "smv-names-function"],
          entries: [
            { itemId: "it-leaf", attributeId: "smv-names-part", required: true },
            { itemId: "it-root", attributeId: "smv-names-part", required: true },
            { itemId: "it-function", attributeId: "smv-names-function", required: true },
            { itemId: "it-unanswered", attributeId: "smv-names-part", required: true },
            {
              observableId: "obs-plant-function",
              evidenceModelId: "em-function",
              attributeId: "smv-names-function",
              required: true,
            },
          ],
        },
      ],
      items: [
        { id: "it-leaf", observationId: "obs-plant-name" },
        { id: "it-root", observationId: "obs-plant-name" },
        { id: "it-function", observationId: "obs-plant-function", evidenceModelId: "em-function" },
      ],
      sessions: [
        ...students(2, () => [
          scored("it-leaf", true, { evidenceModelId: "em-plant", observableId: "obs-plant-name" }),
          scored("it-root", false, { evidenceModelId: "em-plant", observableId: "obs-plant-name" }),
          scored("it-function", true, {
            evidenceModelId: "em-function",
            observableId: "obs-plant-function",
          }),
          scored("it-equiv", true, { evidenceModelId: "em-frac" }),
        ]),
        session("other-sm", "stud-other", [
          scored("it-leaf", true, { evidenceModelId: "em-plant", statisticalModelId: "sm-other" }),
          scored("it-root", true, { evidenceModelId: "em-plant", statisticalModelId: "sm-other" }),
          scored("it-function", true, {
            evidenceModelId: "em-function",
            statisticalModelId: "sm-other",
          }),
        ]),
      ],
    };

    const assessed = assessLiveResponseMatrix(db, {
      evidenceModelId: "em-function",
      statisticalModelId: "sm-plant-dina",
      kind: "dina-parameters",
    });
    expect(assessed.ok).toBe(true);
    expect(assessed.itemIds).toEqual(["it-function", "it-leaf", "it-root"]);
    expect(assessed.request.qMatrix.itemIds).toEqual(["it-function", "it-leaf", "it-root"]);
    expect(assessed.request.qMatrix.data).toEqual([
      [0, 1],
      [1, 0],
      [1, 0],
    ]);
    expect(assessed.request.provenance.qMatrixUsesObservableRows).toBe(true);
    expect(assessed.request.responseMatrix.personIds).toEqual(["stud-0", "stud-1"]);
    expect(validateCalibrationRequest({ ...assessed.request, contractVersion: "1.0", jobId: "job-plant" })).toEqual([]);
  });

  it("refuses a two-item DINA matrix even when both items are on the Q-matrix", () => {
    const db = {
      qMatrixModels: [
        {
          id: "qm1",
          attributeIds: ["attr-1"],
          entries: [
            { itemId: "item-a", attributeId: "attr-1" },
            { itemId: "item-b", attributeId: "attr-1" },
          ],
        },
      ],
      evidenceModels: [
        {
          id: "em1",
          statisticalModels: [{ id: "sm1", type: "dina", structureConfig: { qMatrixId: "qm1" } }],
        },
      ],
      sessions: students(2, () => [scored("item-a", true), scored("item-b", false)]),
    };
    const assessed = assessLiveResponseMatrix(db, {
      evidenceModelId: "em1",
      statisticalModelId: "sm1",
      kind: "dina-parameters",
    });
    expect(assessed.ok).toBe(false);
    expect(assessed.code).toBe("TOO_FEW_ITEMS");
    expect(assessed.message).toMatch(/at least 3 items/);
  });
});
