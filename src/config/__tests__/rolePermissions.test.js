// src/config/__tests__/rolePermissions.test.js
//
// Pure unit tests for can(role, action, entity). The `student` role was
// entirely missing before the Phase 1 fix — can("student", ...) fell
// through to the `if (!r) return false` branch for every check, silently
// denying by omission rather than by design. This file locks in that it
// now exists with the intended (narrow, view-only) permissions.

import { describe, it, expect } from "vitest";
import { can, rolePermissions } from "../rolePermissions.js";

describe("student role", () => {
  it("exists", () => {
    expect(rolePermissions.student).toBeDefined();
  });

  it("can view sessions and reports", () => {
    expect(can("student", "view", "sessions")).toBe(true);
    expect(can("student", "view", "reports")).toBe(true);
  });

  it("cannot view teacher-report payloads (D59 examinee leak)", () => {
    expect(can("student", "view", "teacherReports")).toBe(false);
    expect(can("teacher", "view", "teacherReports")).toBe(true);
    expect(can("district", "view", "teacherReports")).toBe(true);
    expect(can("admin", "view", "teacherReports")).toBe(true);
  });

  it("cannot view authoring entities", () => {
    expect(can("student", "view", "questions")).toBe(false);
    expect(can("student", "view", "competencyModels")).toBe(false);
  });

  it("cannot edit, create, delete, or approve anything", () => {
    expect(can("student", "edit", "sessions")).toBe(false);
    expect(can("student", "create", "sessions")).toBe(false);
    expect(can("student", "delete", "sessions")).toBe(false);
    expect(can("student", "approve", "questions")).toBe(false);
  });
});

describe("existing roles are unaffected by the student addition", () => {
  it("admin can still edit/delete/approve questions", () => {
    expect(can("admin", "edit", "questions")).toBe(true);
    expect(can("admin", "delete", "questions")).toBe(true);
    expect(can("admin", "approve", "questions")).toBe(true);
  });

  it("teacher can create/edit sessions and tasks but not delete them", () => {
    expect(can("teacher", "create", "sessions")).toBe(true);
    expect(can("teacher", "edit", "tasks")).toBe(true);
    expect(can("teacher", "delete", "tasks")).toBe(false);
  });

  it("district can approve questions and edit tasks/taskModels", () => {
    expect(can("district", "approve", "questions")).toBe(true);
    expect(can("district", "edit", "taskModels")).toBe(true);
  });
});

describe("calibrationJobs (D65 console RBAC)", () => {
  it("admin can view, create, edit, and delete jobs", () => {
    expect(can("admin", "view", "calibrationJobs")).toBe(true);
    expect(can("admin", "create", "calibrationJobs")).toBe(true);
    expect(can("admin", "edit", "calibrationJobs")).toBe(true);
    expect(can("admin", "delete", "calibrationJobs")).toBe(true);
  });

  it("district can view jobs and cannot write them", () => {
    expect(can("district", "view", "calibrationJobs")).toBe(true);
    // district has no canCreate list, so create is falsy by omission.
    expect(can("district", "create", "calibrationJobs")).toBeFalsy();
    expect(can("district", "edit", "calibrationJobs")).toBeFalsy();
    expect(can("district", "delete", "calibrationJobs")).toBeFalsy();
  });

  it("teacher and student cannot see the console entity", () => {
    expect(can("teacher", "view", "calibrationJobs")).toBe(false);
    expect(can("student", "view", "calibrationJobs")).toBe(false);
  });
});

describe("presentationModels (D113 authoring RBAC)", () => {
  it("admin can view, edit, and delete presentation models", () => {
    expect(can("admin", "view", "presentationModels")).toBe(true);
    expect(can("admin", "edit", "presentationModels")).toBe(true);
    expect(can("admin", "delete", "presentationModels")).toBe(true);
  });

  it("district can view and cannot write them", () => {
    expect(can("district", "view", "presentationModels")).toBe(true);
    expect(can("district", "edit", "presentationModels")).toBeFalsy();
    expect(can("district", "delete", "presentationModels")).toBeFalsy();
  });

  it("teacher and student cannot see the entity", () => {
    expect(can("teacher", "view", "presentationModels")).toBe(false);
    expect(can("student", "view", "presentationModels")).toBe(false);
  });
});

describe("templates (D126 authoring RBAC)", () => {
  it("admin can view, edit, and delete templates", () => {
    expect(can("admin", "view", "templates")).toBe(true);
    expect(can("admin", "edit", "templates")).toBe(true);
    expect(can("admin", "delete", "templates")).toBe(true);
  });

  it("district can view and cannot write them", () => {
    expect(can("district", "view", "templates")).toBe(true);
    expect(can("district", "edit", "templates")).toBeFalsy();
    expect(can("district", "delete", "templates")).toBeFalsy();
  });

  it("teacher and student cannot see the entity", () => {
    expect(can("teacher", "view", "templates")).toBe(false);
    expect(can("student", "view", "templates")).toBe(false);
  });
});

