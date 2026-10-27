// Delivery model dashboard. Draft or confirmed. Ready follows
// deliveryModelReadiness. In use means a session cites the id.

import React, { useMemo } from "react";
import { useDeliveryModels, useSessionsForDeliveryModels } from "@/api/queries/deliveryModels";
import { useCompetencyModels } from "@/api/queries/competencies";
import { useAssemblyModels } from "@/api/queries/assemblyModels";
import { usePolicies } from "@/api/queries/policies";
import { usePresentationModels } from "@/api/queries/presentationModels";
import { apiErrorMessage } from "@/api/apiClient";
import TwoCategoryDonutChart from "@/components/shared/charts/TwoCategoryDonutChart";
import { isDeliveryModelInUse, readinessOf, statusText } from "./deliveryModelUsage";

export default function DeliveryModelDashboard() {
  const modelsQuery = useDeliveryModels();
  const sessionsQuery = useSessionsForDeliveryModels();
  const studentQuery = useCompetencyModels();
  const assemblyQuery = useAssemblyModels();
  const policiesQuery = usePolicies();
  const presentationQuery = usePresentationModels();

  const queries = [modelsQuery, sessionsQuery, studentQuery, assemblyQuery, policiesQuery, presentationQuery];
  const loading = queries.some((query) => query.isLoading);
  const queryError = queries.find((query) => query.error)?.error;

  const models = modelsQuery.data || [];
  const lists = useMemo(
    () => ({
      deliveryModels: models,
      sessions: sessionsQuery.data || [],
      competencyModels: studentQuery.data || [],
      assemblyModels: assemblyQuery.data || [],
      policies: policiesQuery.data || [],
      presentationModels: presentationQuery.data || [],
    }),
    [models, sessionsQuery.data, studentQuery.data, assemblyQuery.data, policiesQuery.data, presentationQuery.data]
  );

  const stats = useMemo(() => {
    let draft = 0;
    let confirmed = 0;
    let ready = 0;
    let inUse = 0;
    for (const record of models) {
      if (statusText(record) === "confirmed") confirmed += 1;
      else draft += 1;
      if (readinessOf(record, lists) === "ready") ready += 1;
      if (isDeliveryModelInUse(record, lists.sessions)) inUse += 1;
    }
    return {
      total: models.length,
      draft,
      confirmed,
      ready,
      notReady: models.length - ready,
      inUse,
      unused: models.length - inUse,
    };
  }, [models, lists]);

  if (loading) {
    return <div className="p-8 text-sm text-gray-600">Loading dashboard...</div>;
  }

  if (queryError) {
    return (
      <div className="p-8 text-sm text-red-600">
        {apiErrorMessage(queryError, "Failed to fetch delivery models.")}
      </div>
    );
  }

  return (
    <div className="p-8 space-y-16 max-w-7xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Delivery Model Dashboard</h1>
        <p className="text-sm text-gray-500">
          A delivery model binds one student model, one assembly model, one
          selection policy, an optional presentation override, and the
          administration rules. Ready means confirm would accept the record.
          In use means a session cites it.
        </p>
      </div>

      <section aria-label="Delivery model counts" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Draft" value={stats.draft} />
        <StatCard label="Confirmed" value={stats.confirmed} />
        <StatCard label="Ready" value={stats.ready} />
        <StatCard label="Not ready" value={stats.notReady} />
        <StatCard label="In use" value={stats.inUse} />
        <StatCard label="Unused" value={stats.unused} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <TwoCategoryDonutChart
          title="Draft vs confirmed"
          subtitle="How many delivery models are still drafts, and how many are confirmed."
          labelA="Draft"
          labelB="Confirmed"
          valueA={stats.draft}
          valueB={stats.confirmed}
          countLabel="Delivery models counted"
        />
        <TwoCategoryDonutChart
          title="Ready vs not ready"
          subtitle="Ready means the cited models exist and are confirmed or operational where that status exists."
          labelA="Ready"
          labelB="Not ready"
          valueA={stats.ready}
          valueB={stats.notReady}
          countLabel="Delivery models counted"
        />
        <TwoCategoryDonutChart
          title="In use vs unused"
          subtitle="In use means a session stores this delivery model id."
          labelA="In use"
          labelB="Unused"
          valueA={stats.inUse}
          valueB={stats.unused}
          countLabel="Delivery models counted"
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
