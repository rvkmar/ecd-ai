import { describe, it, expect } from "vitest";
import { validateEntity } from "../schema.js";
import { deliveryModelReadiness } from "../deliveryModelReadiness.js";

function parents(overrides = {}) {
  return {
    deliveryModels: [],
    competencyModels: [{ id: "cm1", status: "confirmed", name: "Student" }],
    assemblyModels: [
      { id: "am1", status: "confirmed", competencyModelId: "cm1", name: "Assembly" },
    ],
    policies: [{ id: "p1", type: "fixed", name: "Fixed" }],
    presentationModels: [{ id: "pm1", status: "operational", name: "Presentation" }],
    sessions: [],
    ...overrides,
  };
}

function model(overrides = {}) {
  return {
    id: "dm1",
    name: "Grade 6 delivery",
    description: "One sitting.",
    status: "draft",
    competencyModelId: "cm1",
    assemblyModelId: "am1",
    policyId: "p1",
    presentationModelId: "pm1",
    administration: {
      timeLimitMinutes: 20,
      attempts: 1,
      allowedReview: true,
      feedbackMode: "immediate",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("deliveryModels", () => {
  it("accepts administration.carryForward only as a boolean", () => {
    const ok = validateEntity(
      "deliveryModels",
      model({ administration: { ...model().administration, carryForward: true } }),
      parents(),
      { strict: false }
    );
    expect(ok.valid).toBe(true);
    const bad = validateEntity(
      "deliveryModels",
      model({ administration: { ...model().administration, carryForward: "yes" } }),
      parents(),
      { strict: false }
    );
    expect(bad.valid).toBe(false);
    expect(bad.errors.join(" ")).toMatch(/carryForward/);
  });

  it("accepts a draft that cites draft parents", () => {
    const db = parents({
      competencyModels: [{ id: "cm1", status: "draft" }],
      assemblyModels: [{ id: "am1", status: "draft", competencyModelId: "cm1" }],
      presentationModels: [{ id: "pm1", status: "draft" }],
    });
    const result = validateEntity("deliveryModels", model(), db, { strict: false });
    expect(result.valid).toBe(true);
  });

  it("refuses confirm while a cited model is still a draft", () => {
    const db = parents({
      assemblyModels: [{ id: "am1", status: "draft", competencyModelId: "cm1" }],
    });
    const result = validateEntity(
      "deliveryModels",
      model({ status: "confirmed" }),
      db,
      { strict: true }
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/Assembly model 'am1'/);
  });

  it("confirms when the student model, assembly model, and presentation model are confirmed or operational", () => {
    const result = validateEntity(
      "deliveryModels",
      model({ status: "confirmed", presentationModelId: "pm1" }),
      parents(),
      { strict: true }
    );
    expect(result.valid).toBe(true);
  });

  it("confirms without a presentation override", () => {
    const record = model({ status: "confirmed" });
    delete record.presentationModelId;
    const result = validateEntity("deliveryModels", record, parents(), { strict: true });
    expect(result.valid).toBe(true);
  });

  it("rejects a policy that does not exist and an assembly model on another student model", () => {
    const db = parents();
    const missing = validateEntity(
      "deliveryModels",
      model({ policyId: "missing" }),
      db,
      { strict: false }
    );
    expect(missing.errors.join(" ")).toMatch(/Invalid policyId/);

    const crossed = validateEntity(
      "deliveryModels",
      model({ competencyModelId: "cm-other" }),
      parents({
        competencyModels: [
          { id: "cm1", status: "confirmed" },
          { id: "cm-other", status: "confirmed" },
        ],
      }),
      { strict: false }
    );
    expect(crossed.errors.join(" ")).toMatch(/belongs to competency model/);
  });

  it("rejects a duplicate name and an unknown feedback mode", () => {
    const db = parents({
      deliveryModels: [{ id: "dm-other", name: "Grade 6 delivery" }],
    });
    const clash = validateEntity("deliveryModels", model(), db, { strict: false });
    expect(clash.errors.join(" ")).toMatch(/already used/);

    const feedback = validateEntity(
      "deliveryModels",
      model({
        administration: {
          timeLimitMinutes: null,
          attempts: 1,
          allowedReview: false,
          feedbackMode: "whisper",
        },
      }),
      parents(),
      { strict: false }
    );
    expect(feedback.errors.join(" ")).toMatch(/feedbackMode/);
  });

  it("readiness matches confirm validation", () => {
    const cases = [
      { record: model(), db: parents() },
      {
        record: model(),
        db: parents({
          assemblyModels: [{ id: "am1", status: "draft", competencyModelId: "cm1" }],
        }),
      },
      { record: model({ policyId: "nope" }), db: parents() },
      {
        record: model({ administration: { attempts: 0, allowedReview: true, feedbackMode: "none" } }),
        db: parents(),
      },
    ];
    for (const { record, db } of cases) {
      const readiness = deliveryModelReadiness(record, db);
      const confirmed = validateEntity(
        "deliveryModels",
        { ...record, status: "confirmed" },
        db,
        { strict: true }
      );
      expect(readiness.ready).toBe(confirmed.valid);
      expect(readiness.errors).toEqual(confirmed.errors);
    }
  });
});

describe("sessions.deliveryModelId", () => {
  it("stays valid when the field is absent", () => {
    const result = validateEntity(
      "sessions",
      {
        id: "s1",
        taskIds: ["t1"],
        selectionStrategy: "fixed",
        status: "ready",
        responses: [],
      },
      { deliveryModels: [], tasks: [{ id: "t1" }] }
    );
    expect(result.errors.join(" ")).not.toMatch(/deliveryModelId/);
  });

  it("rejects a delivery model id that is not in the store", () => {
    const result = validateEntity(
      "sessions",
      {
        id: "s1",
        taskIds: ["t1"],
        deliveryModelId: "dm-missing",
        selectionStrategy: "fixed",
        status: "ready",
        responses: [],
      },
      { deliveryModels: [], tasks: [{ id: "t1" }] }
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/Invalid deliveryModelId/);
  });
});
