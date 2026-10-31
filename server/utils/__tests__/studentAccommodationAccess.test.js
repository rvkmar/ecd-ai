import { describe, it, expect } from "vitest";
import {
  staffActorForAccess,
  staffMayAccessStudent,
  studentMayViewOwnAccommodations,
} from "../studentAccommodationAccess.js";

const chennai = {
  id: "stu-c",
  name: "Pat",
  districtId: "tn-chennai",
  schoolId: "sch-1",
  classId: "6A",
};

describe("staffMayAccessStudent", () => {
  it("lets admin through and refuses a student role", () => {
    expect(staffMayAccessStudent({ role: "admin" }, chennai)).toBe(true);
    expect(staffMayAccessStudent({ role: "student", username: "stu-c" }, chennai)).toBe(false);
    expect(staffMayAccessStudent({ role: "teacher" }, { id: "bare", name: "No scope" })).toBe(false);
  });

  it("matches district, then school, then class", () => {
    const district = { role: "district", districtId: "tn-chennai" };
    expect(staffMayAccessStudent(district, chennai)).toBe(true);
    expect(staffMayAccessStudent({ role: "district", districtId: "tn-madurai" }, chennai)).toBe(false);
    expect(staffMayAccessStudent(district, { id: "x", districtId: "tn-chennai" })).toBe(true);

    const school = { role: "teacher", districtId: "tn-chennai", schoolId: "sch-1" };
    expect(staffMayAccessStudent(school, chennai)).toBe(true);
    expect(staffMayAccessStudent({ ...school, schoolId: "sch-2" }, chennai)).toBe(false);

    const klass = { role: "teacher", districtId: "tn-chennai", schoolId: "sch-1", classIds: ["6A"] };
    expect(staffMayAccessStudent(klass, chennai)).toBe(true);
    expect(staffMayAccessStudent(klass, { ...chennai, id: "stu-7", classId: "7B" })).toBe(false);
    expect(staffMayAccessStudent(klass, { ...chennai, classId: null })).toBe(false);
  });

  it("lets a teacher without a school claim use the district", () => {
    const teacher = { role: "teacher", districtId: "tn-chennai" };
    expect(staffMayAccessStudent(teacher, chennai)).toBe(true);
    expect(staffMayAccessStudent(teacher, { ...chennai, districtId: "tn-madurai", schoolId: "sch-m" })).toBe(false);
  });
});

describe("staffActorForAccess", () => {
  it("reads class from the stored profile when the token has none", () => {
    const actor = staffActorForAccess(
      { username: "teach1", role: "teacher", districtId: "tn-chennai", schoolId: "sch-1" },
      {
        users: [{
          username: "teach1",
          role: "teacher",
          profile: { districtId: "tn-chennai", schoolId: "sch-1", classId: "6A" },
        }],
      }
    );
    expect(actor.classIds).toEqual(["6A"]);
    expect(actor.schoolId).toBe("sch-1");
  });
});

describe("studentMayViewOwnAccommodations", () => {
  it("matches id or username and refuses a peer", () => {
    expect(studentMayViewOwnAccommodations({ role: "student", username: "stu-c" }, chennai)).toBe(true);
    expect(studentMayViewOwnAccommodations(
      { role: "student", username: "stud1" },
      { id: "stu-c", username: "stud1" }
    )).toBe(true);
    expect(studentMayViewOwnAccommodations({ role: "student", username: "other" }, chennai)).toBe(false);
    expect(studentMayViewOwnAccommodations({ role: "teacher", username: "stu-c" }, chennai)).toBe(false);
  });
});
