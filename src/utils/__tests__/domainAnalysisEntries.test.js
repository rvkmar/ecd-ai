import { describe, it, expect } from "vitest";
import { validateEntity } from "../schema.js";
import {
  assignDomainAnalysisEntryIds,
  backfillDomainAnalysisEntryIds,
  collectDomainEntryIds,
} from "../domainAnalysisEntries.js";

const analysis = {
  id: "da-plant",
  name: "Plant structure",
  status: "draft",
  valuedKnowledge: [{ id: "vk-plant", label: "Leaf, root, stem, and flower" }],
  taskFeatures: [{ id: "tf-plant", label: "A labelled diagram of a flowering plant" }],
};

const other = {
  id: "da-other",
  name: "Other",
  status: "draft",
  valuedKnowledge: [{ id: "vk-other", label: "Something else" }],
  taskFeatures: [{ id: "tf-other", label: "Another feature" }],
};

function pattern(extra = {}) {
  return {
    id: "dp-plant",
    name: "Name a plant part",
    status: "draft",
    summary: "Names the part.",
    rationale: "Naming is the claim.",
    domainAnalysisId: "da-plant",
    focalKsas: [{ label: "Plant-part vocabulary" }],
    characteristicFeatures: [{ label: "One part is called out" }],
    variableFeatures: [{ label: "Which part", taskModelVariableId: "tmv-diagram" }],
    ...extra,
  };
}

describe("domain analysis statement ids", () => {
  it("accepts a label-only statement and assigns an id without replacing a later edit", () => {
    const draft = validateEntity(
      "domainAnalyses",
      {
        name: "Plant structure",
        status: "draft",
        valuedKnowledge: [{ label: "Leaf, root, stem, and flower" }],
        taskFeatures: [{ label: "A labelled diagram" }],
      },
      null,
      { strict: false }
    );
    expect(draft.valid).toBe(true);

    const record = {
      valuedKnowledge: [{ label: "Leaf, root, stem, and flower" }],
      taskFeatures: [{ label: "A labelled diagram" }],
      valuedWork: [{ label: "Name a plant part" }],
    };
    const used = new Set();
    assignDomainAnalysisEntryIds(record, null, used);
    const knowledgeId = record.valuedKnowledge[0].id;
    const featureId = record.taskFeatures[0].id;
    expect(knowledgeId).toMatch(/^vk/);
    expect(featureId).toMatch(/^tf/);
    expect(record.valuedWork[0].id).toBeUndefined();

    const renamed = {
      valuedKnowledge: [{ id: knowledgeId, label: "The jobs of the parts" }],
      taskFeatures: [{ label: "A labelled diagram" }],
    };
    assignDomainAnalysisEntryIds(renamed, record, used);
    expect(renamed.valuedKnowledge[0].id).toBe(knowledgeId);
    expect(renamed.taskFeatures[0].id).toBe(featureId);

    const again = {
      valuedKnowledge: [{ label: "Leaf, root, stem, and flower" }],
      taskFeatures: [{ label: "A labelled diagram" }],
    };
    assignDomainAnalysisEntryIds(again, record, collectDomainEntryIds({ domainAnalyses: [record] }));
    expect(again.valuedKnowledge[0].id).toBe(knowledgeId);
    expect(again.taskFeatures[0].id).toBe(featureId);
  });

  it("refuses a duplicated statement id", () => {
    const result = validateEntity(
      "domainAnalyses",
      {
        name: "Plant structure",
        status: "draft",
        valuedKnowledge: [
          { id: "vk-plant", label: "Parts" },
          { id: "vk-plant", label: "Parts again" },
        ],
      },
      null,
      { strict: false }
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/duplicated/);
  });

  it("backfills missing ids once and leaves labels in place", () => {
    const db = {
      domainAnalyses: [
        {
          id: "da-plant",
          valuedKnowledge: [{ label: "Parts" }],
          taskFeatures: [{ id: "tf-keep", label: "Diagram" }],
        },
      ],
    };
    const changed = backfillDomainAnalysisEntryIds(db);
    expect(changed).toEqual(["da-plant"]);
    expect(db.domainAnalyses[0].valuedKnowledge[0].label).toBe("Parts");
    expect(db.domainAnalyses[0].valuedKnowledge[0].id).toMatch(/^vk/);
    expect(db.domainAnalyses[0].taskFeatures[0].id).toBe("tf-keep");
    expect(backfillDomainAnalysisEntryIds(db)).toEqual([]);
  });
});

