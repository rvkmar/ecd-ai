// src/components/evidenceModels/EvidenceModelBuilder.jsx
// 🧠 Evidence Model Builder — top-level tab shell
// Mirrors itemBank/ItemBankAdmin.jsx exactly:
// - Dashboard / Evidence Models / Operate Evidence Model sub-nav
// - "Evidence Models" (list) shows a lean read-only browsing table
//   (EvidenceModelTable, mirrors itemBank/ItemList.jsx)
// - "Operate Evidence Model" shows the full management console
//   (EvidenceModelBuilderPanel, mirrors itemBank/ItemBuilder.jsx),
//   which owns its own list/create/edit/calibrate flow internally
//   (including the "confirmed competency models required" governance
//   gate) and swaps in the wizard full-screen the moment its own
//   "+ New Evidence Model" button is clicked -- this shell never sees
//   that switch.

import React, { useState } from "react";

import EvidenceDashboard from "./EvidenceDashboard";
import EvidenceModelTable from "./EvidenceModelTable";
import EvidenceModelBuilderPanel from "./EvidenceModelBuilderPanel";
import { Button } from "@/components/ui/button";

export default function EvidenceModelBuilder() {
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
                    Evidence Model Structure
                </Button>

                <Button
                    variant={mode === "create" ? "default" : "outline"}
                    onClick={() => setMode("create")}
                >
                    Manage Evidence Model
                </Button>
            </div>

            <div>
                {mode === "dashboard" && <EvidenceDashboard />}
                {mode === "list" && <EvidenceModelTable />}
                {mode === "create" && <EvidenceModelBuilderPanel />}
            </div>
        </div>
    );
}
