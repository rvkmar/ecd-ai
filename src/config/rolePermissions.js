// src/config/rolePermissions.js
// Role-based visibility and access control for ECD Assessment App

export const rolePermissions = {
  admin: {
    label: "System Admin",
    canView: [
      "questions",
      // `items` was absent from every role, so can(role, *, "items")
      // denied for everyone -- the Item Bank had no declared permissions
      // at all while its API accepted any authenticated caller, including
      // a student. The two are aligned now: authoring is admin/district,
      // matching the item routes' authorizeRole.
      "items",
      "competencyModels",
      "evidenceModels",
      "taskModels",
      "tasks",
      "sessions",
      "policies",
      "curricularPolicies",
      "reports",
      // D59: the staff-only teacher-report / class / district payloads.
      // `reports` stays the learner + dashboard surface every role that
      // can view reports already had. Students keep `reports` and must
      // not gain `teacherReports` — that was the examinee leak.
      "teacherReports",
      "students",
      "teachers",
      "users",
      // D48: declared for the first time. All three collections had schema
      // and lifecycle validation from Week 4-5 but no route file and no
      // entry here, so can(role, *, "qMatrixModels") denied for everyone
      // while nothing served them either -- the same asymmetry the Day 13
      // RBAC sweep found for `items`, caught this time before a route
      // shipped rather than after.
      "qMatrixModels",
      "assemblyModels",
      "compositeLibrary",
      // D62: calibration job queue. Admin authors; district may view
      // (a calibration run is a system-level measurement decision).
      "calibrationJobs",
      "announcements",
    ],
    canEdit: [
      "questions",
      "competencyModels",
      "evidenceModels",
      "taskModels",
      "items",
      "tasks",
      "policies",
      "curricularPolicies",
      "users",
      // compositeLibrary is deliberately absent: it is a compiled build
      // artifact, not an authored entity, and its router exposes no
      // generic write. Rebuilding is an admin action against the builder,
      // not an edit of the package's contents.
      "qMatrixModels",
      "assemblyModels",
      "calibrationJobs"
    ],
    canApprove: ["questions", "items"], // promote from review → confirmed
    canDelete: [
      "questions",
      "competencyModels",
      "evidenceModels",
      "taskModels",
      "items",
      "tasks",
      "policies",
      "curricularPolicies",
      "users",
      "students",
      "qMatrixModels",
      "assemblyModels",
      "calibrationJobs",
      "announcements",
    ],
    // "students" was declared in canView but never in canCreate/canDelete
    // on any role, while studentsRoutes.js accepted any authenticated
    // caller -- the RBAC sweep found this the same way it found items/
    // student being absent before. Admin-only until a real enrollment
    // workflow exists for district/teacher.
    canCreate: ["students", "calibrationJobs", "announcements"],
  },

  district: {
    label: "District User",
    canView: [
      "questions",
      "items",
      "competencyModels",
      "evidenceModels",
      "taskModels",
      "tasks",
      "sessions",
      "reports",
      "teacherReports",
      // Read-only: a Q-matrix and an assembly model are system-level
      // measurement decisions (which attributes a diagnostic model
      // estimates; when any session built on the spec may stop), not
      // local authoring. District users need to SEE the spec their
      // sessions run under without being able to change it.
      "qMatrixModels",
      "assemblyModels",
      "calibrationJobs",
      "announcements",
    ],
    canEdit: [
      "tasks",              // can create local tasks
      "taskModels",         // can clone and modify published task models
      "items"               // authors and governs bank items
    ],
    canApprove: ["questions", "items"],
    canDelete: ["tasks", "announcements"],      // local tasks + own announcements
    canCreate: ["announcements"],
    restrictions: {
      viewScope: "district",   // limits view to district data
      editableModels: "cloned", // can only edit cloned models
    },
  },

  teacher: {
    label: "Teacher",
    canView: [
      "items",
      "competencyModels",
      "evidenceModels",
      "taskModels",
      "tasks",
      "sessions",
      "reports",
      "teacherReports",
      "announcements",
    ],
    canEdit: [
      "tasks",
      "sessions"
    ],
    canCreate: [
      "tasks",
      "sessions"
    ],
    canDelete: [],
    restrictions: {
      viewScope: "school",
      modelAccess: "read-only",
      questionAccess: "active-only",
    },
  },

  // Previously missing entirely, which meant can(role, ...) fell through to
  // its `if (!r) return false` branch for every student — silently denying
  // every permission check by omission rather than by design. Students only
  // need to see their own sessions/reports; they don't author content.
  // D59: `reports` is learner feedback + the generic session report.
  // `teacherReports` is deliberately absent — a student must not fetch
  // the teacher-report payload (server: authorizeRole on those routes).
  student: {
    label: "Student",
    canView: ["sessions", "reports", "announcements"],
    canEdit: [],
    canCreate: [],
    canDelete: [],
    canApprove: [],
    restrictions: {
      viewScope: "self",
    },
  },
};

// Helper to check if a role can perform an action
export function can(role, action, entity) {
  const r = rolePermissions[role];
  if (!r) return false;
  switch (action) {
    case "view": return r.canView?.includes(entity);
    case "edit": return r.canEdit?.includes(entity);
    case "delete": return r.canDelete?.includes(entity);
    case "approve": return r.canApprove?.includes(entity);
    case "create": return r.canCreate?.includes(entity);
    default: return false;
  }
}
