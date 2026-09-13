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
});
