import { describe, it, expect } from "vitest";
import {
  frozenScoringContext,
  chooseSubmitParameterBinding,
} from "../parameterSourceResolution.js";
import { calibratedIrtParams } from "../evidenceAccumulation.js";
import { __testing__ as selectionTesting } from "../activitySelection.js";

const { resolveContinuousParameters } = selectionTesting;

describe("frozenScoringContext", () => {
  it("is unfrozen when the session has no tagged responses for that EM", () => {
    expect(frozenScoringContext({ responses: [] }, "em1")).toEqual({
      frozenSource: null,
      frozenParameterSetId: null,
    });
  });

  it("freezes to pilot from the first tagged response", () => {
    expect(
      frozenScoringContext(
        {
          responses: [
            { evidenceModelId: "em1", parameterSource: "pilot", pilotParams: { a: 1, b: 0 } },
          ],
        },
        "em1"
      )
    ).toEqual({ frozenSource: "pilot", frozenParameterSetId: null });
  });

  it("freezes to the opening parameter set, not a later mix", () => {
    expect(
      frozenScoringContext(
        {
          responses: [
            { evidenceModelId: "em1", parameterSource: "calibrated", parameterSetId: "ps1" },
          ],
        },
        "em1"
      )
    ).toEqual({ frozenSource: "calibrated", frozenParameterSetId: "ps1" });
  });

  it("refuses a session that already mixed sources", () => {
    const freeze = frozenScoringContext(
      {
        responses: [
          { evidenceModelId: "em1", parameterSource: "pilot" },
          { evidenceModelId: "em1", parameterSource: "calibrated", parameterSetId: "ps1" },
        ],
      },
      "em1"
    );
    expect(freeze.error).toMatch(/mixed parameter sources/);
  });
});

describe("chooseSubmitParameterBinding", () => {
  const irtItem = {
    id: "item1",
    evidenceModelId: "em1",
    psychometrics: { irtParams: { a: 1, b: 0.2 } },
  };

  it("prefers calibrated on the first response of a new session", () => {
    const binding = chooseSubmitParameterBinding({
      family: "irt",
      calibratedParameterSetId: "ps1",
      item: irtItem,
    });
    expect(binding).toEqual({
      parameterSource: "calibrated",
      parameterSetId: "ps1",
      pilotParams: null,
    });
  });

  it("stays on pilot after ingest when frozen to pilot", () => {
    const binding = chooseSubmitParameterBinding({
      family: "irt",
      calibratedParameterSetId: "ps-new",
      item: irtItem,
      freeze: { frozenSource: "pilot", frozenParameterSetId: null },
    });
    expect(binding.parameterSource).toBe("pilot");
    expect(binding.parameterSetId).toBeNull();
    expect(binding.pilotParams).toEqual({ a: 1, b: 0.2 });
  });

  it("stays on the frozen calibrated set when the active set has moved", () => {
    const binding = chooseSubmitParameterBinding({
      family: "irt",
      calibratedParameterSetId: "ps2",
      item: irtItem,
      freeze: { frozenSource: "calibrated", frozenParameterSetId: "ps1" },
    });
    expect(binding).toEqual({
      parameterSource: "calibrated",
      parameterSetId: "ps1",
      pilotParams: null,
    });
  });
});

describe("calibratedIrtParams — D50 keying", () => {
  it("uses the observable key when two items share an observation", () => {
    const set = { parameters: { o1: { a: 1.5, b: 0 }, itemA: { a: 9, b: 9 }, itemB: { a: 8, b: 8 } } };
    expect(calibratedIrtParams(set, { observableId: "o1", itemId: "itemA" }).params).toEqual({ a: 1.5, b: 0 });
    expect(calibratedIrtParams(set, { observableId: "o1", itemId: "itemB" }).params).toEqual({ a: 1.5, b: 0 });
  });

  it("falls back to itemId when the set was keyed like an R job", () => {
    const set = { parameters: { Item_1: { a: 1.1, b: -0.3 } } };
    expect(calibratedIrtParams(set, { observableId: "o1", itemId: "Item_1" })).toEqual({
      params: { a: 1.1, b: -0.3 },
      keyedBy: "itemId",
    });
  });
});

describe("selection lookup honouring freeze", () => {
  it("stays on pilot params after a calibrated set appears", () => {
    const evidenceModel = {
      id: "em1",
      statisticalModels: [{
        id: "sm1",
        active: true,
        type: "irt",
        activeParameterSetId: "ps1",
        parameterSets: [{ parameterSetId: "ps1", parameters: { o1: { a: 2, b: -1 } } }],
      }],
    };
    const item = { id: "item1", psychometrics: { irtParams: { a: 1, b: 0.5 } } };
    const mine = resolveContinuousParameters(
      "o1",
      evidenceModel,
      item,
      { frozenSource: "pilot", frozenParameterSetId: null }
    );
    expect(mine.parameterSource).toBe("pilot");
    expect(mine.params).toEqual({ a: 1, b: 0.5 });
  });

  it("keeps the opening calibrated set, not the newly active one", () => {
    const evidenceModel = {
      id: "em1",
      statisticalModels: [{
        id: "sm1",
        active: true,
        type: "irt",
        activeParameterSetId: "ps2",
        parameterSets: [
          { parameterSetId: "ps1", parameters: { o1: { a: 1, b: 0 } } },
          { parameterSetId: "ps2", parameters: { o1: { a: 3, b: -2 } } },
        ],
      }],
    };
    const item = { id: "item1", psychometrics: { irtParams: { a: 1, b: 0.5 } } };
    const mine = resolveContinuousParameters(
      "o1",
      evidenceModel,
      item,
      { frozenSource: "calibrated", frozenParameterSetId: "ps1" }
    );
    expect(mine.parameterSource).toBe("calibrated");
    expect(mine.parameterSetId).toBe("ps1");
    expect(mine.params).toEqual({ a: 1, b: 0 });
  });
});
