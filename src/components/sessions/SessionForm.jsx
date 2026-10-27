import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { usePolicies } from "../../api/queries/policies";
import { useDeliveryModels } from "../../api/queries/deliveryModels";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

const EMPTY_MODEL = {};

// SessionForm.jsx
// Props:
// - model: session object (may be partial for new)
// - students: array of students [{id, name}]
// - tasks: array of tasks [{id, taskModelId, questionId, taskModel?: {competencyId, evidenceId}, ...}]
// - onSave(sessionPayload)
// - onCancel()
// - notify(message)

export default function SessionForm({ model = EMPTY_MODEL, students = [], cohorts = [], tasks = [], onSave = () => {}, onCancel = () => {}, notify = () => {} }) {
  const [studentId, setStudentId] = useState(model.studentId || "");
  const [selectedStudentIds, setSelectedStudentIds] = useState(
    model.studentIds || (model.studentId ? [model.studentId] : [])
  );
  const [studentIdInput, setStudentIdInput] = useState("");
  const [cohortId, setCohortId] = useState(model.cohortId || "");
  const [assignmentMode, setAssignmentMode] = useState(
    model.cohortId || (model.studentIds && model.studentIds.length > 1) ? "cohort" : "students"
  );
  const [selectedTasks, setSelectedTasks] = useState(model.taskIds || []);
  const [selectionStrategy, setSelectionStrategy] = useState(model.selectionStrategy || "fixed");
  // Policy list now comes from the shared usePolicies() cache (see
  // src/api/queries/policies.js) instead of its own fetch — Phase 2
  // data-layer migration.
  const { data: policies = [] } = usePolicies();
  const { data: deliveryModels = [] } = useDeliveryModels();
  const [policyId, setPolicyId] = useState(model.nextTaskPolicy?.policyId || "");
  const [deliveryModelId, setDeliveryModelId] = useState(model.deliveryModelId || "");
  const [busy, setBusy] = useState(false);
  const ACTIVITY_STRATEGIES = [
    {
      group: "Basic Strategy",
      options: [
        {
          value: "fixed",
          label: "Fixed Order (Same for Everyone)",
          description: "Students receive activities in a fixed, pre-set sequence."
        }
      ]
    },
    {
      group: "Adaptive Strategies",
      options: [
        {
          value: "IRT",
          label: "Adaptive by Performance (Smart Difficulty)",
          description: "Each next activity is chosen based on student performance using Item Response Theory."
        },
        {
          value: "BayesianNetwork",
          label: "Skill-based Adaptive (Using Learning Map)",
          description: "Activities adapt based on mastery of linked skills inferred through a Bayesian network model."
        },
        {
          value: "MarkovChain",
          label: "Pattern-based Adaptive (Learning Flow)",
          description: "Next activity predicted from learning patterns using a Markov chain."
        }
      ]
    }
  ];

  // const notify = (msg, type = "info") => {
  //   if (type === "success") toast.success(msg);
  //   else if (type === "error") toast.error(msg);
  //   else toast(msg);
  // };
  
  useEffect(() => {
    setStudentId(model.studentId || "");
    setSelectedStudentIds(model.studentIds || (model.studentId ? [model.studentId] : []));
    setCohortId(model.cohortId || "");
    setStudentIdInput("");
    setSelectedTasks(model.taskIds || []);
    setSelectionStrategy(model.selectionStrategy || "fixed");
    setPolicyId(model.nextTaskPolicy?.policyId || "");
    setDeliveryModelId(model.deliveryModelId || "");
  }, [model]);

  const toggleStudent = (id) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    setStudentId(id);
  };

  const addStudentById = () => {
    const raw = studentIdInput.trim();
    if (!raw) return notify("Enter a student ID or username");
    if (!selectedStudentIds.includes(raw)) {
      setSelectedStudentIds((prev) => [...prev, raw]);
    }
    setStudentId(raw);
    setStudentIdInput("");
  };

  const toggleTask = (taskId) => {
    if (selectedTasks.includes(taskId)) {
      setSelectedTasks(selectedTasks.filter((t) => t !== taskId));
    } else {
      setSelectedTasks([...selectedTasks, taskId]);
    }
  };

  const moveTask = (index, dir) => {
    const newList = [...selectedTasks];
    const swapIndex = dir === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newList.length) return;
    const tmp = newList[swapIndex];
    newList[swapIndex] = newList[index];
    newList[index] = tmp;
    setSelectedTasks(newList);
  };

  const handleStrategyChange = (val) => {
    setSelectionStrategy(val);
    setPolicyId("");
  };

  useEffect(() => {
    if (deliveryModelId) return;
    const matches = policies.filter((p) => p.type === selectionStrategy);
    if (matches.length === 1) {
      setPolicyId((current) => current || matches[0].id);
    }
  }, [policies, selectionStrategy, deliveryModelId]);

  const handleDeliveryModelChange = (value) => {
    setDeliveryModelId(value);
    if (!value) return;
    const chosen = deliveryModels.find((row) => row.id === value);
    if (!chosen) return;
    const policy = policies.find((row) => row.id === chosen.policyId);
    if (policy?.type) setSelectionStrategy(policy.type);
    if (chosen.policyId) setPolicyId(chosen.policyId);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const assignees = [...selectedStudentIds];
    if (studentId && !assignees.includes(studentId)) assignees.push(studentId);
    if (assignmentMode !== "cohort" && assignees.length === 0) {
      return notify("Please select a student or enter a student ID");
    }
    if (assignmentMode === "cohort" && !cohortId && assignees.length === 0) {
      return notify("Please select a cohort or add at least one student");
    }
    if (!Array.isArray(selectedTasks) || selectedTasks.length === 0) return notify("Please select at least one activity");
    const matchingPolicies = policies.filter((p) => p.type === selectionStrategy);
    const chosen = policyId || (matchingPolicies.length === 1 ? matchingPolicies[0].id : "");
    if (matchingPolicies.length > 0 && !chosen) {
      return notify("Choose the selection policy for this strategy");
    }

    const payload = {
      id: model.id,
      studentId: assignees[0] || "",
      studentIds: assignees,
      cohortId: assignmentMode === "cohort" ? cohortId : "",
      taskIds: selectedTasks,
      selectionStrategy,
      nextTaskPolicy: chosen ? { policyId: chosen } : {},
      ...(deliveryModelId ? { deliveryModelId } : {}),
    };

    setBusy(true);
    try {
      onSave(payload);
    } catch (e) {
      console.error(e);
      notify("Failed to save session");
    } finally {
      setBusy(false);
    }
  };

  // 🔑 Enhanced task label: Question + Competency + Evidence + Model
  const getTaskLabel = (t) => {
    const parts = [];
    if (t.questionId) parts.push(`Q: ${t.questionId}`);
    if (t.taskModel?.competencyId) parts.push(`C: ${t.taskModel.competencyId}`);
    if (t.taskModel?.evidenceId) parts.push(`E: ${t.taskModel.evidenceId}`);
    if (t.taskModelId) parts.push(`M: ${t.taskModelId}`);
    return parts.join(" • ") || t.id;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block font-medium">Assign to</label>
        <div className="flex gap-4 text-sm mt-1 mb-2">
          <label className="inline-flex items-center gap-1">
            <input
              type="radio"
              name="assignmentMode"
              value="students"
              checked={assignmentMode === "students"}
              onChange={() => setAssignmentMode("students")}
            />
            Students
          </label>
          <label className="inline-flex items-center gap-1">
            <input
              type="radio"
              name="assignmentMode"
              value="cohort"
              checked={assignmentMode === "cohort"}
              onChange={() => setAssignmentMode("cohort")}
            />
            Cohort
          </label>
        </div>

        {assignmentMode === "cohort" && (
          <select
            value={cohortId}
            onChange={(e) => setCohortId(e.target.value)}
            className="border p-2 rounded w-full mb-2"
            data-testid="cohort-select"
          >
            <option value="">Select cohort</option>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.id} ({(c.studentIds || []).length} students)
              </option>
            ))}
            {cohorts.length === 0 && (
              <option value="" disabled>
                No class cohorts yet — add students with a class, or use IDs below
              </option>
            )}
          </select>
        )}

        <div className="max-h-40 overflow-auto border rounded p-2 bg-white" data-testid="student-picker">
          {students.length === 0 && (
            <p className="text-sm text-gray-500 mb-2">
              No roster yet. Enter a student ID or username (for example stud1).
            </p>
          )}
          {students.map((s) => {
            const label = s.name || s.username || s.id;
            const checked = selectedStudentIds.includes(s.id) || selectedStudentIds.includes(s.username);
            return (
              <label key={s.id} className="block text-sm py-0.5">
                <input
                  type="checkbox"
                  checked={!!checked}
                  onChange={() => toggleStudent(s.id)}
                />{" "}
                {label}
                {s.username && s.username !== label ? ` (${s.username})` : ""}
                {s.classId ? ` · class ${s.classId}` : ""}
              </label>
            );
          })}
        </div>

        <div className="flex gap-2 mt-2">
          <input
            type="text"
            value={studentIdInput}
            onChange={(e) => setStudentIdInput(e.target.value)}
            placeholder="Student with ID / username"
            className="border p-2 rounded flex-1"
            data-testid="student-id-input"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addStudentById();
              }
            }}
          />
          <button
            type="button"
            onClick={addStudentById}
            className="px-3 py-2 border rounded bg-white hover:bg-gray-50"
          >
            Add ID
          </button>
        </div>
        {selectedStudentIds.length > 0 && (
          <p className="text-xs text-gray-600 mt-1" data-testid="selected-assignees">
            Assigned: {selectedStudentIds.join(", ")}
          </p>
        )}
      </div>

      <div>
        <label className="block font-medium">Select Tasks (order matters)</label>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600">Available Tasks</p>
            <div className="max-h-48 overflow-auto border rounded p-2 mt-2 bg-white">
              {tasks.map((t) => (
                <label key={t.id} className="block text-sm">
                  <input type="checkbox" checked={selectedTasks.includes(t.id)} onChange={() => toggleTask(t.id)} />{" "}
                  <span className="font-medium">{t.questionId || "No Question"}</span>{" "}
                  <span className="text-gray-500 ml-1">
                    [{t.taskModel?.competencyId || "?"} / {t.taskModel?.evidenceId || "?"}]
                  </span>
                  <span className="text-gray-400 ml-1">({t.id})</span>
                </label>
              ))}
              {tasks.length === 0 && <p className="text-gray-500 text-sm">No tasks available</p>}
            </div>
          </div>

          <div>
            <p className="text-sm text-gray-600">Selected (ordered)</p>
            <div className="max-h-48 overflow-auto border rounded p-2 mt-2 bg-white">
              {selectedTasks.map((tid, idx) => {
                const t = tasks.find((x) => x.id === tid) || { id: tid };
                return (
                  <div key={tid} className="flex items-center justify-between text-sm py-1">
                    <div className="truncate">
                      {getTaskLabel(t)} <span className="text-gray-400">({tid})</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <button type="button" onClick={() => moveTask(idx, "up")} title="Move up" className="px-2 py-0.5 border rounded">↑</button>
                      <button type="button" onClick={() => moveTask(idx, "down")} title="Move down" className="px-2 py-0.5 border rounded">↓</button>
                      <button type="button" onClick={() => toggleTask(tid)} title="Remove" className="px-2 py-0.5 border rounded text-red-600">✕</button>
                    </div>
                  </div>
                );
              })}
              {selectedTasks.length === 0 && <p className="text-gray-500 text-sm">No tasks selected</p>}
            </div>
          </div>
        </div>
      </div>

      <div>
        <label className="block font-medium mb-1" htmlFor="delivery-model-select">
          Delivery model
        </label>
        <select
          id="delivery-model-select"
          aria-label="Delivery model"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          value={deliveryModelId}
          onChange={(event) => handleDeliveryModelChange(event.target.value)}
        >
          <option value="">None. Choose a strategy and policy below.</option>
          {deliveryModels.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name || row.id} ({row.status || "draft"})
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500">
          When a delivery model is selected, the session uses its assembly model and selection policy.
        </p>
      </div>

      <div>
        <label className="block font-medium mb-1">Activity Selection Strategy</label>

        <Select value={selectionStrategy} onValueChange={handleStrategyChange} disabled={Boolean(deliveryModelId)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select activity selection strategy" />
          </SelectTrigger>
          <SelectContent>
            {ACTIVITY_STRATEGIES.map((group) => (
              <SelectGroup key={group.group}>
                <SelectLabel>{group.group}</SelectLabel>
                {group.options.map((opt) => (
                  <TooltipProvider key={opt.value}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SelectItem value={opt.value}>{opt.label}</SelectItem>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-sm">
                        {opt.description}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="block font-medium mb-1">Select Assessment Policy</label>
        <Select value={policyId} onValueChange={setPolicyId} disabled={Boolean(deliveryModelId)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a policy defined by Admin" />
          </SelectTrigger>
          <SelectContent>
            {["fixed", "IRT", "BayesianNetwork", "MarkovChain"].map((strategyType) => {
              const groupPolicies = policies.filter((p) => p.type === strategyType);
              if (groupPolicies.length === 0 || strategyType !== selectionStrategy) return null;
              return (
                <SelectGroup key={strategyType}>
                  <SelectLabel>
                    {strategyType === "fixed" && "Fixed Order policies"}
                    {strategyType === "IRT" && "IRT-based Policies"}
                    {strategyType === "BayesianNetwork" && "Bayesian Network Policies"}
                    {strategyType === "MarkovChain" && "Markov Chain Policies"}
                  </SelectLabel>
                  {groupPolicies.map((p) => (
                    <TooltipProvider key={p.id}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <SelectItem value={p.id}>{p.name}</SelectItem>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-sm">
                          {p.description || "No description provided by Admin."}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </SelectGroup>
              );
            })}
          </SelectContent>
        </Select>
        {policies.filter((p) => p.type === selectionStrategy).length === 0 ? (
          <p className="mt-1 text-sm text-red-600">
            No {selectionStrategy} policy yet. Create one under Home → Selection policies.
          </p>
        ) : (
          <p className="text-xs text-gray-400 mt-1">
            Fixed Order uses a selection policy of type fixed. Create policies under Home → Selection policies.
          </p>
        )}
      </div>


      <div className="flex space-x-2">
        <button type="submit" disabled={busy} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save Session</button>
        <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Cancel</button>
      </div>
    </form>
  );
}
