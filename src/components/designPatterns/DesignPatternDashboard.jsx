// src/components/designPatterns/DesignPatternDashboard.jsx
//
// Design Pattern Dashboard. Patterns are draft or confirmed only.
// There is no lock and no version. Confirming a pattern does not
// approve student delivery (ADR 0009).

import React, { useMemo } from "react";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import { apiErrorMessage } from "@/api/apiClient";
import TwoCategoryDonutChart from "@/components/shared/charts/TwoCategoryDonutChart";
import { designPatternReadiness } from "@/utils/designPatternReadiness";

function isDraftReadyToConfirm(record = {}) {
  if ((record.status || "draft") !== "draft") return false;
  return designPatternReadiness(record, { strict: true }).ready;
}

function isConfirmed(record = {}) {
  return record.status === "confirmed";
}

function citesDomainAnalysis(record = {}) {
  return String(record.domainAnalysisId || "").trim() !== "";
}

export default function DesignPatternDashboard() {
  const { data: patterns = [], isLoading, error: queryError } = useDesignPatterns();
  const error = queryError
    ? apiErrorMessage(queryError, "Failed to fetch design patterns.")
    : null;

  const stats = useMemo(() => {
    let confirmed = 0;
    let draft = 0;
    let readyToConfirm = 0;
    let linked = 0;

    for (const record of patterns) {
      if (isConfirmed(record)) confirmed += 1;
      else if ((record.status || "draft") === "draft") draft += 1;
      if (isDraftReadyToConfirm(record)) readyToConfirm += 1;
      if (citesDomainAnalysis(record)) linked += 1;
    }

    return {
      total: patterns.length,
      confirmed,
      draft,
      readyToConfirm,
      linked,
      notLinked: patterns.length - linked,
    };
  }, [patterns]);

  if (isLoading) {
    return <div className="p-8 text-sm text-gray-600">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="p-8 text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="p-8 space-y-16 max-w-7xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Design Pattern Dashboard</h1>
        <p className="text-sm text-gray-500">
          Patterns stay draft or confirmed. Confirming a pattern does not approve
          student delivery.
        </p>
      </div>

      <section
        aria-label="Design pattern counts"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
      >
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Confirmed" value={stats.confirmed} />
        <StatCard label="Draft" value={stats.draft} />
        <StatCard label="Ready to confirm" value={stats.readyToConfirm} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <TwoCategoryDonutChart
          title="Draft vs confirmed"
          subtitle="How many patterns are still drafts, and how many are confirmed."
          labelA="Draft"
          labelB="Confirmed"
          valueA={stats.draft}
          valueB={stats.confirmed}
          countLabel="Patterns counted"
        />
        <TwoCategoryDonutChart
          title="Domain Analysis link"
          subtitle="Whether the pattern cites a Domain Analysis."
          labelA="Linked to Domain Analysis"
          labelB="Not linked"
          valueA={stats.linked}
          valueB={stats.notLinked}
          countLabel="Patterns counted"
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
