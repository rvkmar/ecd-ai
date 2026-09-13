// src/components/calibration/CalibrationJobStatusBadge.jsx
// Job-queue states are not the authored-entity lifecycle; do not reuse
// LifecycleStatusBadge (draft / reviewed / …).

import React from "react";

const STATUS_CLASSES = {
  queued: "bg-secondary text-secondary-foreground",
  running: "bg-primary text-primary-foreground",
  succeeded: "bg-primary/15 text-foreground",
  failed: "bg-destructive text-destructive-foreground",
  cancelled: "bg-muted text-muted-foreground",
};

export default function CalibrationJobStatusBadge({ status }) {
  const value = status || "unknown";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
        STATUS_CLASSES[value] || "bg-muted text-muted-foreground"
      }`}
    >
      {value}
    </span>
  );
}
