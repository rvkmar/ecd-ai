import { describe, it, expect } from "vitest";
import { validateEntity } from "../schema.js";
import { designPatternReadiness } from "../designPatternReadiness.js";
import {
  copyKsaLinks,
  focalKsaLinkNote,
  focalKsaUnlinkedWarnings,
  resolveSeedStudentModel,
} from "../ksaStudentModelLink.js";

const db = {
  competencies: [
    { id: "c-plant", name: "Names the part", modelId: "cm-plant" },
    { id: "c-frac", name: "Fraction equivalence", modelId: "cm-frac" },
  ],
  competencyModels: [
    {
      id: "cm-plant",
      name: "Plant part naming",
      smVariables: [{ id: "smv-names-part", label: "Names the part" }],
    },
    {
      id: "cm-frac",
      name: "Fractions",
      smVariables: [{ id: "smv-equiv", label: "Fraction equivalence" }],
    },
  ],
  workProducts: [],
  rubrics: [],
  taskModelVariables: [],
  designPatterns: [],
};

function pattern(extra = {}) {
  return {
    name: "Name a plant part",
    summary: "The examinee names the part.",
    rationale: "Naming is the claim.",
    status: "draft",
    ...extra,
  };
}

describe("design pattern KSA student-model links", () => {
  it("keeps a label-only KSA valid and omits blank link fields", () => {
    const result = validateEntity(
      "designPatterns",
      pattern({
        focalKsas: [{ label: "Plant-part vocabulary" }],
        additionalKsas: [{ label: "Reading a label", relationship: "potentially_confounding" }],
      }),
      db,
      { strict: false }
    );
    expect(result.valid).toBe(true);
    expect(copyKsaLinks({ label: "Plant-part vocabulary", competencyId: "  ", smvId: "" })).toEqual(
      {}
    );
    expect(
      copyKsaLinks({
        competencyId: " c-plant ",
        competencyModelId: "cm-plant",
        smvId: "smv-names-part",
      })
    ).toEqual({
      competencyId: "c-plant",
      competencyModelId: "cm-plant",
      smvId: "smv-names-part",
    });
  });

  it("accepts a competency and an SMV that exist, including both together", () => {
    const result = validateEntity(
      "designPatterns",
      pattern({
        status: "confirmed",
        focalKsas: [
          {
            label: "Plant-part vocabulary",
            competencyId: "c-plant",
            competencyModelId: "cm-plant",
            smvId: "smv-names-part",
          },
        ],
        additionalKsas: [
          {
            label: "Reading a label",
            relationship: "potentially_confounding",
            competencyId: "c-frac",
          },
        ],
      }),
      db,
      { strict: true }
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("refuses a missing competency, a missing SMV, a half pair, and a cross-model pair", () => {
    const missing = validateEntity(
      "designPatterns",
      pattern({
        focalKsas: [{ label: "Plant-part vocabulary", competencyId: "missing" }],
        additionalKsas: [
          {
            label: "Reading a label",
            relationship: "potentially_confounding",
            competencyModelId: "cm-plant",
            smvId: "no-such-smv",
          },
        ],
      }),
      db
    );
    expect(missing.valid).toBe(false);
    expect(missing.errors.join(" ")).toMatch(/competencyId 'missing'/);
    expect(missing.errors.join(" ")).toMatch(/smvId 'no-such-smv'/);

    const half = validateEntity(
      "designPatterns",
      pattern({ focalKsas: [{ label: "Plant-part vocabulary", smvId: "smv-names-part" }] }),
      db
    );
    expect(half.errors.join(" ")).toMatch(/competencyModelId and smvId together/);

    const crossed = validateEntity(
      "designPatterns",
      pattern({
        focalKsas: [
          {
            label: "Plant-part vocabulary",
            competencyId: "c-frac",
            competencyModelId: "cm-plant",
            smvId: "smv-names-part",
          },
        ],
      }),
      db
    );
    expect(crossed.errors.join(" ")).toMatch(/does not belong to competency model 'cm-plant'/);
  });

  it("warns on confirm when a focal KSA is unlinked and does not block", () => {
    const record = pattern({
      status: "confirmed",
      focalKsas: [{ label: "Plant-part vocabulary" }],
      additionalKsas: [{ label: "Reading a label", relationship: "potentially_confounding" }],
    });
    const checked = validateEntity("designPatterns", record, db, { strict: true });
    expect(checked.valid).toBe(true);

    const readiness = designPatternReadiness(record, { strict: true });
    expect(readiness.ready).toBe(true);
    expect(readiness.warnings).toEqual(focalKsaUnlinkedWarnings(record));
    expect(readiness.warnings[0]).toMatch(/Plant-part vocabulary/);
    expect(readiness.warnings[0]).toMatch(/Confirm still records the pattern/);
    expect(focalKsaLinkNote(record)).toBe("Focal KSA not linked");
    expect(
      focalKsaLinkNote({
        focalKsas: [{ label: "Plant-part vocabulary", competencyId: "c-plant" }],
      })
    ).toBe("Focal KSA linked");
  });

  it("pre-fills seeding from the focal KSA and lets an explicit body override", () => {
    const linked = {
      focalKsas: [
        {
          label: "Plant-part vocabulary",
          competencyId: "c-plant",
          competencyModelId: "cm-plant",
          smvId: "smv-names-part",
        },
      ],
    };
    expect(resolveSeedStudentModel(linked, {}, db)).toEqual({
      ok: true,
      competencyId: "c-plant",
      competencyModelId: "cm-plant",
      smvId: "smv-names-part",
    });
    expect(
      resolveSeedStudentModel(linked, { competencyId: "c-frac", competencyModelId: "", smvId: "" }, db)
    ).toEqual({
      ok: true,
      competencyId: "c-frac",
      competencyModelId: null,
      smvId: null,
    });
    expect(resolveSeedStudentModel({ focalKsas: [{ label: "Only a label" }] }, {}, db)).toEqual({
      ok: false,
      status: 400,
      error: "competencyId is required.",
    });
    expect(
      resolveSeedStudentModel(
        {
          focalKsas: [
            { label: "One", competencyId: "c-plant" },
            { label: "Two", competencyId: "c-frac" },
          ],
        },
        {},
        db
      ).error
    ).toMatch(/more than one competency/);
  });
});
