import { describe, expect, it } from "vitest";
import { canArchiveCompetencyModel, isLinkableCompetencyModel } from "../schema.js";

describe("isLinkableCompetencyModel", () => {
  const locked = { id: "cm1", locked: true };

  it("accepts confirmed, operational, and suspended locked models", () => {
    expect(isLinkableCompetencyModel({ ...locked, status: "confirmed" })).toBe(true);
    expect(isLinkableCompetencyModel({ ...locked, status: "operational" })).toBe(true);
    expect(isLinkableCompetencyModel({ ...locked, status: "suspended" })).toBe(true);
  });

  it("refuses draft, reviewed, archived, unlocked, and missing records", () => {
    expect(isLinkableCompetencyModel({ ...locked, status: "draft" })).toBe(false);
    expect(isLinkableCompetencyModel({ ...locked, status: "reviewed" })).toBe(false);
    expect(isLinkableCompetencyModel({ ...locked, status: "archived" })).toBe(false);
    expect(isLinkableCompetencyModel({ id: "cm1", locked: false, status: "operational" })).toBe(
      false
    );
    expect(isLinkableCompetencyModel(null)).toBe(false);
  });
});

describe("canArchiveCompetencyModel", () => {
  const locked = { id: "cm1", locked: true };

  it("allows confirmed, operational, and suspended locked models", () => {
    expect(canArchiveCompetencyModel({ ...locked, status: "confirmed" })).toBe(true);
    expect(canArchiveCompetencyModel({ ...locked, status: "operational" })).toBe(true);
    expect(canArchiveCompetencyModel({ ...locked, status: "suspended" })).toBe(true);
  });

  it("refuses draft, reviewed, archived, and unlocked models", () => {
    expect(canArchiveCompetencyModel({ ...locked, status: "draft" })).toBe(false);
    expect(canArchiveCompetencyModel({ ...locked, status: "reviewed" })).toBe(false);
    expect(canArchiveCompetencyModel({ ...locked, status: "archived" })).toBe(false);
    expect(canArchiveCompetencyModel({ id: "cm1", locked: false, status: "confirmed" })).toBe(
      false
    );
  });
});