describe("designPatterns (D131 authoring RBAC)", () => {
  it("admin can view, edit, and delete design patterns", () => {
    expect(can("admin", "view", "designPatterns")).toBe(true);
    expect(can("admin", "edit", "designPatterns")).toBe(true);
    expect(can("admin", "delete", "designPatterns")).toBe(true);
  });

  it("district can view and cannot write them", () => {
    expect(can("district", "view", "designPatterns")).toBe(true);
    expect(can("district", "edit", "designPatterns")).toBeFalsy();
    expect(can("district", "delete", "designPatterns")).toBeFalsy();
  });

  it("teacher and student cannot see the entity", () => {
    expect(can("teacher", "view", "designPatterns")).toBe(false);
    expect(can("student", "view", "designPatterns")).toBe(false);
  });
});

describe("domainAnalyses (D141 authoring RBAC)", () => {
  it("admin can view, edit, and delete a Domain Analysis", () => {
    expect(can("admin", "view", "domainAnalyses")).toBe(true);
    expect(can("admin", "edit", "domainAnalyses")).toBe(true);
    expect(can("admin", "delete", "domainAnalyses")).toBe(true);
  });

  it("district can view and cannot write one", () => {
    expect(can("district", "view", "domainAnalyses")).toBe(true);
    expect(can("district", "edit", "domainAnalyses")).toBeFalsy();
    expect(can("district", "delete", "domainAnalyses")).toBeFalsy();
  });

  it("teacher and student cannot see the entity", () => {
    expect(can("teacher", "view", "domainAnalyses")).toBe(false);
    expect(can("student", "view", "domainAnalyses")).toBe(false);
  });
});

describe("taskModelVariables (D116 library RBAC)", () => {
  it("admin can view, edit, and delete Task Model Variables", () => {
    expect(can("admin", "view", "taskModelVariables")).toBe(true);
    expect(can("admin", "edit", "taskModelVariables")).toBe(true);
    expect(can("admin", "delete", "taskModelVariables")).toBe(true);
  });

  it("district can view and edit them, and cannot delete them", () => {
    expect(can("district", "view", "taskModelVariables")).toBe(true);
    expect(can("district", "edit", "taskModelVariables")).toBe(true);
    expect(can("district", "delete", "taskModelVariables")).toBeFalsy();
  });

  it("teacher can view and cannot write them", () => {
    expect(can("teacher", "view", "taskModelVariables")).toBe(true);
    expect(can("teacher", "edit", "taskModelVariables")).toBeFalsy();
  });

  it("student cannot see the entity", () => {
    expect(can("student", "view", "taskModelVariables")).toBe(false);
  });
});

describe("studentModelRecords", () => {
  it("is readable by every role and is not authored", () => {
    for (const role of ["admin", "district", "teacher", "student"]) {
      expect(can(role, "view", "studentModelRecords")).toBe(true);
      expect(can(role, "edit", "studentModelRecords")).toBeFalsy();
      expect(can(role, "delete", "studentModelRecords")).toBeFalsy();
      expect(can(role, "create", "studentModelRecords")).toBeFalsy();
    }
  });
});

describe("deliveryModels", () => {
  it("admin can view, edit, and delete delivery models", () => {
    expect(can("admin", "view", "deliveryModels")).toBe(true);
    expect(can("admin", "edit", "deliveryModels")).toBe(true);
    expect(can("admin", "delete", "deliveryModels")).toBe(true);
  });

  it("district can view and cannot write them", () => {
    expect(can("district", "view", "deliveryModels")).toBe(true);
    expect(can("district", "edit", "deliveryModels")).toBeFalsy();
    expect(can("district", "delete", "deliveryModels")).toBeFalsy();
  });

  it("teacher and student cannot see the entity", () => {
    expect(can("teacher", "view", "deliveryModels")).toBe(false);
    expect(can("student", "view", "deliveryModels")).toBe(false);
  });
});

describe("unknown input", () => {
  it("returns false for a role that doesn't exist", () => {
    expect(can("superuser", "view", "sessions")).toBe(false);
  });

  it("returns false for a null/undefined role", () => {
    expect(can(null, "view", "sessions")).toBe(false);
    expect(can(undefined, "view", "sessions")).toBe(false);
  });

  it("returns false for an unrecognized action", () => {
    expect(can("admin", "teleport", "sessions")).toBe(false);
  });
});
