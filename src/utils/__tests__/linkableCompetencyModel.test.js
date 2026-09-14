import { describe, expect, it } from "vitest";
import { isLinkableCompetencyModel } from "../schema.js";

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
