// src/components/itemBank/ItemBankAdmin.jsx
// ------------------------------------------------------------
// Item Bank shell (Admin / District / Teacher).
//
// The three tabs were "Dashboard", "Item Bank Structure" and "Operate
// Item" — the last two being two overlapping list views of the same
// collection, with different columns, different filters and a different
// (in one case empty) set of governance actions, so which actions a user
// had depended on which tab they happened to open. They are kept as two
// deliberately different lenses now — Structure reads, Authoring acts —
// and Structure hands off to the authoring surface instead of navigating
// to a route that does not exist.
//
// Authoring and the Item Wizard are gated by can(role, "edit", "items"):
// admin and district author and open items from Bank structure. Teacher
// views Dashboard + Bank structure only — no wizard, so no Suspend /
// Archive. API writes are already admin/district-only.
// ------------------------------------------------------------

import React, { useState } from "react";
import AdminDashboard from "./AdminDashboard";
import ItemList from "./ItemList";
import ItemBuilder from "./ItemBuilder";
import ItemWizard from "./ItemWizard/ItemWizard";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthProvider";
import { can } from "@/config/rolePermissions";

const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "structure", label: "Bank structure" },
  { key: "authoring", label: "Authoring" },
];

export default function ItemBankAdmin() {
  const { auth } = useAuth() || {};
  const canAuthor = can(auth?.role, "edit", "items");
  const tabs = canAuthor ? TABS : TABS.filter((tab) => tab.key !== "authoring");
  const [view, setView] = useState("dashboard");
  const [inspecting, setInspecting] = useState(null);
  const activeView = view === "authoring" && !canAuthor ? "dashboard" : view;

  // Opening an item from the structure table mounts the wizard directly
  // rather than routing. Authors only — teacher must not reach Suspend /
  // Archive (or any other wizard lifecycle control) from the list.
  if (inspecting && canAuthor) {
    return (
      <ItemWizard item={inspecting} onClose={() => setInspecting(null)} />
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex gap-3 border-b pb-4">
        {tabs.map((tab) => (
          <Button
            key={tab.key}
            variant={activeView === tab.key ? "default" : "outline"}
            onClick={() => setView(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      <div>
        {activeView === "dashboard" && <AdminDashboard />}
        {activeView === "structure" && (
          <ItemList onOpenItem={canAuthor ? setInspecting : undefined} />
        )}
        {activeView === "authoring" && canAuthor && <ItemBuilder />}
      </div>
    </div>
  );
}
