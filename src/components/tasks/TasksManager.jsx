import React, { useMemo, useState } from "react";
import Modal from "../ui/Modal";
import { useTaskModels } from "@/api/queries/taskModels";
import { useItems } from "@/api/queries/items";
import { useTasks, useCreateTask, useDeleteTask } from "@/api/queries/tasks";
import { apiErrorMessage } from "@/api/apiClient";
import { isInstantiableTaskModel, isDeliverableItem } from "@/utils/schema";

function itemLabel(item) {
  if (!item) return "";
  if (item.stem) return item.stem;
  if (item.name) return item.name;
  const first = item.stimulus?.blocks?.find((b) => b?.content)?.content;
  if (first) return String(first).slice(0, 80);
  return item.id;
}

export default function TasksManager({ notify }) {
  const { data: tasks = [], isLoading: tasksLoading } = useTasks();
  const { data: taskModels = [], isLoading: taskModelsLoading } = useTaskModels();
  const { data: items = [], isLoading: itemsLoading } = useItems();
  const createTask = useCreateTask();
  const deleteTask = useDeleteTask();
  const loading = tasksLoading || taskModelsLoading || itemsLoading;

  const [selectedModelId, setSelectedModelId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [deleteModal, setDeleteModal] = useState({ open: false, taskId: null });

  const instantiableModels = useMemo(
    () => (taskModels || []).filter(isInstantiableTaskModel),
    [taskModels]
  );

  const eligibleItems = useMemo(() => {
    if (!selectedModelId) return [];
    return (items || []).filter(
      (it) => it.taskModelId === selectedModelId && isDeliverableItem(it)
    );
  }, [items, selectedModelId]);

  const handleModelChange = (taskModelId) => {
    setSelectedModelId(taskModelId);
    setSelectedItemId("");
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!selectedModelId) return notify?.("Select an instantiable Task Model");
    if (!selectedItemId) return notify?.("Select an Item Bank item to bind");
    try {
      await createTask.mutateAsync({
        taskModelId: selectedModelId,
        itemId: selectedItemId,
      });
      setSelectedModelId("");
      setSelectedItemId("");
      notify?.("Activity created");
    } catch (err) {
      console.error(err);
      notify?.("❌ Failed to create activity: " + apiErrorMessage(err, err.message));
    }
  };

  const confirmDeleteTask = (taskId) => {
    setDeleteModal({ open: true, taskId });
  };

  const performDeleteTask = async () => {
    const { taskId } = deleteModal;
    if (!taskId) return setDeleteModal({ open: false, taskId: null });
    try {
      await deleteTask.mutateAsync(taskId);
      notify?.("✅ Activity deleted successfully");
    } catch (err) {
      notify?.("❌ Failed to delete activity: " + apiErrorMessage(err, err.message));
    } finally {
      setDeleteModal({ open: false, taskId: null });
    }
  };

  const getModelName = (id) => taskModels.find((m) => m.id === id)?.name || id;
  const getBoundItemLabel = (task) => {
    if (task.itemId) {
      const item = items.find((it) => it.id === task.itemId);
      return item ? itemLabel(item) : task.itemId;
    }
    return null;
  };

  if (loading) return <div className="p-4">Loading tasks...</div>;

  const canSubmit = Boolean(selectedModelId && selectedItemId) && !createTask.isPending;

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">Instantiated tasks</h2>
      <p className="text-sm text-gray-500">
        Bind an instantiable Task Model to one Item Bank item. These rows
        are what a session schedules — not a CAF status machine, and not
        the Presentation process (that is SessionPlayer).
      </p>

      <form onSubmit={handleAdd} className="space-y-2 p-3 border rounded bg-gray-50">
        <div>
          <label className="block text-sm font-medium" htmlFor="task-model-select">
            Task Model
          </label>
          <select
            id="task-model-select"
            className="border p-2 rounded w-full"
            value={selectedModelId}
            onChange={(e) => handleModelChange(e.target.value)}
          >
            <option value="">Select an instantiable Task Model</option>
            {instantiableModels.map((tm) => (
              <option key={tm.id} value={tm.id}>
                {tm.name || tm.id}
              </option>
            ))}
          </select>
          {instantiableModels.length === 0 && (
            <p className="text-sm text-amber-700 mt-1">
              No instantiable Task Models. Confirm and lock a Task Model
              before creating an instantiated task.
            </p>
          )}
        </div>

        {selectedModelId && (
          <div>
            <label className="block text-sm font-medium" htmlFor="item-select">
              Item Bank item
            </label>
            <select
              id="item-select"
              className="border p-2 rounded w-full"
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
            >
              <option value="">Select an item to bind</option>
              {eligibleItems.map((it) => (
                <option key={it.id} value={it.id}>
                  {itemLabel(it)} ({it.id})
                </option>
              ))}
            </select>
            {eligibleItems.length === 0 && (
              <p className="text-sm text-amber-700 mt-1">
                No deliverable items instantiate this Task Model.
                Suspended and archived items cannot be bound.
              </p>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Create activity
        </button>
      </form>

      {tasks.length > 0 ? (
        <ul className="divide-y border rounded">
          {tasks.map((t) => {
            const bound = getBoundItemLabel(t);
            return (
              <li key={t.id} className="flex justify-between items-center p-2">
                <div>
                  <div className="font-medium">{getModelName(t.taskModelId)}</div>
                  {t.itemId && (
                    <div className="text-sm text-gray-600">
                      Item: {bound}{" "}
                      <span className="text-gray-400">({t.itemId})</span>
                    </div>
                  )}
                  {t.questionId && !t.itemId && (
                    <div className="text-sm text-gray-600">Q: {t.questionId}</div>
                  )}
                  <div className="text-xs text-gray-400">{t.id}</div>
                </div>
                <button
                  type="button"
                  onClick={() => confirmDeleteTask(t.id)}
                  className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                >
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">No activities defined yet</p>
      )}
      <Modal
        isOpen={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, taskId: null })}
        onConfirm={performDeleteTask}
        title="Confirm Delete"
        message="Are you sure you want to delete this task?"
        confirmClass="bg-red-500 hover:bg-red-600 text-white"
      />
    </div>
  );
}
