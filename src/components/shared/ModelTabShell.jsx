// src/components/shared/ModelTabShell.jsx
//
// Tabs and one panel. Same button row as the Competency, Evidence, and
// Task model builders (Dashboard, then Structure, then Manage). Those
// three keep their own buttons so their label tests stay on their own
// source. Design Pattern, Domain Analysis, Templates, Assembly Models,
// Delivery Models, Diagnostic Design, Presentation Models, Work
// Products, Rubrics, and Task Model Variables call this shell.

import React from "react";
import { Button } from "@/components/ui/button";

export default function ModelTabShell({ tabs, mode, onModeChange }) {
  const active = tabs.find((tab) => tab.id === mode) || tabs[0];

  return (
    <div className="space-y-8">
      <div className="flex gap-4 border-b pb-4">
        {tabs.map((tab) => (
          <Button
            key={tab.id}
            type="button"
            variant={mode === tab.id ? "default" : "outline"}
            onClick={() => onModeChange(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>
      <div>{active ? active.panel : null}</div>
    </div>
  );
}
