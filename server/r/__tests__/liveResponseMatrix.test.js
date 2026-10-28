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
        ? [scored("item-b", false), scored("item-a", true)]
        : [scored("item-a", false)]
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
    expect(assessed.request.model).toEqual({ family: "irt", subtype: "2PL", itemIds: ["item-a", "item-b"] });
    expect(assessed.request.responseMatrix.personIds).toEqual(["stud-0", "stud-1"]);
    expect(assessed.request.responseMatrix.data).toEqual([
      [1, 0],
      [0, null],
    ]);
    expect(JSON.parse(JSON.stringify(assessed.request.responseMatrix.data))[1][1]).toBeNull();
    expect(assessed.request.provenance.missingResponses).toBe("null");
    expect(assessed.request.provenance.missingCellCount).toBe(1);
    expect(assessed.sourceSessionIds).toEqual(["s00", "s01"]);
    expect(assessed.qMatrixId).toBeNull();
    expect(assessed.request.qMatrix).toBeUndefined();
    expect(validateCalibrationRequest({ ...assessed.request, contractVersion: "1.0", jobId: "job-live" })).toEqual([]);
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
      ],
    };
    const db = {
      ...irtModel(),
      qMatrixModels: [qMatrix],
      items: [
        { id: "item-a", observationId: "obs-a" },
        { id: "item-b", observationId: "obs-b" },
      ],
      sessions: students(2, () => [
        scored("item-a", true, { observableId: "obs-a" }),
        scored("item-b", false, { observableId: "obs-b" }),
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
      itemIds: ["item-a", "item-b"],
      data: [
        [0, 1],
        [0, 1],
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
          ],
        },
      ],
      items: [{ id: "item-a", observationId: "obs-a" }],
      evidenceModels: [
        {
          id: "em1",
          statisticalModels: [
            { id: "sm1", type: "gdina", structureConfig: { qMatrixId: "qm1" } },
          ],
        },
      ],
      sessions: students(2, () => [scored("item-a", true), scored("item-b", false)]),
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
    const sessions = students(n, () => [scored("item-a", true), scored("item-b", false)]);
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
        sessions: students(2, () => [scored("item-a", true), scored("item-b", false)]),
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
});
