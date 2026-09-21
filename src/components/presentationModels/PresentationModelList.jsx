// src/components/presentationModels/PresentationModelList.jsx
// D113 -- browsing table for Presentation Models (name, bound Task Model,
// layout/navigation, lifecycle status, Edit/Delete).

import React from "react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import LifecycleStatusBadge from "@/components/ui/LifecycleStatusBadge";
import { apiErrorMessage } from "@/api/apiClient";
import { useTaskModels } from "@/api/queries/taskModels";
import { usePresentationModels, useDeletePresentationModel } from "@/api/queries/presentationModels";
import {
  presentationItemOrderLabel,
  presentationNavigationLabel,
} from "@/utils/ecdVocabulary";

export default function PresentationModelList({ onCreate, onEdit }) {
  const { data: presentationModels = [], isLoading } = usePresentationModels();
  const { data: taskModels = [] } = useTaskModels();
  const deleteMutation = useDeletePresentationModel();

  const modelName = (id) => taskModels.find((m) => m.id === id)?.name || id;

  async function handleDelete(id) {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Presentation model deleted.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Delete failed."));
    }
  }

  if (isLoading) {
    return <p className="text-sm text-slate-500">Loading presentation models…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-slate-500">
          PADI Materials &amp; Presentation overlay — how items are ordered,
          navigated, and shown. SessionPlayer does not yet obey these
          records (later W23 unit).
        </p>
        <Button onClick={onCreate}>+ New Presentation Model</Button>
      </div>

      {presentationModels.length === 0 ? (
        <p className="text-sm text-slate-500">No presentation models yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-full text-caption">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-600">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Task Model</th>
                <th className="px-4 py-2">Order</th>
                <th className="px-4 py-2">Navigation</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {presentationModels.map((pm) => (
                <tr key={pm.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-700">{pm.name}</td>
                  <td className="px-4 py-2">{modelName(pm.taskModelId)}</td>
                  <td className="px-4 py-2">
                    {presentationItemOrderLabel(pm.layout?.itemOrder)}
                  </td>
                  <td className="px-4 py-2">
                    {presentationNavigationLabel(pm.layout?.navigation)}
                  </td>
                  <td className="px-4 py-2">
                    <LifecycleStatusBadge status={pm.status} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button variant="outline" size="sm" onClick={() => onEdit(pm.id)}>
                      {pm.status === "draft" ? "Edit" : "Review"}
                    </Button>
                    {!pm.locked && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-2 text-red-600 hover:text-red-700"
                        onClick={() => handleDelete(pm.id)}
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
