// src/components/assemblyModels/AssemblyModelList.jsx
// D54 -- lean browsing table for Assembly Models, mirroring QMatrixList.jsx
// (name, bound competency model, target/rule counts, lifecycle status,
// Edit/Delete).

import React from "react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import LifecycleStatusBadge from "@/components/ui/LifecycleStatusBadge";
import { apiErrorMessage } from "@/api/apiClient";
import { useCompetencyModels } from "@/api/queries/competencies";
import { useAssemblyModels, useDeleteAssemblyModel } from "@/api/queries/assemblyModels";

export default function AssemblyModelList({ onCreate, onEdit }) {
  const { data: assemblyModels = [], isLoading } = useAssemblyModels();
  const { data: competencyModels = [] } = useCompetencyModels();
  const deleteMutation = useDeleteAssemblyModel();

  const modelName = (id) => competencyModels.find((m) => m.id === id)?.name || id;

  async function handleDelete(id) {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Assembly model deleted.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Delete failed."));
    }
  }

  if (isLoading) {
    return <p className="text-sm text-slate-500">Loading assembly models…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={onCreate}>+ New Assembly Model</Button>
      </div>

      {assemblyModels.length === 0 ? (
        <p className="text-sm text-slate-500">No assembly models yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-full text-caption">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-600">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Student Model</th>
                <th className="px-4 py-2">SMV Targets</th>
                <th className="px-4 py-2">Stopping Rules</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {assemblyModels.map((am) => {
                const sr = am.stoppingRules || {};
                const hasStoppingRule =
                  sr.maxItems !== undefined || sr.minItems !== undefined || sr.targetsMet !== undefined;
                return (
                  <tr key={am.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium text-slate-700">{am.name}</td>
                    <td className="px-4 py-2">{modelName(am.competencyModelId)}</td>
                    <td className="px-4 py-2">{(am.targetsBySMV || []).length}</td>
                    <td className="px-4 py-2">{hasStoppingRule ? "Declared" : "—"}</td>
                    <td className="px-4 py-2">
                      <LifecycleStatusBadge status={am.status} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button variant="outline" size="sm" onClick={() => onEdit(am.id)}>
                        {am.status === "draft" ? "Edit" : "Review"}
                      </Button>
                      {!am.locked && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-2 text-red-600 hover:text-red-700"
                          onClick={() => handleDelete(am.id)}
                        >
                          Delete
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
