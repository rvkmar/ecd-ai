// server/r/__tests__/calibrationContract.test.js
// D63: ADR 0002 contract on the node side. The R twin is
// r-backend/app/tests/test-contract.R; both read the same fixtures.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  CALIBRATION_CONTRACT_VERSION,
  diagnosticParameterKeyErrors,
  validateCalibrationRequest,
  validateCalibrationResponse,
  unboxPlumberScalars,
} from "../calibrationContract.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.resolve(here, "../../../r-backend/app/tests/fixtures");

function readFix(name) {
  return JSON.parse(fs.readFileSync(path.join(FIX, name), "utf8"));
}

describe("ADR 0002 contract version is shared with R", () => {
  it("is 1.0 on both sides", () => {
    const rSrc = fs.readFileSync(
      path.resolve(here, "../../../r-backend/app/modules/contract.R"),
      "utf8"
    );
    expect(CALIBRATION_CONTRACT_VERSION).toBe("1.0");
    expect(rSrc).toMatch(/CALIBRATION_CONTRACT_VERSION\s*<-\s*"1\.0"/);
  });
});

describe("request envelope", () => {
  it("accepts the shared valid-request fixture", () => {
    expect(validateCalibrationRequest(readFix("valid-request.json"))).toEqual([]);
  });

  it("refuses a missing seed", () => {
    const body = readFix("valid-request.json");
    delete body.options.seed;
    expect(validateCalibrationRequest(body).join(" ")).toMatch(/seed/);
  });

  it("refuses an itemId order mismatch (D37 lesson)", () => {
    const body = readFix("valid-request.json");
    body.model.itemIds = ["item_a", "item_z", "item_c"];
    expect(validateCalibrationRequest(body).join(" ")).toMatch(/in order/);
  });

  it("does not treat a missing body as valid", () => {
    expect(validateCalibrationRequest(null).length).toBeGreaterThan(0);
  });

  it("accepts the committed LSAT7 request (D64)", async () => {
    const { applyNamedCalibrationFixture } = await import("../calibrationFixtures.js");
    expect(validateCalibrationRequest(applyNamedCalibrationFixture({ fixture: "lsat7" }).request)).toEqual([]);
  });

  it("accepts the committed sim10GDINA request (D66)", async () => {
    const { applyNamedCalibrationFixture } = await import("../calibrationFixtures.js");
    const body = applyNamedCalibrationFixture({ fixture: "sim10gdina" }).request;
    expect(validateCalibrationRequest(body)).toEqual([]);
    expect(body.model.family).toBe("gdina");
    expect(body.qMatrix.attributeIds).toHaveLength(3);
  });

  it("accepts the committed known-equating request (D70)", async () => {
    const { applyNamedCalibrationFixture } = await import("../calibrationFixtures.js");
    const body = applyNamedCalibrationFixture({ fixture: "known-equating" }).request;
    expect(validateCalibrationRequest(body)).toEqual([]);
    expect(body.model.family).toBe("equating");
    expect(body.forms.formX).toBe("X");
    expect(body.forms.commonItemIds).toHaveLength(6);
    expect(body.responseMatrix.personIds).toHaveLength(800);
  });

  it("accepts the committed LSAT7 item-analysis request (D77)", async () => {
    const { applyNamedCalibrationFixture } = await import("../calibrationFixtures.js");
    const body = applyNamedCalibrationFixture({ fixture: "lsat7-item-analysis" }).request;
    expect(validateCalibrationRequest(body)).toEqual([]);
    expect(body.model.family).toBe("item-analysis");
    expect(body.responseMatrix.personIds).toHaveLength(1000);
  });

  it("accepts the committed known-2pl-testinfo request (D78)", async () => {
    const { applyNamedCalibrationFixture } = await import("../calibrationFixtures.js");
    const body = applyNamedCalibrationFixture({ fixture: "known-2pl-testinfo" }).request;
    expect(validateCalibrationRequest(body)).toEqual([]);
    expect(body.model.family).toBe("test-information");
    expect(body.model.itemIds).toEqual(["Item.A", "Item.B", "Item.C"]);
    expect(body.model.parameters["Item.A"].a).toBe(1);
  });

  it("accepts additive optionMatrix/itemKeys/domains/cutScore (Unit A)", () => {
    const body = readFix("valid-request.json");
    body.optionMatrix = {
      personIds: body.responseMatrix.personIds,
      itemIds: body.model.itemIds,
      data: body.responseMatrix.personIds.map(() => body.model.itemIds.map(() => "A")),
    };
    body.itemKeys = Object.fromEntries(
      body.model.itemIds.map((id) => [
        id,
        { keyedOptionId: "A", options: [{ id: "A", label: "A", text: "keyed" }] },
      ])
    );
    body.domains = [{ id: "d1", itemIds: body.model.itemIds.slice(0, 2) }];
    body.cutScore = 2;
    expect(validateCalibrationRequest(body)).toEqual([]);
  });

  it("refuses optionMatrix row length mismatch", () => {
    const body = readFix("valid-request.json");
    body.optionMatrix = {
      personIds: body.responseMatrix.personIds,
      itemIds: body.model.itemIds,
      data: [[ "A" ]],
    };
    expect(validateCalibrationRequest(body).join(" ")).toMatch(/optionMatrix/);
  });

  it("accepts an additive frozen reportTemplate snapshot", () => {
    const body = readFix("valid-request.json");
    body.reportTemplate = {
      templateId: "prt1",
      name: "Iteman classic",
      kind: "iteman-ctt",
      audience: "psychometrician",
      chapters: ["cover", "credits"],
      flags: { tooHard: 0.2 },
      nQuantiles: 5,
      skinId: "iteman-classic",
    };
    expect(validateCalibrationRequest(body)).toEqual([]);
  });

  it("accepts IRT subtypes GRM/GPCM/PCM", () => {
    const body = readFix("valid-request.json");
    body.model.subtype = "GRM";
    expect(validateCalibrationRequest(body)).toEqual([]);
    body.model.subtype = "GPCM";
    expect(validateCalibrationRequest(body)).toEqual([]);
    body.model.subtype = "PCM";
    expect(validateCalibrationRequest(body)).toEqual([]);
  });

  it("accepts the planted MCQ item-analysis fixture", async () => {
    const { applyNamedCalibrationFixture } = await import("../calibrationFixtures.js");
    const body = applyNamedCalibrationFixture({ fixture: "planted-mcq-item-analysis" }).request;
    expect(validateCalibrationRequest(body)).toEqual([]);
    expect(body.model.family).toBe("item-analysis");
    expect(body.optionMatrix.data).toHaveLength(20);
    expect(body.itemKeys["Item.unused"].keyedOptionId).toBe("A");
    expect(body.cutScore).toBe(2);
  });

  it("accepts the committed lsat7-test-information request (D78)", async () => {
    const { applyNamedCalibrationFixture } = await import("../calibrationFixtures.js");
    const body = applyNamedCalibrationFixture({ fixture: "lsat7-test-information" }).request;
    expect(validateCalibrationRequest(body)).toEqual([]);
    expect(body.model.family).toBe("test-information");
    expect(body.responseMatrix.personIds).toHaveLength(1000);
  });
});

