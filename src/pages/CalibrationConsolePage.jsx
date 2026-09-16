// src/pages/CalibrationConsolePage.jsx
// Addressable console at /admin/calibration (and /district/calibration
// read-only). The Admin Control Center also embeds the same console as
// a tab so the surface is not URL-only.

import React from "react";
import { Link } from "react-router-dom";

import CalibrationConsole from "@/components/calibration/CalibrationConsole";

export default function CalibrationConsolePage({ readOnly = false }) {
  const home = readOnly ? "/district" : "/admin";
  const homeLabel = readOnly ? "District Dashboard" : "Admin Control Center";

  return (
    <div className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="space-y-2">
          <p className="text-sm">
            <Link to={home} className="text-primary hover:underline">
              ← {homeLabel}
            </Link>
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Parameter estimation</h1>
          <p className="text-sm text-muted-foreground">
            Start, watch, inspect, and ingest a calibration job. R stays on
            the job queue — never on a session path.
            {readOnly ? " This view is read-only." : ""}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow">
          <CalibrationConsole readOnly={readOnly} />
        </div>
      </div>
    </div>
  );
}
