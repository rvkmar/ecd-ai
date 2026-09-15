// src/components/competencies/CompetencyDashboard.jsx
// ------------------------------------------------------------
// 🧠 Competency Dashboard — Governance Overview
// ------------------------------------------------------------
// Same layout/visual language as itemBank/AdminDashboard.jsx:
// executive summary stat cards + lifecycle/lock donut charts.
// ------------------------------------------------------------

import React, { useMemo } from "react";
import { useCompetencyModels, useCompetencies } from "@/api/queries/competencies";
import { apiErrorMessage } from "@/api/apiClient";

import LifecyclePieChart from "../itemBank/admin/charts/LifecyclePieChart";
import TwoCategoryDonutChart from "../shared/charts/TwoCategoryDonutChart";

export default function CompetencyDashboard() {
    const {
        data: models = [],
        isLoading: modelsLoading,
        error: modelsError,
    } = useCompetencyModels();
    const { data: competencies = [], isLoading: competenciesLoading } =
        useCompetencies();

    const loading = modelsLoading || competenciesLoading;
    const error = modelsError
        ? apiErrorMessage(modelsError, "Failed to fetch competency models.")
        : null;

    /* =====================================================
       🔹 Lifecycle Distribution
    ===================================================== */
    const lifecycleStats = useMemo(() => {
        const base = {
            draft: 0,
            reviewed: 0,
            confirmed: 0,
            operational: 0,
            suspended: 0,
            archived: 0,
        };

        models.forEach((m) => {
            const status = m.status || "draft";
            if (base[status] === undefined) base[status] = 0;
            base[status] += 1;
        });

        return base;
    }, [models]);

    /* =====================================================
       🔒 Lock Distribution
    ===================================================== */
    const lockStats = useMemo(() => {
        let locked = 0;
        let unlocked = 0;

        models.forEach((m) => {
            if (m.locked) locked += 1;
            else unlocked += 1;
        });

        return { locked, unlocked };
    }, [models]);

    const totalModels = models.length;
    const totalCompetencies = competencies.length;

    if (loading) {
        return (
            <div className="p-8 text-sm text-gray-600">
                Loading dashboard...
            </div>
        );
    }

    if (error) {
        return <div className="p-8 text-red-600 text-sm">{error}</div>;
    }

    return (
        <div className="p-8 space-y-16 max-w-7xl mx-auto">
            {/* Header */}
            <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">
                    Competency Model Dashboard
                </h1>
                <p className="text-sm text-gray-500">
                    Governance overview of competency models and the constructs they define.
                </p>
            </div>

            {/* Executive Summary */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white rounded-2xl shadow p-6">
                    <div className="text-xs uppercase text-gray-500">
                        Total Models
                    </div>
                    <div className="text-3xl font-bold mt-2">{totalModels}</div>
                </div>

                <div className="bg-white rounded-2xl shadow p-6">
                    <div className="text-xs uppercase text-gray-500">
                        Confirmed
                    </div>
                    <div className="text-3xl font-bold mt-2">
                        {lifecycleStats.confirmed || 0}
                    </div>
                    {(lifecycleStats.archived || 0) > 0 && (
                        <div className="text-xs text-slate-500 mt-2">
                            Archived {lifecycleStats.archived}
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-2xl shadow p-6">
                    <div className="text-xs uppercase text-gray-500">
                        Draft
                    </div>
                    <div className="text-3xl font-bold mt-2">
                        {lifecycleStats.draft || 0}
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow p-6">
                    <div className="text-xs uppercase text-gray-500">
                        Total Competencies
                    </div>
                    <div className="text-3xl font-bold mt-2">
                        {totalCompetencies}
                    </div>
                </div>
            </section>

            {/* Governance Charts */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                <LifecyclePieChart lifecycleStats={lifecycleStats} />
                <TwoCategoryDonutChart
                    title="Structural Lock Distribution"
                    subtitle="Ratio of locked vs unlocked competency models."
                    labelA="Locked"
                    labelB="Unlocked"
                    valueA={lockStats.locked}
                    valueB={lockStats.unlocked}
                    countLabel="Total Models Counted"
                />
            </section>
        </div>
    );
}
