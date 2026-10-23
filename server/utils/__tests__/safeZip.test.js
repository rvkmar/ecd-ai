import { describe, it, expect } from "vitest";
import { unzipSafe, zipFiles, ZipError } from "../safeZip.js";

describe("safeZip", () => {
  it("round-trips stored JSON files", () => {
    const zip = zipFiles({
      "policies.json": '[{"name":"Fixed"}]',
      "nested/items.json": "[]",
    });
    const files = unzipSafe(zip);
    expect(files.map((file) => file.name).sort()).toEqual([
      "nested/items.json",
      "policies.json",
    ]);
    expect(files.find((file) => file.name === "policies.json").data.toString()).toBe(
      '[{"name":"Fixed"}]'
    );
  });

  it("rejects a path that escapes the archive", () => {
    const zip = zipFiles({ "ok.json": "[]" });
    const from = Buffer.from("ok.json");
    const to = Buffer.from("../a.js");
    expect(from.length).toBe(to.length);
    const patched = Buffer.from(zip);
    let replaced = 0;
    let offset = 0;
    while (offset < patched.length) {
      const at = patched.indexOf(from, offset);
      if (at === -1) break;
      to.copy(patched, at);
      replaced += 1;
      offset = at + to.length;
    }
    expect(replaced).toBeGreaterThan(0);
    expect(() => unzipSafe(patched)).toThrow(/escapes the archive/);
  });

  it("rejects an entry that expands too far", () => {
    const zip = zipFiles({ "zeros.json": "0".repeat(200_000) });
    expect(() => unzipSafe(zip)).toThrow(ZipError);
    expect(() => unzipSafe(zip)).toThrow(/expands too far/);
  });

  it("rejects too many entries", () => {
    const files = {};
    for (let i = 0; i < 101; i++) files[`f${i}.json`] = "[]";
    expect(() => zipFiles(files)).toThrow(/more than 100/);
  });

  it("rejects a truncated buffer", () => {
    expect(() => unzipSafe(Buffer.from("not a zip"))).toThrow(ZipError);
  });
});