describe("TU15 diagnostic parameter keys", () => {
  const itemIds = ["item-a", "item-b", "item-c"];

  function accepted(observableIds, keys) {
    const request = {
      model: { family: "dina", itemIds, observableIds },
    };
    const parameters = Object.fromEntries(keys.map((key) => [key, { slip: 0.1, guess: 0.2 }]));
    expect(diagnosticParameterKeyErrors(request, parameters)).toEqual([]);
  }

  it("keys a new set by unique observable ids", () => {
    accepted(["obs-a", "obs-b", "obs-c"], ["obs-a", "obs-b", "obs-c"]);
  });

  it("keeps a legacy set on item ids when observableIds is absent", () => {
    expect(diagnosticParameterKeyErrors(
      { model: { family: "dina", itemIds } },
      { "item-a": { slip: 0.1, guess: 0.2 } }
    )).toEqual([]);
  });

  it("mixes a unique observable with a blank column and a repeated observable", () => {
    accepted(["obs-a", "", "obs-c"], ["obs-a", "item-b", "obs-c"]);
    accepted(["obs-a", "obs-a", "obs-c"], ["item-a", "item-b", "obs-c"]);
  });

  function dinaRequest(observableIds) {
    const body = readFix("valid-request.json");
    body.model = { family: "dina", itemIds: body.model.itemIds };
    body.qMatrix = {
      attributeIds: ["A1"],
      itemIds: body.model.itemIds,
      data: [[1], [1], [0]],
    };
    if (observableIds !== undefined) body.model.observableIds = observableIds;
    return body;
  }

  it("refuses a length mismatch, a non-array, and a key collision", () => {
    expect(validateCalibrationRequest(dinaRequest(["obs-a"])).join(" ")).toMatch(/length must match/);
    const named = dinaRequest();
    named.model.observableIds = { a: "obs-a" };
    expect(validateCalibrationRequest(named).join(" ")).toMatch(/must be an array/);
    expect(validateCalibrationRequest(dinaRequest(["item_b", "", "obs-c"])).join(" ")).toMatch(
      /not unique/
    );
  });

  it("accepts a dina request with no observableIds and one with a mixed vector", () => {
    expect(validateCalibrationRequest(dinaRequest())).toEqual([]);
    const mixed = dinaRequest(["obs-a", "", "obs-c"]);
    expect(validateCalibrationRequest(mixed)).toEqual([]);
    expect(diagnosticParameterKeyErrors(mixed, {
      "obs-a": { slip: 0.1, guess: 0.2 },
      item_b: { slip: 0.2, guess: 0.1 },
      "obs-c": { probabilities: [0.2, 0.9] },
    })).toEqual([]);
  });

  it("refuses parameter keys that ignore the observable ids", () => {
    const request = dinaRequest(["obs-a", "obs-b", "obs-c"]);
    expect(validateCalibrationRequest(request)).toEqual([]);
    const errors = diagnosticParameterKeyErrors(request, {
      item_a: { slip: 0.1, guess: 0.2 },
      item_b: { slip: 0.1, guess: 0.2 },
      item_c: { slip: 0.1, guess: 0.2 },
    });
    expect(errors.join(" ")).toMatch(/keyed by observable id/);
    expect(diagnosticParameterKeyErrors({ model: { family: "dina", itemIds } }, {
      "item-a": { slip: 0.1, guess: 0.2 },
    })).toEqual([]);
  });
});

