// src/components/qMatrix/QMatrixList.jsx
// ------------------------------------------------------------
// D51 -- lean read-only browsing table for Q-matrices, mirroring the
// list half of every other model layer (CompetencyTable, TaskModelList):
// name, bound competency model, size, lifecycle status, and Edit/Delete.
// ------------------------------------------------------------

import React from "react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import LifecycleStatusBadge from "@/components/ui/LifecycleStatusBadge";
import { apiErrorMessage } from "@/api/apiClient";
import { useCompetencyModels } from "@/api/queries/competencies";
import { useQMatrixModels, useDeleteQMatrixModel } from "@/api/queries/qMatrixModels";

export default function QMatrixList({ onCreate, onEdit, readOnly = false }) {
  const { data: qMatrices = [], isLoading } = useQMatrixModels();
  const { data: competencyModels = [] } = useCompetencyModels();
  const deleteMutation = useDeleteQMatrixModel();

  const modelName = (id) => competencyModels.find((m) => m.id === id)?.name || id;

  async function handleDelete(id) {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Q-matrix deleted.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Delete failed."));
    }
  }

  if (isLoading) {
    return <p className="text-sm text-slate-500">Loading Q-matrices…</p>;
  }

  return (
    <div className="space-y-4">
      {/* Read-only (district) sees no authoring affordances at all: no
          create, no delete, and the row action reads "View" rather than
          "Edit"/"Review". Hiding rather than disabling is deliberate — a
          disabled New button invites "why can't I?", whereas a district
          user is not a blocked author, they are a legitimate reader of a
          spec somebody else owns. */}
      {!readOnly && (
        <div className="flex justify-end">
          <Button onClick={onCreate}>+ New Diagnostic design</Button>
        </div>
      )}

      {qMatrices.length === 0 ? (
        <p className="text-sm text-slate-500">No Q-matrices yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-full text-caption">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-600">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Student Model</th>
                <th className="px-4 py-2">Attributes</th>
                <th className="px-4 py-2">Entries</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {qMatrices.map((qm) => (
                <tr key={qm.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-700">{qm.name}</td>
                  <td className="px-4 py-2">{modelName(qm.competencyModelId)}</td>
                  <td className="px-4 py-2">{(qm.attributeIds || []).length}</td>
                  <td className="px-4 py-2">{(qm.entries || []).length}</td>
                  <td className="px-4 py-2">
                    <LifecycleStatusBadge status={qm.status} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button variant="outline" size="sm" onClick={() => onEdit(qm.id)}>
                      {readOnly ? "View" : qm.status === "draft" ? "Edit" : "Review"}
                    </Button>
                    {!readOnly && !qm.locked && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-2 text-red-600 hover:text-red-700"
                        onClick={() => handleDelete(qm.id)}
                      >
                        Delete
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