describe("domain analysis citations", () => {
  const db = {
    domainAnalyses: [analysis, other],
    taskModelVariables: [{ id: "tmv-diagram", name: "Plant diagram" }],
  };

  it("lets a label-only KSA and feature stay valid", () => {
    const result = validateEntity("designPatterns", pattern(), db, { strict: false });
    expect(result.valid).toBe(true);
  });

  it("accepts a citation on the pattern's own analysis and refuses one from another", () => {
    const ok = validateEntity(
      "designPatterns",
      pattern({
        focalKsas: [{ label: "Plant-part vocabulary", valuedKnowledgeId: "vk-plant" }],
        additionalKsas: [
          {
            label: "Reading a label",
            relationship: "potentially_confounding",
            valuedKnowledgeId: "vk-plant",
          },
        ],
        characteristicFeatures: [{ label: "One part is called out", taskFeatureId: "tf-plant" }],
        variableFeatures: [
          { label: "Which part", taskModelVariableId: "tmv-diagram", taskFeatureId: "tf-plant" },
        ],
      }),
      db,
      { strict: false }
    );
    expect(ok.valid).toBe(true);

    const wrong = validateEntity(
      "designPatterns",
      pattern({
        focalKsas: [{ label: "Plant-part vocabulary", valuedKnowledgeId: "vk-other" }],
      }),
      db,
      { strict: false }
    );
    expect(wrong.valid).toBe(false);
    expect(wrong.errors.join(" ")).toMatch(/not on domain analysis 'da-plant'/);
  });

  it("names a missing citation and an ambiguous one when no analysis is set", () => {
    const missing = validateEntity(
      "designPatterns",
      pattern({
        domainAnalysisId: "",
        characteristicFeatures: [{ label: "One part is called out", taskFeatureId: "tf-missing" }],
      }),
      db,
      { strict: false }
    );
    expect(missing.errors.join(" ")).toMatch(/was not found/);

    const shared = {
      domainAnalyses: [
        analysis,
        {
          ...other,
          taskFeatures: [{ id: "tf-plant", label: "Same id elsewhere" }],
        },
      ],
      taskModelVariables: db.taskModelVariables,
    };
    const ambiguous = validateEntity(
      "designPatterns",
      pattern({
        domainAnalysisId: "",
        characteristicFeatures: [{ label: "One part is called out", taskFeatureId: "tf-plant" }],
      }),
      shared,
      { strict: false }
    );
    expect(ambiguous.errors.join(" ")).toMatch(/more than one Domain Analysis/);
  });

  it("scopes a task model variable citation when that variable cites an analysis", () => {
    const ok = validateEntity(
      "taskModelVariables",
      {
        id: "tmv-diagram",
        name: "Plant diagram",
        type: "categorical",
        possibleValues: [
          { value: "leaf", label: "Leaf" },
          { value: "root", label: "Root" },
        ],
        domainAnalysisId: "da-plant",
        taskFeatureId: "tf-plant",
      },
      db
    );
    expect(ok.valid).toBe(true);

    const wrong = validateEntity(
      "taskModelVariables",
      {
        id: "tmv-diagram",
        name: "Plant diagram",
        type: "categorical",
        possibleValues: [
          { value: "leaf", label: "Leaf" },
          { value: "root", label: "Root" },
        ],
        domainAnalysisId: "da-plant",
        taskFeatureId: "tf-other",
      },
      db
    );
    expect(wrong.valid).toBe(false);
    expect(wrong.errors.join(" ")).toMatch(/not on domain analysis 'da-plant'/);

    const plain = validateEntity(
      "taskModelVariables",
      {
        id: "tmv-bloom",
        name: "Bloom demand",
        type: "categorical",
        valueSet: "bloomLevel",
      },
      db
    );
    expect(plain.valid).toBe(true);
  });

  it("accepts a task feature id on a blueprint characteristic feature", () => {
    const ok = validateEntity(
      "taskModels",
      {
        id: "tm1",
        blueprintConstraints: {
          characteristicFeatures: [{ label: "One part is called out", taskFeatureId: "tf-plant" }],
        },
      },
      db,
      { strict: false }
    );
    expect(ok.errors.join(" ")).not.toMatch(/taskFeatureId/);

    const missing = validateEntity(
      "taskModels",
      {
        id: "tm1",
        blueprintConstraints: {
          characteristicFeatures: [{ label: "One part is called out", taskFeatureId: "tf-missing" }],
        },
      },
      db,
      { strict: false }
    );
    expect(missing.errors.join(" ")).toMatch(/taskFeatureId 'tf-missing' was not found/);
  });
});
