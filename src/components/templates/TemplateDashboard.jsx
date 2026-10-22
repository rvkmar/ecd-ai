// src/components/templates/TemplateDashboard.jsx
//
// Template Dashboard. Templates are draft or confirmed only.
// There is no lock and no version. Confirming a template records the
// four bindings. It does not generate items and it does not approve
// student delivery.

import React, { useMemo } from "react";
import { useTemplates } from "@/api/queries/templates";
import { apiErrorMessage } from "@/api/apiClient";
import TwoCategoryDonutChart from "@/components/shared/charts/TwoCategoryDonutChart";
import { templateReadiness } from "@/utils/templateReadiness";

function isDraftReadyToConfirm(record = {}) {
  if ((record.status || "draft") !== "draft") return false;
  return templateReadiness(record, { strict: true }).ready;
}

function isConfirmed(record = {}) {
  return record.status === "confirmed";
}

function citesDesignPattern(record = {}) {
  return String(record.designPatternId || "").trim() !== "";
}

export default function TemplateDashboard() {
  const { data: templates = [], isLoading, error: queryError } = useTemplates();
  const error = queryError
    ? apiErrorMessage(queryError, "Failed to fetch templates.")
    : null;

  const stats = useMemo(() => {
    let confirmed = 0;
    let draft = 0;
    let readyToConfirm = 0;
    let linked = 0;

    for (const record of templates) {
      if (isConfirmed(record)) confirmed += 1;
      else if ((record.status || "draft") === "draft") draft += 1;
      if (isDraftReadyToConfirm(record)) readyToConfirm += 1;
      if (citesDesignPattern(record)) linked += 1;
    }

    return {
      total: templates.length,
      confirmed,
      draft,
      readyToConfirm,
      linked,
      notLinked: templates.length - linked,
    };
  }, [templates]);

  if (isLoading) {
    return <div className="p-8 text-sm text-gray-600">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="p-8 text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="p-8 space-y-16 max-w-7xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Template Dashboard</h1>
        <p className="text-sm text-gray-500">
          Templates stay draft or confirmed. Confirming a template records the
          four bindings. It does not generate items, and it does not approve
          student delivery.
        </p>
      </div>

      <section
        aria-label="Template counts"
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
          subtitle="How many templates are still drafts, and how many are confirmed."
          labelA="Draft"
          labelB="Confirmed"
          valueA={stats.draft}
          valueB={stats.confirmed}
          countLabel="Templates counted"
        />
        <TwoCategoryDonutChart
          title="Design Pattern link"
          subtitle="Whether the template cites a Design Pattern. The citation is optional, and Confirm does not require it."
          labelA="Linked to a Design Pattern"
          labelB="Not linked"
          valueA={stats.linked}
          valueB={stats.notLinked}
          countLabel="Templates counted"
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