describe("response envelope", () => {
  it("accepts the shared valid-response fixture", () => {
    expect(validateCalibrationResponse(readFix("valid-response.json"))).toEqual([]);
  });

  it("accepts the shared non-converged fixture as a legal response", () => {
    // A non-converged run is inspectable on the job. Ingestion, not
    // response validation, is what refuses to store it.
    expect(validateCalibrationResponse(readFix("non-converged-response.json"))).toEqual([]);
  });

  it("requires provenance fields when converged is true", () => {
    const body = readFix("valid-response.json");
    delete body.packageVersion;
    expect(validateCalibrationResponse(body).join(" ")).toMatch(/packageVersion/);
  });

  it("unboxes plumber/jsonlite length-1 scalar arrays (D64 live /health)", () => {
    const boxed = {
      status: ["healthy"],
      packages: { mirt: ["1.47"] },
      contractVersion: ["1.0"],
      converged: [true],
      sampleSize: [1000],
      parameters: { "Item.1": { a: [0.9], b: [-1.2], c: [0] } },
    };
    const plain = unboxPlumberScalars(boxed);
    expect(plain.status).toBe("healthy");
    expect(plain.packages.mirt).toBe("1.47");
    expect(plain.converged).toBe(true);
    expect(plain.sampleSize).toBe(1000);
    expect(plain.parameters["Item.1"].a).toBe(0.9);
    expect(unboxPlumberScalars({ data: [[0, 1], [1, 0]] }).data).toEqual([
      [0, 1],
      [1, 0],
    ]);
  });
});
