// server/utils/lifecycleMatrix.js

export const STATUS = [
  "draft",
  "reviewed",
  "confirmed",
  "operational",
  "suspended",
  "archived",
];
  // 🔹 Status badge styles (use in Card header)
export const STATUS_BADGE_CLASSES = {
  draft: "bg-gray-200 text-gray-700",
  reviewed: "bg-amber-100 text-amber-700",
  confirmed: "bg-blue-100 text-blue-700",
  operational: "bg-emerald-100 text-emerald-700",
  suspended: "bg-orange-100 text-orange-700",
  archived: "bg-slate-200 text-slate-600",
};

export const TRANSITIONS = {
  draft: ["reviewed"],

  reviewed: [
    "draft",        // reviewer rejection
    "confirmed"
  ],

  confirmed: [
    "operational",
    "archived"
  ],

  operational: [
    "suspended",
    "archived"
  ],

  suspended: [
    "operational",
    "archived"
  ],

  archived: [], // terminal
};

export function canTransition(from, to) {
  if (!from || !to) return false;
  if (from === to) return true;

  const allowed = TRANSITIONS[from] || [];
  return allowed.includes(to);
}

// ------------------------------------------------------------------
// Calibration jobs (D62). A different machine from the authored-entity
// STATUS list above -- jobs are not drafted/reviewed/confirmed. Declared
// here (the D8 lesson) rather than as ad-hoc status strings in the route.
// queued -> running -> succeeded | failed
// queued -> cancelled
// failed -> queued on retry
// ------------------------------------------------------------------
export const CALIBRATION_JOB_STATUS = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
];

const CALIBRATION_JOB_TRANSITIONS = {
  queued: ["running", "cancelled"],
  running: ["succeeded", "failed"],
  failed: ["queued"],
  succeeded: [],
  cancelled: [],
};

export function canTransitionCalibrationJob(from, to) {
  if (!from || !to) return false;
  if (from === to) return true;
  const allowed = CALIBRATION_JOB_TRANSITIONS[from] || [];
  return allowed.includes(to);
}
