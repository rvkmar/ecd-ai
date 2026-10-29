import { describe, it, expect } from "vitest";
import { buildStudentEcdReport, responseScore } from "../studentEcdReport.js";

function db() {
  return {
    competencies: [{
      id: "c-name",
      name: "Plant part naming",
      domain: "Science",
      strand: "Living things",
      modelId: "cm-plant",
      scale: { interpretationGuide: "Higher values mean more reliable naming of called-out parts." },
    }],
    competencyModels: [{ id: "cm-plant", name: "Plant morphology" }],
    evidenceModels: [{
      id: "em-plant",
      name: "Part naming evidence",
      competencyId: "c-name",
      claimStatement: "The student can name the called-out plant part.",
    }],
    taskModels: [{
      id: "tm-plant",
      name: "Name the plant part",
      evidenceModelIds: ["em-plant"],
      primaryEvidenceModelId: "em-plant",
      expectedObservations: [{
        observationId: "obs-plant-name",
        evidenceModelId: "em-plant",
        required: true,
      }],
    }],
    tasks: [{ id: "t-leaf", name: "Leaf diagram", taskModelId: "tm-plant" }],
    items: [{
      id: "it-leaf",
      name: "Leaf on the diagram",
      taskModelId: "tm-plant",
      observationId: "obs-plant-name",
      evidenceModelId: "em-plant",
      stimulus: { blocks: [{ type: "text", content: "The arrow points to a flat green part. What is it called?" }] },
      interaction: {
        type: "mcq",
        responseComponents: [
          { id: "opt_a", label: "Leaf", isCorrect: true },
          { id: "opt_b", label: "Root", isCorrect: false },
        ],
      },
      metadata: { difficulty: "easy", topic: "Leaves" },
      cognitiveDemand: { bloomLevel: "remember" },
    }, {
      id: "it-root",
      name: "Root on the diagram",
      taskModelId: "tm-plant",
      observationId: "obs-plant-name",
      evidenceModelId: "em-plant",
      interaction: {
        type: "mcq",
        responseComponents: [
          { id: "opt_a", label: "Leaf", isCorrect: false },
          { id: "opt_b", label: "Root", isCorrect: true },
        ],
      },
    }],
  };
}

describe("responseScore", () => {
  it("prefers scoredValue over activated", () => {
    expect(responseScore({ scoredValue: 0.5, activated: true })).toBe(0.5);
    expect(responseScore({ activated: false })).toBe(0);
  });
});

describe("buildStudentEcdReport", () => {
  it("joins item → task model → evidence → competency and never leaks keys", () => {
    const report = buildStudentEcdReport(db(), {
      id: "s1",
      studentId: "stu1",
      selectionStrategy: "IRT",
      studentModel: { irtTheta: 0.4 },
      responses: [
        { taskId: "t-leaf", itemId: "it-leaf", rawAnswer: "opt_a", scoredValue: 1, activated: true },
        { taskId: "t-leaf", itemId: "it-root", rawAnswer: "opt_a", scoredValue: 0, activated: false },
      ],
    }, {
      student: { id: "stu1", name: "Pat" },
      measurement: { stopped: { rule: "maxItems", reason: "Item limit reached" }, attributeProfile: [] },
    });

    expect(report.overview.nItems).toBe(2);
    expect(report.overview.nCorrect).toBe(1);
    expect(report.overview.percent).toBe(0.5);
    expect(report.overview.band).toBe("developing");
    expect(report.competencies[0].id).toBe("c-name");
    expect(report.competencies[0].name).toBe("Plant part naming");
    expect(report.competencies[0].interpretation).toMatch(/partial command/);
    expect(report.evidence[0].name).toBe("Part naming evidence");
    expect(report.tasks[0].name).toBe("Leaf diagram");
    expect(report.taskModels[0].name).toBe("Name the plant part");
    expect(report.items[0].selected).toBe("Leaf");
    expect(report.items[0].excerpt).toMatch(/flat green part/);
    expect(report.interpretation.headline).toMatch(/Developing/);
    expect(report.guideNotes[0].guide).toMatch(/reliable naming/);

    const blob = JSON.stringify(report);
    expect(blob).not.toMatch(/isCorrect/);
    expect(blob).not.toMatch(/keyedOptionId/);
    expect(blob).not.toMatch(/opt_b/);
  });

  it("interprets an empty session without inventing scores", () => {
    const report = buildStudentEcdReport(db(), { id: "s-empty", responses: [] });
    expect(report.overview.nScored).toBe(0);
    expect(report.interpretation.headline).toMatch(/No scored responses/);
    expect(report.competencies).toEqual([]);
    expect(report.nextSteps[0]).toMatch(/Finish and score/);
  });

  it("charts occasion history from student-model records", () => {
    const report = buildStudentEcdReport(db(), { id: "s1", responses: [] }, {
      studentModelRecords: [{
        competencyModelName: "Plant morphology",
        history: [
          { sessionId: "s0", timestamp: "2026-10-01T00:00:00.000Z", posteriorSnapshot: { c: { estimate: 0.2 } } },
          { sessionId: "s1", timestamp: "2026-10-29T00:00:00.000Z", posteriorSnapshot: { c: { estimate: 0.6 } } },
        ],
      }],
    });
    expect(report.occasions).toHaveLength(2);
    expect(report.occasions[1].estimate).toBe(0.6);
  });
});
