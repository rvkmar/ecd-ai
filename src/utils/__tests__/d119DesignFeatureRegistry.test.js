// src/utils/__tests__/d119DesignFeatureRegistry.test.js
//
// D119 exit check: Task Model design-feature enums read through the
// TMV valueSet registry path; vocabulary stays the definition; every
// level that validated before still validates unbound (D22 floor).

import { describe, it, expect } from "vitest";
import { validateEntity } from "../schema.js";
import {
  BLOOM_LEVEL_VALUES,
  REASONING_TYPE_VALUES,
  PRESENTATION_MODE_VALUES,
  RESPONSE_FORMAT_VALUES,
  STIMULUS_POLICY_VALUES,
  TMV_VALUE_SET_SOURCES,
} from "../ecdVocabulary.js";
import {
  designFeatureValues,
  designFeatureOptions,
  vocabularyValuesForDesignFeature,
  TASK_MODEL_DESIGN_FEATURE_VALUE_SETS,
} from "../taskModelDesignFeatureRegistry.js";

function draftTm(overrides = {}) {
  return {
    id: "tm-d119",
    name: "D119 TM",
    status: "draft",
    locked: false,
    versionNumber: 1,
    taskStructure: {
      presentationMode: "interactive",
      responseFormat: "selected",
      stimulusPolicy: "static",
    },
    blueprintConstraints: {
      cognitiveDemand: { bloomLevel: "apply", reasoningType: "procedural" },
    },
    ...overrides,
  };
}

describe("D119 design-feature registry path", () => {
  it("unbound options equal vocabulary (registry valueSet sources)", () => {
    for (const key of TASK_MODEL_DESIGN_FEATURE_VALUE_SETS) {
      expect(vocabularyValuesForDesignFeature(key)).toEqual(
        TMV_VALUE_SET_SOURCES[key].map((e) => e.value)
      );
      expect(designFeatureValues(key, {})).toEqual(
        vocabularyValuesForDesignFeature(key)
      );
      expect(designFeatureOptions(key, {}).map((o) => o.value)).toEqual(
        vocabularyValuesForDesignFeature(key)
      );
    }
  });

  it("preserves every pre-D119 vocabulary value on an unbound Task Model (D22)", () => {
    const db = { taskModelVariables: [], taskModels: [], evidenceModels: [] };
    for (const bloom of BLOOM_LEVEL_VALUES) {
      const { valid, errors } = validateEntity(
        "taskModels",
        draftTm({
          blueprintConstraints: {
            cognitiveDemand: { bloomLevel: bloom, reasoningType: "procedural" },
          },
        }),
        db,
        { strict: false }
      );
      expect(errors.filter((e) => /bloomLevel/.test(e))).toEqual([]);
      expect(valid || !errors.some((e) => /bloomLevel/.test(e))).toBe(true);
    }
    for (const mode of PRESENTATION_MODE_VALUES) {
      const { errors } = validateEntity(
        "taskModels",
        draftTm({
          taskStructure: {
            presentationMode: mode,
            responseFormat: "selected",
            stimulusPolicy: "static",
          },
        }),
        db,
        { strict: false }
      );
      expect(errors.filter((e) => /presentationMode/.test(e))).toEqual([]);
    }
    for (const fmt of RESPONSE_FORMAT_VALUES) {
      const { errors } = validateEntity(
        "taskModels",
        draftTm({
          taskStructure: {
            presentationMode: "interactive",
            responseFormat: fmt,
            stimulusPolicy: "static",
          },
        }),
        db,
        { strict: false }
      );
      expect(errors.filter((e) => /responseFormat/.test(e))).toEqual([]);
    }
    for (const pol of STIMULUS_POLICY_VALUES) {
      const { errors } = validateEntity(
        "taskModels",
        draftTm({
          taskStructure: {
            presentationMode: "interactive",
            responseFormat: "selected",
            stimulusPolicy: pol,
          },
        }),
        db,
        { strict: false }
      );
      expect(errors.filter((e) => /stimulusPolicy/.test(e))).toEqual([]);
    }
    for (const reason of REASONING_TYPE_VALUES) {
      const { errors } = validateEntity(
        "taskModels",
        draftTm({
          blueprintConstraints: {
            cognitiveDemand: { bloomLevel: "apply", reasoningType: reason },
          },
        }),
        db,
        { strict: false }
      );
      expect(errors.filter((e) => /reasoningType/.test(e))).toEqual([]);
    }
  });

  it("bound bloom TMV with allowedValues narrows options and schema", () => {
    const bloomVar = {
      id: "tmv-bloom",
      name: "Bloom",
      type: "categorical",
      valueSet: "bloomLevel",
    };
    const ctx = {
      taskModelVariableIds: ["tmv-bloom"],
      taskModelVariableSettings: [
        {
          taskModelVariableId: "tmv-bloom",
          variation: "varying",
          allowedValues: ["apply", "analyze"],
        },
      ],
      variables: [bloomVar],
    };
    expect(designFeatureValues("bloomLevel", ctx)).toEqual(["apply", "analyze"]);

    const db = { taskModelVariables: [bloomVar], taskModels: [], evidenceModels: [] };
    const ok = validateEntity(
      "taskModels",
      draftTm({
        taskModelVariableIds: ["tmv-bloom"],
        taskModelVariableSettings: ctx.taskModelVariableSettings,
        blueprintConstraints: {
          cognitiveDemand: { bloomLevel: "apply", reasoningType: "procedural" },
        },
      }),
      db,
      { strict: false }
    );
    expect(ok.errors.filter((e) => /bloomLevel/.test(e))).toEqual([]);

    const bad = validateEntity(
      "taskModels",
      draftTm({
        taskModelVariableIds: ["tmv-bloom"],
        taskModelVariableSettings: ctx.taskModelVariableSettings,
        blueprintConstraints: {
          cognitiveDemand: { bloomLevel: "create", reasoningType: "procedural" },
        },
      }),
      db,
      { strict: false }
    );
    expect(bad.valid).toBe(false);
    expect(bad.errors.some((e) => /bloomLevel/.test(e))).toBe(true);
  });
});
