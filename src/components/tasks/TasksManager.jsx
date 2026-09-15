import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import Modal from "../ui/Modal";
import { useTaskModels } from "@/api/queries/taskModels";
import { useQuestions } from "@/api/queries/questions";
import { useAuth } from "@/auth/AuthProvider";
import { apiFetch, apiErrorMessage } from "@/api/apiClient";

// TasksManager.jsx
// Minimal UI for managing tasks (create instances of task models with optional linked questions)

export default function TasksManager({ notify }) {
  const [tasks, setTasks] = useState([]);
  const [loadingOther, setLoadingOther] = useState(true);

  // Phase 2: taskModels and questions come from the shared query hooks;
  // tasks has no query module yet, so the three writes below go through
  // apiFetch directly.
  const { auth } = useAuth() || {};
  const { data: taskModels = [], isLoading: taskModelsLoading } = useTaskModels();
  const { data: questions = [], isLoading: questionsLoading } = useQuestions();
  const loading = loadingOther || taskModelsLoading || questionsLoading;

  // const notify = (msg, type = "info") => {
  //   if (type === "success") toast.success(msg);
  //   else if (type === "error") toast.error(msg);
  //   else toast(msg);
  // };

  const [selectedModelId, setSelectedModelId] = useState("");
  const [mappedQuestions, setMappedQuestions] = useState([]);

  const [deleteModal, setDeleteModal] = useState({ open: false, taskId: null });

  // Load tasks
  useEffect(() => {
    apiFetch("/api/tasks", {}, auth)
      .then((t) => setTasks(t || []))
      .catch(() => notify?.("❌ Failed to load activities"))
      .finally(() => setLoadingOther(false));
  }, []);

  // When Task Model changes, show which questions it contains via itemMappings
  useEffect(() => {
    if (!selectedModelId) {
      setMappedQuestions([]);
      return;
    }
    const tm = taskModels.find((m) => m.id === selectedModelId);
    if (!tm || !tm.itemMappings) {
      setMappedQuestions([]);
      return;
    }
    const qids = tm.itemMappings.map((m) => m.itemId);
    const qlist = questions.filter((q) => qids.includes(q.id));
    setMappedQuestions(qlist);
  }, [selectedModelId, taskModels, questions]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!selectedModelId) return notify?.("Select an activity template");
    try {
      const created = await apiFetch(
        "/api/tasks",
        {
          method: "POST",
          body: JSON.stringify({
            taskModelId: selectedModelId,
          }),
        },
        auth
      );
      setTasks([...tasks, created]);
      setSelectedModelId("");
      notify?.("Activity created");
    } catch (err) {
      console.error(err);
      notify?.("❌ Failed to create activity");
    }
  };

  // const handleDelete = async (id) => {
  //   if (!confirm("Delete this activity?")) return;
  //   try {
  //     const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
  //     if (!res.ok) throw new Error("Failed to delete activity");
  //     setTasks(tasks.filter((t) => t.id !== id));
  //     notify?.("Activity deleted");
  //   } catch (err) {
  //     console.error(err);
  //     notify?.("❌ Failed to delete activity");
  //   }
  // };

  const confirmDeleteTask = (taskId) => {
    setDeleteModal({ open: true, taskId });
  };

  const performDeleteTask = async () => {
    const { taskId } = deleteModal;
    if (!taskId) return setDeleteModal({ open: false, taskId: null });
    try {
      await apiFetch(`/api/tasks/${taskId}`, { method: "DELETE" }, auth);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      notify?.("✅ Activity deleted successfully");
    } catch (err) {
      notify?.("❌ Failed to delete activity: " + apiErrorMessage(err, err.message));
    } finally {
      setDeleteModal({ open: false, taskId: null });
    }
  };

  const getModelName = (id) => taskModels.find((m) => m.id === id)?.name || id;
  const getQuestionStem = (id) => questions.find((q) => q.id === id)?.stem || id;

  if (loading) return <div className="p-4">Loading tasks...</div>;

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">Activities</h2>
      <p className="text-sm text-gray-500">
        Instantiated Task Models (PADI TR9 §2.4 task specs). Not the
        Presentation process — that is SessionPlayer. Assembly and evidence
        accumulation run when a session selects and scores these activities.
      </p>

      {/* Add new task */}
      <form onSubmit={handleAdd} className="space-y-2 p-3 border rounded bg-gray-50">
        <div>
          <label className="block text-sm font-medium">Activity Template</label>
          <select
            className="border p-2 rounded w-full"
            value={selectedModelId}
            onChange={(e) => setSelectedModelId(e.target.value)}
          >
            <option value="">Select a activity template</option>
            {taskModels.map((tm) => (
              <option key={tm.id} value={tm.id}>{tm.name || tm.id}</option>
            ))}
          </select>
        </div>

        {/* Show questions already mapped in the selected Task Model */}
        {mappedQuestions.length > 0 && (
          <div className="border-t pt-2 mt-2">
            <p className="text-sm font-medium text-gray-700">
              This Activity Template includes the following questions:
            </p>
            <ul className="list-disc list-inside text-sm text-gray-600">
              {mappedQuestions.map((q) => (
                <li key={q.id}>
                  {q.stem ? q.stem.slice(0, 60) : q.id}{" "}
                  <span className="text-gray-400">({q.id})</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button type="submit" className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
          Create Acvitity
        </button>
      </form>

      {/* List tasks */}
      {tasks.length > 0 ? (
        <ul className="divide-y border rounded">
          {tasks.map((t) => (
            <li key={t.id} className="flex justify-between items-center p-2">
              <div>
                <div className="font-medium">{getModelName(t.taskModelId)}</div>
                {t.questionId && (
                  <div className="text-sm text-gray-600">Q: {getQuestionStem(t.questionId)}</div>
                )}
                <div className="text-xs text-gray-400">{t.id}</div>
              </div>
              <button
                onClick={() => confirmDeleteTask(t.id)}
                className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Delete
              </button>
            </li>
          ))}
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
