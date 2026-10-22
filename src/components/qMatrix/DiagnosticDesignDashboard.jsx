// Diagnostic Design Dashboard.
//
// A diagnostic design is a Q-matrix on the full lifecycle, with a lock.
// Confirming one freezes the attributes and the item cells. Ready to
// confirm counts draft and reviewed designs that already pass that gate.
// A confirmed or later design is not counted again.

import React, { useMemo } from "react";
import { useQMatrixModels } from "@/api/queries/qMatrixModels";
import { apiErrorMessage } from "@/api/apiClient";
import TwoCategoryDonutChart from "@/components/shared/charts/TwoCategoryDonutChart";
import { meetsDiagnosticDesignConfirmedGates } from "./diagnosticDesignReadiness";

const AUTHORING = new Set(["draft", "reviewed"]);

export function isReadyToConfirm(record = {}) {
  const status = record.status || "draft";
  if (!AUTHORING.has(status)) return false;
  return meetsDiagnosticDesignConfirmedGates(record);
}

function isAuthoring(record = {}) {
  return AUTHORING.has(record.status || "draft");
}

export default function DiagnosticDesignDashboard() {
  const { data: designs = [], isLoading, error: queryError } = useQMatrixModels();
  const error = queryError
    ? apiErrorMessage(queryError, "Failed to fetch diagnostic designs.")
    : null;

  const stats = useMemo(() => {
    let confirmed = 0;
    let operational = 0;
    let draft = 0;
    let readyToConfirm = 0;
    let authoring = 0;
    let locked = 0;

    for (const record of designs) {
      const status = record.status || "draft";
      if (status === "confirmed") confirmed += 1;
      if (status === "operational") operational += 1;
      if (status === "draft") draft += 1;
      if (isReadyToConfirm(record)) readyToConfirm += 1;
      if (isAuthoring(record)) authoring += 1;
      if (record.locked) locked += 1;
    }

    return {
      total: designs.length,
      confirmed,
      operational,
      draft,
      readyToConfirm,
      authoring,
      later: designs.length - authoring,
      locked,
      unlocked: designs.length - locked,
    };
  }, [designs]);

  if (isLoading) {
    return <div className="p-8 text-sm text-gray-600">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="p-8 text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="p-8 space-y-16 max-w-7xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Diagnostic Design Dashboard</h1>
        <p className="text-sm text-gray-500">
          Diagnostic designs follow the full lifecycle. Confirming one locks
          the binary Student Model attributes and the items that require them.
          Ready to confirm counts draft and reviewed designs that already meet
          that gate.
        </p>
      </div>

      <section
        aria-label="Diagnostic Design counts"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6"
      >
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Confirmed" value={stats.confirmed} />
        <StatCard label="Operational" value={stats.operational} />
        <StatCard label="Draft" value={stats.draft} />
        <StatCard label="Ready to confirm" value={stats.readyToConfirm} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <TwoCategoryDonutChart
          title="Authoring vs later"
          subtitle="Draft and reviewed designs, against designs that are confirmed, operational, suspended, or archived."
          labelA="Draft or reviewed"
          labelB="Confirmed or later"
          valueA={stats.authoring}
          valueB={stats.later}
          countLabel="Diagnostic designs counted"
        />
        <TwoCategoryDonutChart
          title="Structural lock"
          subtitle="A confirmed, operational, or suspended diagnostic design is locked."
          labelA="Locked"
          labelB="Unlocked"
          valueA={stats.locked}
          valueB={stats.unlocked}
          countLabel="Diagnostic designs counted"
        />
      </section>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-white rounded-2xl shadow p-6">
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="text-3xl font-bold mt-2">{value}</div>
    </div>
  );
}
