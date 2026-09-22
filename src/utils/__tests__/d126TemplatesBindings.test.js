// src/utils/__tests__/d126TemplatesBindings.test.js
//
// D126 exit check: a template validates its four bindings and refuses
// an incoherent one (Presentation Model bound to a different Task Model).

import { describe, it, expect } from "vitest";
import {
  schema,
  validateEntity,
  templateBindingErrors,
  TEMPLATE_STATUS_VALUES,
} from "../schema.js";
import {
  templateReadiness,
  TEMPLATE_STATUS_MIRROR,
  TEMPLATE_BINDING_KEYS,
} from "../templateReadiness.js";

function coherentDb() {
  return {
    competencyModels: [{ id: "cm1", name: "CM", status: "confirmed", locked: true }],
    competencies: [{ id: "c1", name: "Attr", modelId: "cm1" }],
    evidenceModels: [
      {
        id: "em1",
        name: "EM",
        competencyId: "c1",
        status: "confirmed",
        locked: true,
      },
    ],
    taskModels: [
      {
        id: "tm1",
        name: "TM",
        evidenceModelIds: ["em1"],
        primaryEvidenceModelId: "em1",
        status: "confirmed",
        locked: true,
        versionNumber: 1,
      },
    ],
    presentationModels: [
      {
        id: "pm1",
        name: "PM",
        taskModelId: "tm1",
        taskModelVersion: 1,
        status: "confirmed",
        locked: true,
      },
    ],
    templates: [],
  };
}

function template(overrides = {}) {
  return {
    id: "tpl1",
    name: "Family blueprint",
    status: "draft",
    competencyModelId: "cm1",
    evidenceModelId: "em1",
    taskModelId: "tm1",
    presentationModelId: "pm1",
    ...overrides,
  };
}

describe("D126 templates — schema surface", () => {
  it("declares templates in schema", () => {
    expect(schema.templates).toBeDefined();
    expect(TEMPLATE_STATUS_VALUES).toEqual(["draft", "confirmed"]);
    expect(TEMPLATE_BINDING_KEYS).toHaveLength(4);
  });

  it("accepts a coherent draft with four bindings", () => {
    const db = coherentDb();
    const { valid, errors } = validateEntity("templates", template(), db);
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
  });

  it("confirms when four bindings are coherent", () => {
    const db = coherentDb();
    const { valid, errors } = validateEntity(
      "templates",
      template({ status: "confirmed" }),
      db
    );
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
  });

  it("refuses confirm without all four bindings", () => {
    const db = coherentDb();
    const { valid, errors } = validateEntity(
      "templates",
      template({ status: "confirmed", presentationModelId: undefined }),
      db
    );
    expect(valid).toBe(false);
    expect(errors.some((e) => /presentationModelId is required/.test(e))).toBe(
      true
    );
  });

  it("refuses a Presentation Model bound to a different Task Model", () => {
    const db = coherentDb();
    db.presentationModels.push({
      id: "pm-other",
      name: "Other TM materials",
      taskModelId: "tm-other",
      status: "confirmed",
      locked: true,
    });
    db.taskModels.push({
      id: "tm-other",
      name: "Other",
      evidenceModelIds: ["em1"],
      status: "confirmed",
      locked: true,
    });

    const errors = templateBindingErrors(
      template({ presentationModelId: "pm-other" }),
      db,
      { requireAllBindings: true }
    );
    expect(
      errors.some((e) =>
        /presentationModelId 'pm-other' is bound to taskModelId 'tm-other'/.test(e)
      )
    ).toBe(true);

    const { valid } = validateEntity(
      "templates",
      template({ status: "confirmed", presentationModelId: "pm-other" }),
      db
    );
    expect(valid).toBe(false);
  });

  it("refuses Evidence Model from a different Student Model", () => {
    const db = coherentDb();
    db.competencyModels.push({ id: "cm2", name: "Other CM", status: "confirmed", locked: true });
    db.competencies.push({ id: "c2", name: "Other", modelId: "cm2" });
    db.evidenceModels.push({
      id: "em2",
      name: "EM2",
      competencyId: "c2",
      status: "confirmed",
      locked: true,
    });
    db.taskModels[0].evidenceModelIds.push("em2");

    const { valid, errors } = validateEntity(
      "templates",
      template({ status: "confirmed", evidenceModelId: "em2" }),
      db
    );
    expect(valid).toBe(false);
    expect(
      errors.some((e) => /bound to competency model 'cm2'/.test(e))
    ).toBe(true);
  });

  it("refuses Evidence Model not listed on the Task Model", () => {
    const db = coherentDb();
    db.evidenceModels.push({
      id: "em-orphan",
      name: "Orphan",
      competencyId: "c1",
      status: "confirmed",
      locked: true,
    });
    const { valid, errors } = validateEntity(
      "templates",
      template({ status: "confirmed", evidenceModelId: "em-orphan" }),
      db
    );
    expect(valid).toBe(false);
    expect(
      errors.some((e) => /not among task model 'tm1' evidenceModelIds/.test(e))
    ).toBe(true);
  });
});

describe("D126 templateReadiness mirror", () => {
  it("agrees with TEMPLATE_STATUS_VALUES", () => {
    expect(TEMPLATE_STATUS_MIRROR).toEqual([...TEMPLATE_STATUS_VALUES]);
  });

  it("flags missing bindings under strict", () => {
    const mirror = templateReadiness({ name: "X", status: "draft" }, { strict: true });
    expect(mirror.ready).toBe(false);
    expect(mirror.errors.length).toBeGreaterThanOrEqual(4);
  });

  it("accepts a complete shape without db", () => {
    expect(templateReadiness(template({ status: "confirmed" })).ready).toBe(true);
  });
});
