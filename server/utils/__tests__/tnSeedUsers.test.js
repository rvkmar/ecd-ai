// @vitest-environment node
import { describe, it, expect } from "vitest";
import { TAMIL_NADU_DISTRICTS } from "../../data/tamilNaduDistricts.js";
import {
  buildTamilNaduSeedUsers,
  countSeedByRole,
  DEFAULT_SEED_TEMP_PASSWORD,
} from "../tnSeedUsers.js";
import {
  findUserByLoginIdentifier,
  assertPasswordLoginAllowed,
} from "../../auth/localIdentity.js";

describe("Tamil Nadu district registry", () => {
  it("lists exactly 38 districts with unique ids and slugs", () => {
    expect(TAMIL_NADU_DISTRICTS).toHaveLength(38);
    const ids = TAMIL_NADU_DISTRICTS.map((d) => d.id);
    const slugs = TAMIL_NADU_DISTRICTS.map((d) => d.slug);
    expect(new Set(ids).size).toBe(38);
    expect(new Set(slugs).size).toBe(38);
    expect(slugs).toContain("chennai");
    expect(slugs).toContain("mayiladuthurai");
  });
});

describe("TN seed roster", () => {
  const users = buildTamilNaduSeedUsers(DEFAULT_SEED_TEMP_PASSWORD);
  const counts = countSeedByRole(users);

  it("seeds at least 5 admins and 38 district officers", () => {
    expect(counts.admin).toBeGreaterThanOrEqual(5);
    expect(counts.district).toBeGreaterThanOrEqual(38);
    expect(users.some((u) => u.username === "admin1")).toBe(true);
    expect(users.some((u) => u.username === "admin5")).toBe(true);
    expect(users.some((u) => u.username === "dist-chennai")).toBe(true);
  });

  it("gives every teacher EMIS + UDISE and every student EMIS", () => {
    const teachers = users.filter((u) => u.role === "teacher");
    const students = users.filter((u) => u.role === "student");
    expect(teachers.length).toBeGreaterThanOrEqual(38);
    expect(students.length).toBeGreaterThanOrEqual(38);
    for (const t of teachers) {
      expect(t.profile.emisId).toMatch(/^TN-TCH-/);
      expect(t.profile.udiseId).toMatch(/^\d{11}$/);
      expect(t.profile.districtId).toMatch(/^tn-/);
      expect(t.profile.state).toBe("Tamil Nadu");
    }
    for (const s of students) {
      expect(s.profile.emisId).toMatch(/^TN-STU-/);
      expect(s.profile.districtId).toMatch(/^tn-/);
    }
  });

  it("uses the shared temporary password and local authProvider", () => {
    expect(users.every((u) => u.password === DEFAULT_SEED_TEMP_PASSWORD)).toBe(true);
    expect(users.every((u) => u.authProvider === "local")).toBe(true);
    expect(users.every((u) => u.mustChangePassword === true)).toBe(true);
  });

  it("keeps emisId and udiseId unique across the roster", () => {
    const emis = users.map((u) => u.profile?.emisId).filter(Boolean);
    const udise = users.map((u) => u.profile?.udiseId).filter(Boolean);
    expect(new Set(emis).size).toBe(emis.length);
    expect(new Set(udise).size).toBe(udise.length);
  });
});

describe("local identity / SSO seam", () => {
  const users = [
    {
      username: "teach-chennai",
      role: "teacher",
      password: "hash",
      authProvider: "local",
      profile: { emisId: "TN-TCH-CHENNAI-001", udiseId: "33030100101" },
    },
    {
      username: "federated.teacher",
      role: "teacher",
      authProvider: "oidc",
      profile: { emisId: "TN-TCH-OIDC-001" },
    },
  ];

  it("resolves login by username, EMIS, or UDISE", () => {
    expect(findUserByLoginIdentifier(users, "teach-chennai")?.username).toBe(
      "teach-chennai"
    );
    expect(findUserByLoginIdentifier(users, "TN-TCH-CHENNAI-001")?.username).toBe(
      "teach-chennai"
    );
    expect(findUserByLoginIdentifier(users, "33030100101")?.username).toBe(
      "teach-chennai"
    );
  });

  it("allows password login for local accounts only", () => {
    expect(assertPasswordLoginAllowed(users[0]).ok).toBe(true);
    const refused = assertPasswordLoginAllowed(users[1]);
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/single sign-on/i);
  });
});
