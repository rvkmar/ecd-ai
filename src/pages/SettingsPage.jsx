// src/pages/SettingsPage.jsx
// ------------------------------------------------------------
// Enterprise-style Settings shell. Single home for everything the old
// AdminPage scattered across separate "Users"/"Policies"/"Settings" tabs
// (which themselves inlined TeachersManager + StudentsManager and a lone
// "Clear All Data" button) plus brand-new capability: theming and bulk
// import/export for all seven entity types.
//
// Tabs:
//   Users        -> src/pages/settings/UsersSettings.jsx (new, unified)
//   Appearance   -> theme mode switch (light/dark/system)
// Policy authoring lives on the Admin Policies group (Curricular policies,
// Selection policies). This page keeps the Data bulk cards.
//   Data         -> two sub-tabs: Upload (independent JSON bulk-import
//                   cards, one per entity type) and Download (the matching
//                   JSON exporters, same entity list, round-trip shaped)
//   System       -> Health (D104 metrics + four alerts), Audit viewer (D105),
//                   and the Clear All danger zone
// ------------------------------------------------------------

import React from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";

import UsersSettings from "./settings/UsersSettings";
import TenancySettings from "./settings/TenancySettings";
import AuditLogViewer from "./settings/AuditLogViewer";
import SystemHealthPanel from "./settings/SystemHealthPanel";
import BulkUploadPanel from "./settings/BulkUploadPanel";
import BulkDownloadPanel from "./settings/BulkDownloadPanel";
import ThemeToggle from "@/theme/ThemeToggle";
import { useTheme } from "@/theme/ThemeProvider";
import { useAuth } from "@/auth/AuthProvider";
import { apiFetch, apiErrorMessage } from "@/api/apiClient";

function AppearanceSettings() {
  const { resolvedTheme } = useTheme();

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h2 className="text-xl font-semibold">Appearance</h2>
        <p className="text-sm text-muted-foreground">
          Choose how the app looks on this device. "System" follows your OS setting
          automatically.
        </p>
      </div>

      <div className="rounded-xl border border-border p-4 space-y-3">
        <div className="text-sm font-medium">Theme</div>
        <ThemeToggle showLabels />
        <p className="text-xs text-muted-foreground">
          Currently rendering in <span className="font-medium">{resolvedTheme}</span> mode.
        </p>
      </div>
    </div>
  );
}

function SystemSettings() {
  const { auth } = useAuth() || {};
  const handleClearAll = async () => {
    try {
      await apiFetch("/api/admin/clear-all", { method: "POST" }, auth);
      toast.success("All data cleared.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to clear data."));
    }
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h2 className="text-xl font-semibold">System</h2>
        <p className="text-sm text-muted-foreground">
          Irreversible, system-wide operations. Use with care.
        </p>
      </div>

      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 space-y-3">
        <div>
          <div className="text-sm font-medium text-destructive">Danger zone</div>
          <p className="text-xs text-muted-foreground mt-1">
            Permanently deletes all assessment data (competencies, evidence models, task
            models, items, sessions). This cannot be undone.
          </p>
        </div>
        <Button
          className="bg-red-600 hover:bg-red-700 text-white"
          onClick={handleClearAll}
        >
          Clear All Assessment Data
        </Button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Users, appearance, bulk import/export, and system-wide operations.
            </p>
          </div>
          <Link
            to="/admin"
            title="Close Settings"
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-input rounded-md hover:bg-muted shrink-0"
          >
            <X size={16} />
            Close
          </Link>
        </div>

        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="flex flex-wrap gap-2 bg-muted p-2 rounded-2xl h-auto">
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="tenancy">Tenancy</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
            <TabsTrigger value="system">System</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="bg-card text-card-foreground rounded-2xl border border-border p-6">
            <UsersSettings />
          </TabsContent>

          <TabsContent value="tenancy" className="bg-card text-card-foreground rounded-2xl border border-border p-6">
            <TenancySettings />
          </TabsContent>

          <TabsContent value="appearance" className="bg-card text-card-foreground rounded-2xl border border-border p-6">
            <AppearanceSettings />
          </TabsContent>

          {/* Import and export are two directions of the same operation on
              the same seven entity types, so they share one "Data" tab and
              split into sub-tabs (same pattern as Policies above) rather
              than sitting as two unrelated top-level tabs. */}
          <TabsContent value="data" className="bg-card text-card-foreground rounded-2xl border border-border p-6">
            <Tabs defaultValue="upload" className="space-y-6">
              <TabsList className="flex flex-wrap gap-2 bg-muted p-1.5 rounded-xl h-auto">
                <TabsTrigger value="upload">Upload</TabsTrigger>
                <TabsTrigger value="download">Download</TabsTrigger>
              </TabsList>

              <TabsContent value="upload">
                <BulkUploadPanel />
              </TabsContent>

              <TabsContent value="download">
                <BulkDownloadPanel />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="system" className="bg-card text-card-foreground rounded-2xl border border-border p-6">
            <Tabs defaultValue="health" className="space-y-6">
              <TabsList className="flex flex-wrap gap-2 bg-muted p-1.5 rounded-xl h-auto">
                <TabsTrigger value="health">Health</TabsTrigger>
                <TabsTrigger value="audit">Audit</TabsTrigger>
                <TabsTrigger value="danger">Danger zone</TabsTrigger>
              </TabsList>
              <TabsContent value="health">
                <SystemHealthPanel />
              </TabsContent>
              <TabsContent value="audit">
                <AuditLogViewer />
              </TabsContent>
              <TabsContent value="danger">
                <SystemSettings />
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
