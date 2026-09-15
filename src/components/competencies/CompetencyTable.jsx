// src/components/competencies/CompetencyTable.jsx
// ------------------------------------------------------------
// Competency Model Table — plain browsing view
// ------------------------------------------------------------
// Same role as itemBank/ItemList.jsx: a lean, read-only, searchable
// table for browsing existing records. Full CRUD/creation lives in
// CompetencyModelBuilderPanel.jsx (reached via the "Create" tab),
// mirroring ItemBank's Items (List) vs Operate Item split.
//
// Also offers an additional "Ingredients View" alongside the default
// table: an enterprise-style breakdown of each model's components
// (its competencies and the structural relationships between them),
// each with ids, names, and counts -- see ModelIngredientsCard.
// ------------------------------------------------------------

import React, { useMemo, useState } from "react";
import { useCompetencyModels, useCompetencies } from "@/api/queries/competencies";
import { apiErrorMessage } from "@/api/apiClient";
import LifecycleStatusBadge from "../ui/LifecycleStatusBadge";

export default function CompetencyTable() {
    const { data: models = [], isLoading: loading, error: queryError } =
        useCompetencyModels();
    const { data: competencies = [] } = useCompetencies();

    const error = queryError
        ? apiErrorMessage(queryError, "Failed to fetch competency models.")
        : null;

    const [search, setSearch] = useState("");
    const [sortKey, setSortKey] = useState("updatedAt");
    const [sortDir, setSortDir] = useState("desc");
    const [viewMode, setViewMode] = useState("table"); // table | ingredients

    const filteredModels = useMemo(() => {
        if (!search.trim()) return models;
        const lower = search.toLowerCase();
        return models.filter((m) =>
            [m.name, m.id].filter(Boolean).some((field) =>
                String(field).toLowerCase().includes(lower)
            )
        );
    }, [models, search]);

    const sortedModels = useMemo(() => {
        const sorted = [...filteredModels];
        sorted.sort((a, b) => {
            const aVal = a[sortKey] || "";
            const bVal = b[sortKey] || "";
            if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
            if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
            return 0;
        });
        return sorted;
    }, [filteredModels, sortKey, sortDir]);

    const toggleSort = (key) => {
        if (sortKey === key) {
            setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
        } else {
            setSortKey(key);
            setSortDir("asc");
        }
    };

    /* =====================================================
       🔹 INGREDIENTS VIEW — group competencies by model,
       build a global id → name lookup for relationship edges.
    ===================================================== */
    const competenciesByModel = useMemo(() => {
        const map = {};
        competencies.forEach((c) => {
            const key = c.modelId || "unassigned";
            if (!map[key]) map[key] = [];
            map[key].push(c);
        });
        return map;
    }, [competencies]);

    const competencyNameById = useMemo(() => {
        const map = {};
        competencies.forEach((c) => {
            map[c.id] = c.name || c.id;
        });
        return map;
    }, [competencies]);

    const buildGroups = (model) => {
        const modelCompetencies = competenciesByModel[model.id] || [];

        const competencyItems = modelCompetencies.map((c) => ({
            id: c.id,
            primary: c.name || "Untitled competency",
            secondary: [
                c.variableType || "type not set",
                `${(c.states || []).length} states`,
                `${(c.relationships || []).length} links`,
            ]
                .filter(Boolean)
                .join(" • "),
        }));

        const relationshipItems = modelCompetencies.flatMap((c) =>
            (c.relationships || []).map((r, idx) => ({
                id: `${c.id}-rel-${idx}`,
                primary: `${c.name || c.id} → ${competencyNameById[r.targetCompetencyId] || r.targetCompetencyId
                    }`,
                secondary: r.type,
            }))
        );

        return [
            { key: "competencies", label: "Competencies", items: competencyItems },
            {
                key: "relationships",
                label: "Structural Relationships",
                items: relationshipItems,
            },
        ];
    };

    if (loading) {
        return <div className="p-6 text-sm text-gray-600">Loading competency models...</div>;
    }

    if (error) {
        return <div className="p-6 text-sm text-red-600">{error}</div>;
    }

    return (
        <div className="p-8 space-y-6 max-w-7xl mx-auto">
            <div className="flex flex-wrap justify-between items-center gap-3">
                <h1 className="text-2xl font-semibold">Competency Model Structure</h1>

                <div className="flex items-center gap-3">
                    <input
                        type="text"
                        placeholder="Search by ID, competency, name..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="border rounded-xl px-4 py-2 text-sm w-72"
                    />

                    <div className="flex border rounded-xl overflow-hidden text-sm">
                        <button
                            onClick={() => setViewMode("table")}
                            className={`px-3 py-2 ${viewMode === "table"
                                    ? "bg-gray-900 text-white"
                                    : "bg-white text-gray-600 hover:bg-gray-50"
                                }`}
                        >
                            Table View
                        </button>
                        <button
                            onClick={() => setViewMode("ingredients")}
                            className={`px-3 py-2 border-l ${viewMode === "ingredients"
                                    ? "bg-gray-900 text-white"
                                    : "bg-white text-gray-600 hover:bg-gray-50"
                                }`}
                        >
                            Ingredients View
                        </button>
                    </div>
                </div>
            </div>

            {viewMode === "table" && (
                <div className="overflow-x-auto bg-white rounded-2xl shadow">
                    <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-left">
                            <tr>
                                <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort("id")}>
                                    ID
                                </th>
                                <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort("name")}>
                                    Name
                                </th>
                                <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort("status")}>
                                    Status
                                </th>
                                <th className="px-4 py-3">Locked</th>
                                <th className="px-4 py-3">Version</th>
                                <th className="px-4 py-3 cursor-pointer" onClick={() => toggleSort("updatedAt")}>
                                    Updated
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedModels.map((m) => (
                                <tr key={m.id} className="border-t hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium">{m.id}</td>
                                    <td className="px-4 py-3 font-medium">{m.name}</td>
                                    <td className="px-4 py-3">
                                        <LifecycleStatusBadge status={m.status} />
                                    </td>
                                    <td className="px-4 py-3">{m.locked ? "Yes" : "No"}</td>
                                    <td className="px-4 py-3">v{m.versionNumber || 1}</td>
                                    <td className="px-4 py-3">
                                        {m.updatedAt ? new Date(m.updatedAt).toLocaleDateString() : "—"}
                                    </td>
                                </tr>
                            ))}

                            {sortedModels.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="px-4 py-6 text-center text-gray-500">
                                        No competency models found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {viewMode === "ingredients" && (
                <div className="space-y-4">
                    {sortedModels.map((m) => (
                        <ModelIngredientsCard
                            key={m.id}
                            model={m}
                            groups={buildGroups(m)}
                        />
                    ))}

                    {sortedModels.length === 0 && (
                        <div className="bg-white rounded-2xl shadow px-4 py-6 text-center text-gray-500 text-sm">
                            No competency models found.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
