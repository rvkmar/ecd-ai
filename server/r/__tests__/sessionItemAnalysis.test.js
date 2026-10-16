import { describe, it, expect } from "vitest";
import { assessSessionItemAnalysis } from "../sessionItemAnalysis.js";
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

function scored(itemId, activated, evidenceModelId = "em1") {
  return { itemId, evidenceModelId, activated, timestamp: "2026-10-16T00:00:00.000Z" };
}

function tenStudents(activated, items = ["item-a", "item-b"]) {
  return Array.from({ length: 10 }, (_, i) =>
    session(
      `s${i}`,
      `stud-${i}`,
      items.map((itemId) => scored(itemId, activated))
    )
  );
}

describe("session item analysis", () => {
  it("refuses fewer than 10 scored students and lists the ids it found", () => {
    const assessed = assessSessionItemAnalysis(
      { sessions: tenStudents(true).slice(0, 3) },
      "em1"
    );
    expect(assessed.ok).toBe(false);
    expect(assessed.code).toBe("SAMPLE_TOO_SMALL");
    expect(assessed.sampleSize).toBe(3);
    expect(assessed.studentIds).toEqual(["stud-0", "stud-1", "stud-2"]);
  });

  it("refuses when every response has activated null and still lists the students", () => {
    const assessed = assessSessionItemAnalysis(
      { sessions: tenStudents(null) },
      "em1"
    );
    expect(assessed.ok).toBe(false);
    expect(assessed.code).toBe("UNSCORED");
    expect(assessed.sampleSize).toBe(10);
    expect(assessed.studentIds).toEqual(Array.from({ length: 10 }, (_, i) => `stud-${i}`));
    expect(assessed.request).toBeNull();
  });

  it("builds a real sample from scored session responses for one evidence model", () => {
    const sessions = tenStudents(true);
    sessions.push(
      session("open", "stud-open", [scored("item-a", true)], { status: "draft", isCompleted: false })
    );
    sessions.push(
      session("other", "stud-other", [scored("item-a", true, "em-other"), scored("item-b", false, "em-other")])
    );
    const assessed = assessSessionItemAnalysis({ sessions }, "em1");
    expect(assessed.ok).toBe(true);
    expect(assessed.sampleSize).toBe(10);
    expect(assessed.studentIds).toHaveLength(10);
    expect(assessed.request.model.family).toBe("item-analysis");
    expect(assessed.request.responseMatrix.personIds).toEqual(assessed.studentIds);
    expect(assessed.request.responseMatrix.itemIds).toEqual(["item-a", "item-b"]);
    expect(assessed.request.responseMatrix.data).toHaveLength(10);
    expect(assessed.request.responseMatrix.data[0]).toEqual([1, 1]);
    expect(assessed.request.provenance.source).toBe("completed-sessions");
    expect(assessed.request.provenance.studentIds).toEqual(assessed.studentIds);
  });

  it("hides session student ids from a non-admin job view", () => {
    const assessed = assessSessionItemAnalysis({ sessions: tenStudents(false) }, "em1");
    const red = redactCalibrationJobForViewer(
      { request: assessed.request, response: null },
      false
    );
    expect(red.request.provenance.studentIds).toBeUndefined();
    expect(red.request.provenance.sampleSize).toBe(10);
    expect(red.request.provenance.studentIdsRedacted).toBe(true);
    expect(red.request.responseMatrix.personIds).toBeUndefined();
    expect(red.request.responseMatrix.data).toBeUndefined();
  });
});
