// D81 — addressable shell at /admin/psychometrics. Also a Delivery tab
// on AdminPage so the surface is not URL-only (same pattern as D65).

import React from "react";
import { Link } from "react-router-dom";

import PsychometricsDashboard from "@/components/psychometrics/PsychometricsDashboard";

export default function PsychometricsPage() {
  return (
    <div className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="space-y-2">
          <p className="text-sm">
            <Link to="/admin" className="text-primary hover:underline">
              ← Admin Control Center
            </Link>
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Psychometrics</h1>
          <p className="text-sm text-muted-foreground">
            Admin dashboards for R analytics artefacts. Every figure carries
            provenance — job, package version, sample, and source.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow">
          <PsychometricsDashboard />
        </div>
      </div>
    </div>
  );
}
