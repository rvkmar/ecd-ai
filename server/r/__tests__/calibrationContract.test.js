// server/r/__tests__/calibrationContract.test.js
// D63: ADR 0002 contract on the node side. The R twin is
// r-backend/app/tests/test-contract.R; both read the same fixtures.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  CALIBRATION_CONTRACT_VERSION,
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
