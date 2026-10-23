// Work Product Dashboard. These records have no lifecycle status.
// Ready follows workProductReadiness with strict: true (name and type).
// Used means an item, an evidence model, or a design pattern cites the id.

import React, { useMemo } from "react";
import { useWorkProducts } from "@/api/queries/workProducts";
import { useItems } from "@/api/queries/items";
import { useEvidenceModels } from "@/api/queries/evidenceModels";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import { apiErrorMessage } from "@/api/apiClient";
import TwoCategoryDonutChart from "@/components/shared/charts/TwoCategoryDonutChart";
import { WORK_PRODUCT_TYPES } from "@/utils/ecdVocabulary";
import { isWorkProductUsed, workProductReadinessValue } from "./workProductUsage";

export default function WorkProductDashboard() {
  const productsQuery = useWorkProducts();
  const itemsQuery = useItems();
  const evidenceQuery = useEvidenceModels();
  const patternsQuery = useDesignPatterns();

  const workProducts = productsQuery.data || [];
  const context = useMemo(
    () => ({
      items: itemsQuery.data || [],
      evidenceModels: evidenceQuery.data || [],
      designPatterns: patternsQuery.data || [],
    }),
    [itemsQuery.data, evidenceQuery.data, patternsQuery.data]
  );

  const loading = [productsQuery, itemsQuery, evidenceQuery, patternsQuery].some(
    (query) => query.isLoading
  );
  const queryError =
    productsQuery.error || itemsQuery.error || evidenceQuery.error || patternsQuery.error;
  const error = queryError
    ? apiErrorMessage(queryError, "Failed to fetch work products.")
    : null;

  const stats = useMemo(() => {
    const known = new Set(WORK_PRODUCT_TYPES.map((type) => type.value));
    let ready = 0;
    let used = 0;
    let noType = 0;
    let other = 0;
    const byType = Object.fromEntries(WORK_PRODUCT_TYPES.map((type) => [type.value, 0]));

    for (const record of workProducts) {
      if (workProductReadinessValue(record) === "ready") ready += 1;
      if (isWorkProductUsed(record, context)) used += 1;
      if (!record.type) noType += 1;
      else if (known.has(record.type)) byType[record.type] += 1;
      else other += 1;
    }

    return {
      total: workProducts.length,
      ready,
      notReady: workProducts.length - ready,
      used,
      unused: workProducts.length - used,
      byType,
      noType,
      other,
    };
  }, [workProducts, context]);

  if (loading) {
    return <div className="p-8 text-sm text-gray-600">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="p-8 text-sm text-red-600">{error}</div>;
  }

  const typeCards = WORK_PRODUCT_TYPES.map((type) => ({
    label: type.label,
    value: stats.byType[type.value] || 0,
  }));
  if (stats.noType > 0) typeCards.push({ label: "No type", value: stats.noType });
  if (stats.other > 0) {
    typeCards.push({ label: "Other", value: stats.other });
  }

  return (
    <div className="p-8 space-y-16 max-w-7xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Work Product Dashboard</h1>
        <p className="text-sm text-gray-500">
          Work products have no lifecycle status. Ready means the record has a
          name and a type from the shared vocabulary. Used means an item, an
          evidence model, or a design pattern cites it.
        </p>
      </div>

      <section
        aria-label="Work product counts"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6"
      >
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Ready" value={stats.ready} />
        <StatCard label="Not ready" value={stats.notReady} />
        <StatCard label="Used" value={stats.used} />
        <StatCard label="Unused" value={stats.unused} />
      </section>

      <section aria-label="Counts by type" className="space-y-4">
        <h2 className="text-lg font-semibold">Counts by type</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {typeCards.map((card) => (
            <StatCard key={card.label} label={card.label} value={card.value} />
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <TwoCategoryDonutChart
          title="Used vs unused"
          subtitle="Used means an item, an evidence model, or a design pattern cites the work product."
          labelA="Used"
          labelB="Unused"
          valueA={stats.used}
          valueB={stats.unused}
          countLabel="Work products counted"
        />
        <TwoCategoryDonutChart
          title="Ready vs not ready"
          subtitle="Ready means the name and the type pass the work product readiness check."
          labelA="Ready"
          labelB="Not ready"
          valueA={stats.ready}
          valueB={stats.notReady}
          countLabel="Work products counted"
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
