// src/components/competencyModels/CompetencyModelBuilder.jsx
// 🧠 Competency Model Builder — top-level tab shell
// Mirrors itemBank/ItemBankAdmin.jsx exactly:
// - Dashboard / Competency Models / Operate Competency Model sub-nav
// - "Competency Models" (list) shows a lean read-only browsing table
//   (CompetencyTable, mirrors itemBank/ItemList.jsx)
// - "Operate Competency Model" shows the full management console
//   (CompetencyModelBuilderPanel, mirrors itemBank/ItemBuilder.jsx),
//   which owns its own list/create/edit flow internally and swaps in
//   the wizard full-screen the moment its own "+ New Competency
//   Model" button is clicked -- this shell never sees that switch.

import React, { useState } from "react";

import CompetencyDashboard from "./CompetencyDashboard";
import CompetencyTable from "./CompetencyTable";
import CompetencyModelBuilderPanel from "./CompetencyModelBuilderPanel";
import { Button } from "@/components/ui/button";

export default function CompetencyModelBuilder() {
    const [mode, setMode] = useState("dashboard"); // dashboard | list | create

    return (
        <div className="space-y-8">
            {/* Internal Navigation */}
            <div className="flex gap-4 border-b pb-4">
                <Button
                    variant={mode === "dashboard" ? "default" : "outline"}
                    onClick={() => setMode("dashboard")}
                >
                    Dashboard
                </Button>

                <Button
                    variant={mode === "list" ? "default" : "outline"}
                    onClick={() => setMode("list")}
                >
                    Student Model Structure
                </Button>

                <Button
                    variant={mode === "create" ? "default" : "outline"}
                    onClick={() => setMode("create")}
                >
                    Manage Student Model
                </Button>
            </div>

            <div>
                {mode === "dashboard" && <CompetencyDashboard />}
                {mode === "list" && <CompetencyTable />}
                {mode === "create" && <CompetencyModelBuilderPanel />}
            </div>
        </div>
    );
}
