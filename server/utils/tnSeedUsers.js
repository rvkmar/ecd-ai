/**
 * Tamil Nadu deployment seed roster (local auth, SSO-ready profiles).
 *
 * - ≥5 admins (admin1…admin5) — walk accounts preserved
 * - 38 district officers (one per TN district)
 * - 1 demo teacher + 1 demo student per district with EMIS / UDISE on profile
 * - Legacy walk accounts dist1 / teach1 / stud1 kept and bound to Chennai
 *
 * All share the same temporary password (SEED_TEMP_PASSWORD or WalkPass!2026).
 * authProvider: "local" so a future OIDC path can refuse password login for
 * federated accounts without breaking these.
 */

import {
  TAMIL_NADU_DISTRICTS,
  TAMIL_NADU_STATE,
  demoStudentEmis,
  demoTeacherEmis,
  demoUdiseForDistrict,
} from "../data/tamilNaduDistricts.js";

export const DEFAULT_SEED_TEMP_PASSWORD = "WalkPass!2026";

export function resolveSeedTempPassword(env = process.env) {
  return (
    env.SEED_TEMP_PASSWORD ||
    env.SEED_ADMIN_PASSWORD ||
    DEFAULT_SEED_TEMP_PASSWORD
  );
}

/**
 * @returns {Array<{
 *   username: string,
 *   role: string,
 *   email: string,
 *   password: string,
 *   authProvider: "local",
 *   mustChangePassword: true,
 *   profile: object
 * }>}
 */
export function buildTamilNaduSeedUsers(password = resolveSeedTempPassword()) {
  const users = [];

  for (let i = 1; i <= 5; i++) {
    users.push({
      username: `admin${i}`,
      role: "admin",
      email: `admin${i}@ecd.tn.gov.in`,
      password,
      authProvider: "local",
      mustChangePassword: true,
      profile: {
        name: `State Admin ${i}`,
        state: TAMIL_NADU_STATE,
      },
    });
  }

  // Legacy walk district account — same password, Chennai-scoped.
  const chennai = TAMIL_NADU_DISTRICTS.find((d) => d.slug === "chennai");
  users.push({
    username: "dist1",
    role: "district",
    email: "dist1@ecd.tn.gov.in",
    password,
    authProvider: "local",
    mustChangePassword: true,
    profile: {
      name: `${chennai.name} District (legacy dist1)`,
      districtId: chennai.id,
      state: TAMIL_NADU_STATE,
    },
  });

  for (const d of TAMIL_NADU_DISTRICTS) {
    users.push({
      username: `dist-${d.slug}`,
      role: "district",
      email: `dist-${d.slug}@ecd.tn.gov.in`,
      password,
      authProvider: "local",
      mustChangePassword: true,
      profile: {
        name: `${d.name} District Officer`,
        districtId: d.id,
        state: TAMIL_NADU_STATE,
      },
    });

    const teacherEmis = demoTeacherEmis(d);
    const udise = demoUdiseForDistrict(d);
    users.push({
      username: `teach-${d.slug}`,
      role: "teacher",
      email: `teach-${d.slug}@ecd.tn.gov.in`,
      password,
      authProvider: "local",
      mustChangePassword: true,
      profile: {
        name: `Teacher ${d.name}`,
        designation: "BT Assistant",
        subject: "Mathematics",
        emisId: teacherEmis,
        udiseId: udise,
        districtId: d.id,
        state: TAMIL_NADU_STATE,
      },
    });

    const studentEmis = demoStudentEmis(d);
    users.push({
      username: `stud-${d.slug}`,
      role: "student",
      email: `stud-${d.slug}@ecd.tn.gov.in`,
      password,
      authProvider: "local",
      mustChangePassword: true,
      profile: {
        name: `Student ${d.name}`,
        emisId: studentEmis,
        grade: "Class 8",
        districtId: d.id,
        state: TAMIL_NADU_STATE,
      },
    });
  }

  // Legacy walk teacher / student — EMIS/UDISE populated for login-by-id tests.
  users.push({
    username: "teach1",
    role: "teacher",
    email: "teach1@ecd.tn.gov.in",
    password,
    authProvider: "local",
    mustChangePassword: true,
    profile: {
      name: "Walk Teacher",
      designation: "BT Assistant",
      subject: "Science",
      emisId: "TN-TCH-WALK-001",
      udiseId: demoUdiseForDistrict(chennai, 99),
      districtId: chennai.id,
      state: TAMIL_NADU_STATE,
    },
  });
  users.push({
    username: "stud1",
    role: "student",
    email: "stud1@ecd.tn.gov.in",
    password,
    authProvider: "local",
    mustChangePassword: true,
    profile: {
      name: "Walk Student",
      emisId: "TN-STU-WALK-001",
      grade: "Class 8",
      districtId: chennai.id,
      state: TAMIL_NADU_STATE,
    },
  });

  return users;
}

export function countSeedByRole(users = buildTamilNaduSeedUsers("x")) {
  return users.reduce((acc, u) => {
    acc[u.role] = (acc[u.role] || 0) + 1;
    return acc;
  }, {});
}
