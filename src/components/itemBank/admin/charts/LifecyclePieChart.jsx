// src/components/itemBank/admin/charts/LifecyclePieChart.jsx
// ------------------------------------------------------------
// 🧠 LifecyclePieChart — Governance Lifecycle Distribution
// ------------------------------------------------------------
// ✔ Uses Recharts
// ✔ Pure presentational component
// ✔ No hardcoded colors
// ✔ Responsive container
// ✔ Displays count + percentage
// ✔ Admin Dashboard ready
// ------------------------------------------------------------

import React, { useMemo } from "react";
import {
    PieChart,
    Pie,
    Cell,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";

export default function LifecyclePieChart({ lifecycleStats = {} }) {
    /* =====================================================
       🔹 Transform Data
    ===================================================== */

    const data = useMemo(() => {
        const order = [
            "draft",
            "reviewed",
            "confirmed",
            "operational",
            "suspended",
            "archived",
        ];
        const entries = Object.entries(lifecycleStats);
        const known = new Set(order);
        const ordered = order
            .map((status) => ({
                name: status,
                value: lifecycleStats[status] || 0,
            }))
            .filter((entry) => entry.value > 0);
        const extras = entries
            .filter(([status]) => !known.has(status))
            .map(([status, count]) => ({ name: status, value: count }))
            .filter((entry) => entry.value > 0);
        return [...ordered, ...extras];
    }, [lifecycleStats]);

    const total = useMemo(() => {
        return data.reduce((sum, item) => sum + item.value, 0);
    }, [data]);

    /* =====================================================
       🔹 Custom Label
    ===================================================== */

    const renderLabel = ({ percent }) => {
        if (!percent || percent < 0.05) return "";
        return `${(percent * 100).toFixed(0)}%`;
    };

    /* =====================================================
       🔹 UI
    ===================================================== */

    if (!data.length) {
        return (
            <div className="bg-white rounded-2xl shadow p-6 text-sm text-gray-500">
                No lifecycle data available.
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl shadow p-6">
            <div className="mb-4">
                <h3 className="text-lg font-semibold">
                    Lifecycle Distribution
                </h3>
                <p className="text-sm text-gray-500">
                    Distribution of Student Models across lifecycle stages
                    (draft → reviewed → confirmed → operational / archived).
                </p>
            </div>

            <div className="w-full h-80">
                {/* minWidth/minHeight give Recharts a usable size to render
                    with on the very first paint, before its ResizeObserver
                    has measured the real container -- without them it logs
                    "The width(-1) and height(-1) of chart should be greater
                    than 0" and skips that first frame. */}
                <ResponsiveContainer minWidth={280} minHeight={280}>
                    <PieChart>
                        <Pie
                            data={data}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={100}
                            label={renderLabel}
                        />
                        <Tooltip />
                        <Legend />
                    </PieChart>
                </ResponsiveContainer>
            </div>

            <div className="mt-4 text-sm text-gray-600">
                Total Items Counted: {total}
            </div>
        </div>
    );
}
