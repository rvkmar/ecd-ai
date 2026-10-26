// Task Model Variable Dashboard. These records have no lifecycle status.
// Ready follows taskModelVariableReadiness with strict: true. In use
// means a task model or a design pattern cites the id.

import React, { useMemo } from "react";
import { useTaskModelVariables } from "@/api/queries/taskModelVariables";
import { useTaskModels } from "@/api/queries/taskModels";
import { useDesignPatterns } from "@/api/queries/designPatterns";
import { apiErrorMessage } from "@/api/apiClient";
import TwoCategoryDonutChart from "@/components/shared/charts/TwoCategoryDonutChart";
import { TMV_TYPES, TMV_VALUE_SET_KEYS } from "@/utils/ecdVocabulary";
import {
  isVariableInUse,
  valueSetKind,
  variableReadinessValue,
  variableTypeText,
} from "./taskModelVariableUsage";

export default function TaskModelVariableDashboard() {
  const variablesQuery = useTaskModelVariables();
  const taskModelsQuery = useTaskModels();
  const patternsQuery = useDesignPatterns();

  const variables = variablesQuery.data || [];
  const context = useMemo(
    () => ({
      taskModels: taskModelsQuery.data || [],
      designPatterns: patternsQuery.data || [],
    }),
    [taskModelsQuery.data, patternsQuery.data]
  );

  const loading = [variablesQuery, taskModelsQuery, patternsQuery].some(
    (query) => query.isLoading
  );
  const queryError = variablesQuery.error || taskModelsQuery.error || patternsQuery.error;
  const error = queryError
    ? apiErrorMessage(queryError, "Failed to fetch task model variables.")
    : null;

  const stats = useMemo(() => {
    const knownTypes = new Set(TMV_TYPES.map((type) => type.value));
    let ready = 0;
    let used = 0;
    let noType = 0;
    let otherType = 0;
    const byType = Object.fromEntries(TMV_TYPES.map((type) => [type.value, 0]));
    const byValueSet = Object.fromEntries(TMV_VALUE_SET_KEYS.map((key) => [key, 0]));
    let authorSupplied = 0;
    let otherValueSet = 0;

    for (const record of variables) {
      if (variableReadinessValue(record) === "ready") ready += 1;
      if (isVariableInUse(record, context)) used += 1;
      if (!record.type) noType += 1;
      else if (knownTypes.has(record.type)) byType[record.type] += 1;
      else otherType += 1;

      const kind = valueSetKind(record);
      if (kind === "author-supplied") authorSupplied += 1;
      else if (kind === "other") otherValueSet += 1;
      else byValueSet[kind] += 1;
    }

    return {
      total: variables.length,
      ready,
      notReady: variables.length - ready,
      used,
      unused: variables.length - used,
      byType,
      noType,
      otherType,
      byValueSet,
      authorSupplied,
      otherValueSet,
    };
  }, [variables, context]);

  if (loading) {
    return <div className="p-8 text-sm text-gray-600">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="p-8 text-sm text-red-600">{error}</div>;
  }

  const typeCards = TMV_TYPES.map((type) => ({
    label: variableTypeText(type.value),
    value: stats.byType[type.value] || 0,
  }));
  if (stats.noType > 0) typeCards.push({ label: "No type", value: stats.noType });
  if (stats.otherType > 0) typeCards.push({ label: "Other", value: stats.otherType });

  const valueSetCards = TMV_VALUE_SET_KEYS.map((key) => ({
    label: key,
    value: stats.byValueSet[key] || 0,
  }));
  valueSetCards.push({ label: "Author-supplied", value: stats.authorSupplied });
  if (stats.otherValueSet > 0) {
    valueSetCards.push({ label: "Other", value: stats.otherValueSet });
  }

  return (
    <div className="p-8 space-y-16 max-w-7xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Task Model Variable Dashboard</h1>
        <p className="text-sm text-gray-500">
          Task model variables have no lifecycle status. Ready means the record
          passes the task model variable readiness check. In use means a task
          model or a design pattern cites it. Type and value set counts use the
          shared vocabulary. A record with no value set is author supplied.
        </p>
      </div>

      <section
        aria-label="Task model variable counts"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6"
      >
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Ready" value={stats.ready} />
        <StatCard label="Not ready" value={stats.notReady} />
        <StatCard label="In use" value={stats.used} />
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

      <section aria-label="Counts by value set" className="space-y-4">
        <h2 className="text-lg font-semibold">Counts by value set</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {valueSetCards.map((card) => (
            <StatCard key={card.label} label={card.label} value={card.value} />
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <TwoCategoryDonutChart
          title="In use vs unused"
          subtitle="In use means a task model or a design pattern cites the variable."
          labelA="In use"
          labelB="Unused"
          valueA={stats.used}
          valueB={stats.unused}
          countLabel="Task model variables counted"
        />
        <TwoCategoryDonutChart
          title="Ready vs not ready"
          subtitle="Ready means the record passes the task model variable readiness check."
          labelA="Ready"
          labelB="Not ready"
          valueA={stats.ready}
          valueB={stats.notReady}
          countLabel="Task model variables counted"
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
