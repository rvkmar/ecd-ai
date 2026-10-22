// Assembly Model Dashboard.
//
// Assembly Models use the full lifecycle and a lock. Confirming one
// freezes the Student Model targets, the stopping rules, and the
// selection policy. Ready to confirm counts draft and reviewed models
// that already pass that gate. A confirmed or later model is not
// counted again.

import React, { useMemo } from "react";
import { useAssemblyModels } from "@/api/queries/assemblyModels";
import { apiErrorMessage } from "@/api/apiClient";
import TwoCategoryDonutChart from "@/components/shared/charts/TwoCategoryDonutChart";
import { meetsAssemblyConfirmedGates } from "./assemblyModelReadiness";

const AUTHORING = new Set(["draft", "reviewed"]);

export function isReadyToConfirm(record = {}) {
  const status = record.status || "draft";
  if (!AUTHORING.has(status)) return false;
  return meetsAssemblyConfirmedGates(record);
}

function isAuthoring(record = {}) {
  return AUTHORING.has(record.status || "draft");
}

export default function AssemblyModelDashboard() {
  const { data: assemblyModels = [], isLoading, error: queryError } = useAssemblyModels();
  const error = queryError
    ? apiErrorMessage(queryError, "Failed to fetch assembly models.")
    : null;

  const stats = useMemo(() => {
    let confirmed = 0;
    let operational = 0;
    let draft = 0;
    let readyToConfirm = 0;
    let authoring = 0;
    let locked = 0;

    for (const record of assemblyModels) {
      const status = record.status || "draft";
      if (status === "confirmed") confirmed += 1;
      if (status === "operational") operational += 1;
      if (status === "draft") draft += 1;
      if (isReadyToConfirm(record)) readyToConfirm += 1;
      if (isAuthoring(record)) authoring += 1;
      if (record.locked) locked += 1;
    }

    return {
      total: assemblyModels.length,
      confirmed,
      operational,
      draft,
      readyToConfirm,
      authoring,
      later: assemblyModels.length - authoring,
      locked,
      unlocked: assemblyModels.length - locked,
    };
  }, [assemblyModels]);

  if (isLoading) {
    return <div className="p-8 text-sm text-gray-600">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="p-8 text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="p-8 space-y-16 max-w-7xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Assembly Model Dashboard</h1>
        <p className="text-sm text-gray-500">
          Assembly Models follow the full lifecycle. Confirming one locks the
          Student Model targets, the stopping rules, and the selection policy.
          Ready to confirm counts draft and reviewed models that already meet
          that gate.
        </p>
      </div>

      <section
        aria-label="Assembly Model counts"
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
          subtitle="Draft and reviewed models, against models that are confirmed, operational, suspended, or archived."
          labelA="Draft or reviewed"
          labelB="Confirmed or later"
          valueA={stats.authoring}
          valueB={stats.later}
          countLabel="Assembly Models counted"
        />
        <TwoCategoryDonutChart
          title="Structural lock"
          subtitle="A confirmed, operational, or suspended Assembly Model is locked."
          labelA="Locked"
          labelB="Unlocked"
          valueA={stats.locked}
          valueB={stats.unlocked}
          countLabel="Assembly Models counted"
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
