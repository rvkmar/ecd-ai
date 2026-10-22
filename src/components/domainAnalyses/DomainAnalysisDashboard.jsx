// src/components/domainAnalyses/DomainAnalysisDashboard.jsx
//
// Domain Analysis Dashboard. Analyses are draft or confirmed only.
// There is no lock and no version. Confirming an analysis does not
// approve student delivery (ADR 0010).
//
// A Q-matrix link is qMatrixModels.domainAnalysisId. An analysis does
// not store a qMatrixId. A design-pattern link is the same shape.

import React, { useMemo } from "react";
import { useDomainAnalyses } from "@/api/queries/domainAnalyses";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import { useQMatrixModels } from "@/api/queries/qMatrixModels";
import { apiErrorMessage } from "@/api/apiClient";
import TwoCategoryDonutChart from "@/components/shared/charts/TwoCategoryDonutChart";
import { domainAnalysisReadiness } from "@/utils/domainAnalysisReadiness";

function isDraftReadyToConfirm(record = {}) {
  if ((record.status || "draft") !== "draft") return false;
  return domainAnalysisReadiness(record, { strict: true }).ready;
}

function isConfirmed(record = {}) {
  return record.status === "confirmed";
}

function citesAnalysis(record = {}) {
  return String(record.domainAnalysisId || "").trim() !== "";
}

export default function DomainAnalysisDashboard() {
  const analysesQuery = useDomainAnalyses();
  const patternsQuery = useDesignPatterns();
  const matricesQuery = useQMatrixModels();

  const analyses = analysesQuery.data || [];
  const patterns = patternsQuery.data || [];
  const qMatrices = matricesQuery.data || [];

  const loading = analysesQuery.isLoading || patternsQuery.isLoading || matricesQuery.isLoading;
  const queryError = analysesQuery.error || patternsQuery.error || matricesQuery.error;
  const error = queryError
    ? apiErrorMessage(queryError, "Failed to fetch domain analyses.")
    : null;

  const stats = useMemo(() => {
    let confirmed = 0;
    let draft = 0;
    let readyToConfirm = 0;
    let linkedToQMatrix = 0;

    const citedByMatrix = new Set(
      qMatrices.map((row) => String(row.domainAnalysisId || "").trim()).filter(Boolean)
    );

    for (const record of analyses) {
      if (isConfirmed(record)) confirmed += 1;
      else if ((record.status || "draft") === "draft") draft += 1;
      if (isDraftReadyToConfirm(record)) readyToConfirm += 1;
      if (record.id && citedByMatrix.has(record.id)) linkedToQMatrix += 1;
    }

    const linkedPatterns = patterns.filter(citesAnalysis).length;

    return {
      total: analyses.length,
      confirmed,
      draft,
      readyToConfirm,
      linkedToQMatrix,
      linkedPatterns,
      notLinkedPatterns: patterns.length - linkedPatterns,
    };
  }, [analyses, patterns, qMatrices]);

  if (loading) {
    return <div className="p-8 text-sm text-gray-600">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="p-8 text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="p-8 space-y-16 max-w-7xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Domain Analysis Dashboard</h1>
        <p className="text-sm text-gray-500">
          Analyses stay draft or confirmed. Confirming an analysis does not approve
          student delivery.
        </p>
      </div>

      <section
        aria-label="Domain analysis counts"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6"
      >
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Confirmed" value={stats.confirmed} />
        <StatCard label="Draft" value={stats.draft} />
        <StatCard label="Ready to confirm" value={stats.readyToConfirm} />
        <StatCard label="Linked to Q-matrix" value={stats.linkedToQMatrix} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <TwoCategoryDonutChart
          title="Draft vs confirmed"
          subtitle="How many analyses are still drafts, and how many are confirmed."
          labelA="Draft"
          labelB="Confirmed"
          valueA={stats.draft}
          valueB={stats.confirmed}
          countLabel="Analyses counted"
        />
        <TwoCategoryDonutChart
          title="Design Pattern link"
          subtitle="Whether a design pattern stores a domainAnalysisId."
          labelA="Linked to Design Patterns"
          labelB="Not linked"
          valueA={stats.linkedPatterns}
          valueB={stats.notLinkedPatterns}
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
