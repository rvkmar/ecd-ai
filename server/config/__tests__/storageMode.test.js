import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  assertProductionStorageBoundary,
  describeStorageMode,
} from "../storageMode.js";

describe("D106 production storage boundary (ADR 0007)", () => {
  it("allows DB_MODE=json outside production", () => {
    expect(() =>
      assertProductionStorageBoundary({
        NODE_ENV: "development",
        DB_MODE: "json",
      })
    ).not.toThrow();
    expect(() =>
      assertProductionStorageBoundary({
        NODE_ENV: "test",
        DB_MODE: "json",
      })
    ).not.toThrow();
  });

  it("refuses DB_MODE=json in production", () => {
    expect(() =>
      assertProductionStorageBoundary({
        NODE_ENV: "production",
        DB_MODE: "json",
        MONGO_URI: "mongodb://mongo:27017/ecd_assessment",
      })
    ).toThrow(/DB_MODE/);
  });

  it("refuses unknown DB_MODE in production", () => {
    expect(() =>
      assertProductionStorageBoundary({
        NODE_ENV: "production",
        DB_MODE: "sqlite",
        MONGO_URI: "mongodb://mongo:27017/ecd_assessment",
      })
    ).toThrow(/DB_MODE/);
  });

  it("requires MONGO_URI when production + mongo", () => {
    expect(() =>
      assertProductionStorageBoundary({
        NODE_ENV: "production",
        DB_MODE: "mongo",
        MONGO_URI: "",
      })
    ).toThrow(/MONGO_URI/);
    expect(() =>
      assertProductionStorageBoundary({
        NODE_ENV: "production",
        DB_MODE: "mongo",
      })
    ).toThrow(/MONGO_URI/);
  });

  it("allows production with DB_MODE=mongo and MONGO_URI", () => {
    expect(() =>
      assertProductionStorageBoundary({
        NODE_ENV: "production",
        DB_MODE: "mongo",
        MONGO_URI: "mongodb://mongo:27017/ecd_assessment",
      })
    ).not.toThrow();
    expect(() =>
      assertProductionStorageBoundary({
        NODE_ENV: "production",
        MONGO_URI: "mongodb://mongo:27017/ecd_assessment",
      })
    ).not.toThrow();
  });

  it("describeStorageMode marks harness only when not production", () => {
    expect(describeStorageMode({ NODE_ENV: "test", DB_MODE: "json" })).toEqual({
      mode: "json",
      production: false,
      harnessAllowed: true,
    });
    expect(
      describeStorageMode({ NODE_ENV: "production", DB_MODE: "mongo" })
    ).toEqual({
      mode: "mongo",
      production: true,
      harnessAllowed: false,
    });
  });

  it("compose node service pins DB_MODE=mongo", () => {
    const compose = fs.readFileSync(
      path.resolve("docker-compose.yml"),
      "utf8"
    );
    const nodeIdx = compose.indexOf("\n  node:");
    const next = compose.indexOf("\n  mongo:", nodeIdx + 1);
    const block = compose.slice(nodeIdx, next === -1 ? undefined : next);
    expect(block).toMatch(/DB_MODE=mongo/);
    expect(block).not.toMatch(/DB_MODE=json/);
  });
});
