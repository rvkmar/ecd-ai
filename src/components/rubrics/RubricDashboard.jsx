// Rubric Dashboard. Rubrics are draft or confirmed.
// Ready follows rubricReadiness with strict: true. A confirmed rubric
// also needs at least one exemplar, which that check enforces.
// In use means an evidence model cites the id on an evaluation
// procedure or a phase, or a design pattern lists it.

import React, { useMemo } from "react";
import { useRubrics } from "@/api/queries/rubrics";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import { apiErrorMessage } from "@/api/apiClient";
import TwoCategoryDonutChart from "@/components/shared/charts/TwoCategoryDonutChart";
import {
  criteriaBucket,
  hasExemplar,
  isRubricInUse,
  levelBucket,
  rubricReadinessValue,
  statusText,
} from "./rubricUsage";

export default function RubricDashboard() {
  const rubricsQuery = useRubrics();
  const evidenceQuery = useEvidenceModels();
  const patternsQuery = useDesignPatterns();

  const rubrics = rubricsQuery.data || [];
  const context = useMemo(
    () => ({
      evidenceModels: evidenceQuery.data || [],
      designPatterns: patternsQuery.data || [],
    }),
    [evidenceQuery.data, patternsQuery.data]
  );

  const loading = [rubricsQuery, evidenceQuery, patternsQuery].some((query) => query.isLoading);
  const queryError = rubricsQuery.error || evidenceQuery.error || patternsQuery.error;
  const error = queryError ? apiErrorMessage(queryError, "Failed to fetch rubrics.") : null;

  const stats = useMemo(() => {
    let draft = 0;
    let confirmed = 0;
    let ready = 0;
    let inUse = 0;
    let withExemplars = 0;
    const byCriteria = { 0: 0, 1: 0, 2: 0, 3: 0, "4+": 0 };
    const byLevels = { 0: 0, 2: 0, 4: 0, other: 0 };

    for (const record of rubrics) {
      if (statusText(record) === "confirmed") confirmed += 1;
      else draft += 1;
      if (rubricReadinessValue(record) === "ready") ready += 1;
      if (isRubricInUse(record, context)) inUse += 1;
      if (hasExemplar(record)) withExemplars += 1;
      byCriteria[criteriaBucket(record)] += 1;
      byLevels[levelBucket(record)] += 1;
    }

    return {
      total: rubrics.length,
      draft,
      confirmed,
      ready,
      notReady: rubrics.length - ready,
      inUse,
      unused: rubrics.length - inUse,
      withExemplars,
      withoutExemplars: rubrics.length - withExemplars,
      byCriteria,
      byLevels,
    };
  }, [rubrics, context]);

  if (loading) {
    return <div className="p-8 text-sm text-gray-600">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="p-8 text-sm text-red-600">{error}</div>;
  }

  const criteriaCards = [
    { label: "1 criterion", value: stats.byCriteria[1] },
    { label: "2 criteria", value: stats.byCriteria[2] },
    { label: "3 criteria", value: stats.byCriteria[3] },
    { label: "4 or more criteria", value: stats.byCriteria["4+"] },
  ];
  if (stats.byCriteria[0] > 0) {
    criteriaCards.push({ label: "No criteria", value: stats.byCriteria[0] });
  }

  const levelCards = [
    { label: "2 levels", value: stats.byLevels[2] },
    { label: "4 levels", value: stats.byLevels[4] },
  ];
  if (stats.byLevels[0] > 0) levelCards.push({ label: "No levels", value: stats.byLevels[0] });
  if (stats.byLevels.other > 0) levelCards.push({ label: "Other level counts", value: stats.byLevels.other });

  return (
    <div className="p-8 space-y-16 max-w-7xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Rubric Dashboard</h1>
        <p className="text-sm text-gray-500">
          Rubrics are draft or confirmed. Ready means the record passes the
          rubric readiness check. A confirmed rubric needs at least one
          exemplar. In use means an evidence model cites the rubric on an
          evaluation procedure or a phase, or a design pattern lists it.
        </p>
      </div>

      <section aria-label="Rubric counts" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Draft" value={stats.draft} />
        <StatCard label="Confirmed" value={stats.confirmed} />
        <StatCard label="Ready" value={stats.ready} />
        <StatCard label="Not ready" value={stats.notReady} />
        <StatCard label="In use" value={stats.inUse} />
        <StatCard label="Unused" value={stats.unused} />
      </section>

      <section aria-label="Counts by criteria" className="space-y-4">
        <h2 className="text-lg font-semibold">Counts by criteria</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {criteriaCards.map((card) => (
            <StatCard key={card.label} label={card.label} value={card.value} />
          ))}
        </div>
      </section>

      <section aria-label="Counts by levels" className="space-y-4">
        <h2 className="text-lg font-semibold">Counts by levels</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {levelCards.map((card) => (
            <StatCard key={card.label} label={card.label} value={card.value} />
          ))}
        </div>
      </section>

      <section aria-label="Exemplar coverage" className="space-y-4">
        <h2 className="text-lg font-semibold">Counts by exemplar</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard label="With exemplars" value={stats.withExemplars} />
          <StatCard label="Without exemplars" value={stats.withoutExemplars} />
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <TwoCategoryDonutChart
          title="Draft vs confirmed"
          subtitle="How many rubrics are still drafts, and how many are confirmed."
          labelA="Draft"
          labelB="Confirmed"
          valueA={stats.draft}
          valueB={stats.confirmed}
          countLabel="Rubrics counted"
        />
        <TwoCategoryDonutChart
          title="Ready vs not ready"
          subtitle="Ready means the record passes the rubric readiness check, including an exemplar when the rubric is confirmed."
          labelA="Ready"
          labelB="Not ready"
          valueA={stats.ready}
          valueB={stats.notReady}
          countLabel="Rubrics counted"
        />
        <TwoCategoryDonutChart
          title="In use vs unused"
          subtitle="In use means an evidence model cites the rubric on a procedure or a phase, or a design pattern lists it."
          labelA="In use"
          labelB="Unused"
          valueA={stats.inUse}
          valueB={stats.unused}
          countLabel="Rubrics counted"
        />
        <TwoCategoryDonutChart
          title="Exemplar coverage"
          subtitle="Whether at least one level carries an exemplar sentence."
          labelA="With exemplars"
          labelB="Without exemplars"
          valueA={stats.withExemplars}
          valueB={stats.withoutExemplars}
          countLabel="Rubrics counted"
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
