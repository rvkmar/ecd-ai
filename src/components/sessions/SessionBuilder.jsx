import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import SessionList from "./SessionList";
import SessionForm from "./SessionForm";
import SessionReport from "./SessionReport";
import NavBar from "../ui/NavBar";
import { SESSION_STATUS } from "@/utils/sessionStatus";
import { sessionReviewPath } from "@/utils/sessionPlay";
import Modal from "../ui/Modal";
import toast from "react-hot-toast";
import { useAuth } from "@/auth/AuthProvider";
import { apiFetch, apiErrorMessage } from "@/api/apiClient";


// SessionBuilder.jsx
// Top-level manager for Sessions

export default function SessionBuilder({ notify: notifyProp }) {
  const { auth } = useAuth() || {};
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [students, setStudents] = useState([]);
  const [cohorts, setCohorts] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [reportSessionId, setReportSessionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sessionTab, setSessionTab] = useState("active"); // "active" | "archived"
  const [activeCount, setActiveCount] = useState(0);
  const [archivedCount, setArchivedCount] = useState(0);

  const [deleteModal, setDeleteModal] = useState({ open: false, sessionId: null });

  const notify = (msg, type = "info") => {
    if (typeof notifyProp === "function") {
      notifyProp(msg, type);
      return;
    }
    if (type === "success") toast.success(msg);
    else if (type === "error") toast.error(msg);
    else toast(msg);
  };

  // Load sessions + supporting collections. sessionTab is a dependency so
  // Active / Archived actually refetch (the previous [] mount-only effect
  // left the list stale after a tab change).
  useEffect(() => {
    loadAll();
  }, [sessionTab]);

  // const loadAll = async () => {
  //   setLoading(true);
  //   try {
  //     const [sessData, stuData, taskData] = await Promise.all([
  //       fetch("/api/sessions").then((r) => r.json()),
  //       fetch("/api/students").then((r) => r.json()),
  //       fetch("/api/tasks").then((r) => r.json()),
  //     ]);

  //     // enrich tasks with taskModel info
  //     const enrichedTasks = await Promise.all(
  //       (taskData || []).map(async (t) => {
  //         if (t.taskModelId) {
  //           try {
  //             const tm = await fetch(`/api/taskModels/${t.taskModelId}`).then(
  //               (r) => r.json()
  //             );
  //             return { ...t, taskModel: tm };
  //           } catch {
  //             return t;
  //           }
  //         }
  //         return t;
  //       })
  //     );

  //     setSessions(sessData || []);
  //     setStudents(stuData || []);
  //     setTasks(enrichedTasks);
  //   } catch (err) {
  //     console.error("Failed to load sessions/students/tasks", err);
  //     notify?.("❌ Failed to load sessions or supporting data");
  //   } finally {
  //     setLoading(false);
  //   }
  // };

    const loadAll = () => {
    setLoading(true);

    const sessionsUrl =
      sessionTab === "archived" ? "/api/sessions/archived" : "/api/sessions/active";
    Promise.all([
      apiFetch("/api/sessions/active", {}, auth),    // for counts
      apiFetch("/api/sessions/archived", {}, auth),  // for counts
      apiFetch(sessionsUrl, {}, auth),               // actual list
      apiFetch("/api/students", {}, auth).catch(() => []),
      apiFetch("/api/tasks", {}, auth).catch(() => []),
      apiFetch("/api/students/assignable", {}, auth).catch(() => null),
    ])
      .then(([activeData, archivedData, currentData, stuData, taskData, assignable]) => {
        setActiveCount((activeData || []).length);
        setArchivedCount((archivedData || []).length);
        setSessions(currentData || []);   // ✅ show active or archived depending on tab
        if (assignable && Array.isArray(assignable.students) && assignable.students.length) {
          setStudents(assignable.students);
          setCohorts(assignable.cohorts || []);
        } else {
          setStudents(stuData || []);
          setCohorts([]);
        }
        setTasks(taskData || []);
      })
      .catch((err) => {
        console.error("Failed to load sessions/students/tasks", err);
        notify?.("Failed to load sessions or supporting data");
      })
      .finally(() => setLoading(false));
  };


  // Create session only (no PUT/update)
  const handleSave = async (sessionPayload) => {
    setBusy(true);
    try {
      const created = await apiFetch(
        `/api/sessions`,
        {
          method: "POST",
          body: JSON.stringify(sessionPayload),
        },
        auth
      );
      const createdSessions = Array.isArray(created?.sessions)
        ? created.sessions
        : created
          ? [created]
          : [];
      setSessions((prev) => [...prev, ...createdSessions]);
      notify?.(
        createdSessions.length > 1
          ? `${createdSessions.length} sessions created for the cohort.`
          : "Session created."
      );
      setSelectedSession(null);
    } catch (e) {
      console.error(e);
      notify?.(`❌ ${apiErrorMessage(e, e.message || "Failed to create session")}`);
    } finally {
      setBusy(false);
    }
  };

  // const handleDelete = async (id) => {
  //   if (!confirm("Delete this session? This cannot be undone.")) return;
  //   setBusy(true);
  //   try {
  //     const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
  //     if (!res.ok) {
  //       const err = await res.json().catch(() => ({}));
  //       throw new Error(err.error || `Failed to delete (status ${res.status})`);
  //     }
  //     setSessions((prev) => prev.filter((s) => s.id !== id));
  //     notify?.("Session deleted.");
  //   } catch (e) {
  //     console.error(e);
  //     notify?.("❌ Failed to delete session");
  //   } finally {
  //     setBusy(false);
  //   }
  // };

  const confirmDeleteSession = (sessionId) => {
    setDeleteModal({ open: true, sessionId });
  };

  const performDeleteSession = async () => {
    const { sessionId } = deleteModal;
    if (!sessionId) return setDeleteModal({ open: false, sessionId: null });
    try {
      await apiFetch(`/api/sessions/${sessionId}`, { method: "DELETE" }, auth);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      notify?.("✅ Session deleted successfully");
    } catch (err) {
      notify?.("❌ Failed to delete session: " + apiErrorMessage(err, err.message));
    } finally {
      setDeleteModal({ open: false, sessionId: null });
    }
  };

  const handlePause = async (id) => {
    try {
      const updated = await apiFetch(`/api/sessions/${id}/pause`, { method: "POST" }, auth);
      setSessions((prev) => prev.map((s) => (s.id === id ? updated : s)));
      notify?.("Session paused.");
    } catch (e) {
      console.error(e);
      notify?.("❌ Failed to pause session");
    }
  };

  const handleResume = async (id) => {
    try {
      const updated = await apiFetch(`/api/sessions/${id}/resume`, { method: "POST" }, auth);
      setSessions((prev) => prev.map((s) => (s.id === id ? updated : s)));
      notify?.("Session resumed.");
    } catch (e) {
      console.error(e);
      notify?.("❌ Failed to resume session");
    }
  };

    const handleArchive = async (id) => {
    try {
      await apiFetch(`/api/sessions/${id}/archive`, { method: "POST" }, auth);
      notify?.("Session archived.");
      // Reload sessions so it disappears from Active and shows in Archived
      loadAll();
    } catch (e) {
      console.error(e);
      notify?.("❌ Failed to archive session");
    }
  };

  const handlePlay = async (session) => {
    // Persist start/resume on the list. Do not navigate into the player —
    // that trapped staff in the finish flow so they could not run multiple
    // sessions. Review is the path into the player.
    try {
      const updated = await apiFetch(
        `/api/sessions/${session.id}/play`,
        { method: "POST" },
        auth
      );
      setSessions((prev) => prev.map((s) => (s.id === session.id ? updated : s)));
      notify("Session is in progress.", "success");
    } catch (e) {
      console.error(e);
      notify(apiErrorMessage(e, "Failed to play session"), "error");
    }
  };

  const openStaffReview = (session) => {
    const path = sessionReviewPath(auth?.role, session.id);
    if (!path) {
      notify("Cannot open this session for your role.", "error");
      return;
    }
    navigate(path);
  };

  const handleOperate = (session) => openStaffReview(session);
  const handleView = (session) => openStaffReview(session);

  const handleViewReport = (sessionId) => {
    setReportSessionId(sessionId);
  };

  if (loading) {
    return <div className="p-6">Loading sessions...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Student Sessions</h2>
        <div className="flex items-center space-x-2">
          <button
            className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
            onClick={() =>
              setSelectedSession({
                taskIds: [],
                studentId: "",
                studentIds: [],
                selectionStrategy: "fixed",
                nextTaskPolicy: {},
                status: SESSION_STATUS.READY,
              })
            }
          >
            + New Session
          </button>
        </div>
      </div>

      <NavBar
        tabs={[
          { id: "active", label: `Active Sessions (${activeCount})` },
          { id: "archived", label: `Archived Sessions (${archivedCount})` },
        ]}
        active={sessionTab}
        onSelect={setSessionTab}
        color="indigo"
      />

      {/* Session list */}
      <SessionList
        sessions={sessions}
        students={students}
        onPlay={handlePlay}
        onPause={handlePause}
        onOperate={handleOperate}
        onView={handleView}
        onResume={handlePlay}
        onArchive={handleArchive}
        onViewReport={handleViewReport}
      />

      {/* Editor / Form area */}
      {selectedSession && (
        <div className="p-4 border rounded-md bg-gray-50">
          <h3 className="text-lg font-semibold">New Session</h3>
          <div className="mt-3">
            <SessionForm
              model={selectedSession}
              students={students}
              cohorts={cohorts}
              tasks={tasks}
              onSave={handleSave}
              onCancel={() => setSelectedSession(null)}
              notify={notify}
            />
          </div>
        </div>
      )}

      {/* Report viewer — overlay so Report is visible above the list */}
      {reportSessionId && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Session report"
        >
          <div className="my-8 w-full max-w-3xl rounded-xl border border-slate-200 bg-white shadow-xl">
            <SessionReport
              sessionId={reportSessionId}
              onClose={() => setReportSessionId(null)}
            />
          </div>
        </div>
      )}

      {busy && <div className="text-sm text-gray-500">Working...</div>}
      <Modal
        isOpen={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, sessionId: null })}
        onConfirm={performDeleteSession}
        title="Confirm Delete"
        message="Delete this session? This action cannot be undone."
        confirmClass="bg-red-500 hover:bg-red-600 text-white"
      />
    </div>
  );
}
