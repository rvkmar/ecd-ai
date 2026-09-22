// src/utils/__tests__/taskModelVariableFamily.test.js
//
// D120: fixed/varying settings project a discrete family for W31.

import { describe, it, expect } from "vitest";
import { validateEntity } from "../schema.js";
import {
  projectTaskSpecFamilySize,
  projectTaskSpecFamily,
  discreteLevelsForSetting,
} from "../taskModelVariableFamily.js";
import { BLOOM_LEVEL_VALUES } from "../ecdVocabulary.js";

const bloom = {
  id: "tmv-bloom",
  name: "Cognitive demand",
  type: "categorical",
  valueSet: "bloomLevel",
};

const register = {
  id: "tmv-register",
  name: "Scenario register",
  type: "categorical",
  possibleValues: [
    { value: "formal", label: "Formal" },
    { value: "informal", label: "Informal" },
  ],
};

const stimulus = {
  id: "tmv-stimulus",
  name: "Stimulus policy",
  type: "categorical",
  valueSet: "stimulusPolicy",
};

describe("taskModelVariableFamily projection", () => {
  it("treats omitted variation as varying over allowedValues or full set", () => {
    expect(
      discreteLevelsForSetting(
        { taskModelVariableId: "tmv-bloom", allowedValues: ["apply", "analyze"] },
        bloom
      )
    ).toEqual(["apply", "analyze"]);
    expect(discreteLevelsForSetting({ taskModelVariableId: "tmv-bloom" }, bloom)).toEqual(
      [...BLOOM_LEVEL_VALUES]
    );
  });

  it("fixed contributes one level; product yields family size", () => {
    const settings = [
      {
        taskModelVariableId: "tmv-bloom",
        variation: "varying",
        allowedValues: ["remember", "understand", "apply", "analyze", "evaluate"],
      },
      {
        taskModelVariableId: "tmv-register",
        variation: "varying",
        allowedValues: ["formal", "informal"],
      },
      {
        taskModelVariableId: "tmv-stimulus",
        variation: "fixed",
        fixedValue: "static",
      },
    ];
    const vars = [bloom, register, stimulus];
    expect(projectTaskSpecFamilySize(settings, vars)).toBe(10);
    const family = projectTaskSpecFamily(settings, vars);
    expect(family).toHaveLength(10);
    expect(family.every((row) => row.some((a) => a.value === "static"))).toBe(true);
    const bloomValues = new Set(
      family.map((row) => row.find((a) => a.taskModelVariableId === "tmv-bloom").value)
    );
    expect(bloomValues.size).toBe(5);
  });

  it("returns 0 when a fixed setting lacks a legal fixedValue", () => {
    expect(
      projectTaskSpecFamilySize(
        [{ taskModelVariableId: "tmv-bloom", variation: "fixed" }],
        [bloom]
      )
    ).toBe(0);
  });
});

describe("taskModelVariableSettings variation validation (D120)", () => {
  it("accepts fixed + fixedValue on a Bloom variable", () => {
    const tm = {
      id: "tm-one",
      status: "draft",
      locked: false,
      versionNumber: 1,
      taskModelVariableIds: ["tmv-bloom"],
      taskModelVariableSettings: [
        {
          taskModelVariableId: "tmv-bloom",
          variation: "fixed",
          fixedValue: "apply",
        },
      ],
    };
    const { valid, errors } = validateEntity(
      "taskModels",
      tm,
      { taskModelVariables: [bloom], taskModels: [] },
      { strict: false }
    );
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
  });

  it("rejects fixed without fixedValue", () => {
    const { valid, errors } = validateEntity(
      "taskModels",
      {
        id: "tm-one",
        status: "draft",
        locked: false,
        versionNumber: 1,
        taskModelVariableIds: ["tmv-bloom"],
        taskModelVariableSettings: [
          { taskModelVariableId: "tmv-bloom", variation: "fixed" },
        ],
      },
      { taskModelVariables: [bloom], taskModels: [] },
      { strict: false }
    );
    expect(valid).toBe(false);
    expect(errors.some((e) => /fixedValue is required/.test(e))).toBe(true);
  });

  it("rejects fixedValue when variation is varying", () => {
    const { valid, errors } = validateEntity(
      "taskModels",
      {
        id: "tm-one",
        status: "draft",
        locked: false,
        versionNumber: 1,
        taskModelVariableIds: ["tmv-bloom"],
        taskModelVariableSettings: [
          {
            taskModelVariableId: "tmv-bloom",
            variation: "varying",
            fixedValue: "apply",
          },
        ],
      },
      { taskModelVariables: [bloom], taskModels: [] },
      { strict: false }
    );
    expect(valid).toBe(false);
    expect(errors.some((e) => /fixedValue is only valid/.test(e))).toBe(true);
  });
});
