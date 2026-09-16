// TaskModelBuilder.jsx
// ------------------------------------------------------------
// 🧠 Task Model Builder — top-level tab shell
// ------------------------------------------------------------
// Mirrors itemBank/ItemBankAdmin.jsx exactly:
// - Dashboard / Task Models / Operate Task Model sub-nav
// - "Task Models" (list) shows a lean read-only browsing table
//   (TaskModelTable, mirrors itemBank/ItemList.jsx)
// - "Operate Task Model" shows the full management console
//   (TaskModelBuilderPanel, mirrors itemBank/ItemBuilder.jsx),
//   which owns its own list/create/edit flow internally (including
//   the "confirmed + locked Evidence Models required" governance
//   gate) and swaps in the wizard full-screen the moment its own
//   "+ New Task Model" button is clicked -- this shell never sees
//   that switch.
// ------------------------------------------------------------

import React, { useState } from "react";

import TaskModelDashboard from "./TaskModelDashboard";
import TaskModelTable from "./TaskModelTable";
import TaskModelBuilderPanel from "./TaskModelBuilderPanel";
import { Button } from "@/components/ui/button";

export default function TaskModelBuilder() {
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
          Task Model Structure
        </Button>

        <Button
          variant={mode === "create" ? "default" : "outline"}
          onClick={() => setMode("create")}
        >
          Manage Task Model
        </Button>
      </div>

      <div>
        {mode === "dashboard" && <TaskModelDashboard />}
        {mode === "list" && <TaskModelTable />}
        {mode === "create" && <TaskModelBuilderPanel />}
      </div>
    </div>
  );
}
