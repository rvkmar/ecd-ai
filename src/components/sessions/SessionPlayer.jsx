import ItemPresenter, { canPresentItem } from "./ItemPresenter";
import React, { useEffect, useState, useRef } from "react";
import Modal from "../ui/Modal";
import toast from "react-hot-toast";
import { usePolicies } from "../../api/queries/policies";
import { useAuth } from "../../auth/AuthProvider";
import { apiFetch, apiErrorMessage } from "../../api/apiClient";
import { SESSION_STATUS } from "../../utils/sessionStatus";
import {
  canPauseSession,
  sessionListPath,
  isSessionClosedForStudent,
} from "../../utils/sessionPlay";
import { measurementStopHeading, measurementStopDetails } from "./measurementStop";
import SessionReport from "./SessionReport";
import StudentSessionWizard, {
  WIZARD_PHASE,
} from "./StudentSessionWizard";

import { useNavigate, useParams } from "react-router-dom";
// SessionPlayer.jsx
// Runtime delivery component for a session.
// Student mode uses StudentSessionWizard (Draft → Review → Completed → Submit).
// Staff review mode keeps the legacy layout.

export default function SessionPlayer({
  sessionId: propSessionId,
  onFinished,
  mode = "student", // "student" | "teacher"
}) {
  // ----- session identification -----
  const [sessionId, setSessionId] = useState(propSessionId || null);

  const notify = (msg, type = "info") => {
    if (type === "success") toast.success(msg);
    else if (type === "error") toast.error(msg);
    else toast(msg);
  };

  // ----- domain state -----
  const [session, setSession] = useState(null); // full session object from backend
  const [currentTaskId, setCurrentTaskId] = useState(null);
  const [task, setTask] = useState(null); // enriched task for currentTaskId
  const [taskModel, setTaskModel] = useState(null); // enriched taskModel for the current task
  // D47: when the current task names an ITEM, these carry it. `question`
  // stays null in that case and vice versa -- a task names either a
  // questionId or an itemId, never both (enforced in tasksRoutes.js), so
  // exactly one of these two paths is live for any given task.
  const [deliveredItem, setDeliveredItem] = useState(null);
  const [itemResponse, setItemResponse] = useState(null);
  const [question, setQuestion] = useState(null);
  const [evidenceModels, setEvidenceModels] = useState([]);
  
  // --- Reading comprehension support ---
  const [readingPassage, setReadingPassage] = useState(null);

  // 🔹 Track currently active passage group to avoid flicker
  const [activePassageId, setActivePassageId] = useState(null);
  const [activePassageQuestions, setActivePassageQuestions] = useState([]);

  // ----- shared stimulus / parent task support -----
  const [parentTaskModel, setParentTaskModel] = useState(null);

  // ----- UI state -----
  const [loading, setLoading] = useState(true);
  const [loadingTask, setLoadingTask] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [noMoreTasks, setNoMoreTasks] = useState(false);
  // D58: the Assembly Model stop, when /next-task (or a previously persisted
  // session.stopped) says measurement is done. Distinct from noMoreTasks,
  // which is also true for an empty task list that never met a target.
  const [measurementStop, setMeasurementStop] = useState(null);

  // Inputs / runtime state
  const [selectedOptionId, setSelectedOptionId] = useState(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [selectedRubricLevel, setSelectedRubricLevel] = useState(null);

  // deadline / countdown UI
  const [deadline, setDeadline] = useState(null); // Date object or null
  const [countdownMs, setCountdownMs] = useState(null); // ms remaining or null

  // Banners / messages / locks
  const [showResumedBanner, setShowResumedBanner] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishModalOpen, setFinishModalOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());

  // Policy name resolution now goes through the shared usePolicies() cache
  // (see src/api/queries/policies.js) instead of its own fetch — Phase 2
  // data-layer migration.
  const { auth } = useAuth() || {};
  const { data: policies = [] } = usePolicies();

  const [completeModal, setCompleteModal] = useState(false);
  // Student wizard lifecycle (client phase). Server status stays ready /
  // in_progress until Submit calls /finish → completed.
  const [wizardPhase, setWizardPhase] = useState(WIZARD_PHASE.DRAFT);
  const sessionBootstrappedRef = useRef(false);

  const getPolicyName = (policyId) => {
    if (!policyId) return null;
    const p = (policies || []).find((pol) => pol.id === policyId);
    return p ? p.name : policyId;
  };

  // keep a ref to avoid stale closures in async helpers
  const sessionIdRef = useRef(sessionId);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  /* ----- derive sessionId when no prop was passed -----
     D50 (finding F7). This used to be a raw regex on window.location.pathname
     looking for `/sessions/(s\d+)/player`. NO ROUTE IN App.jsx HAS EVER
     PRODUCED THAT SHAPE: every role registers `sessions/play` (no id) and
     `sessions/:sessionId/review`. The component also never read useParams().
     So the player could not obtain a session id from any route the app
     defines, and StudentDashboard renders it with no prop -- which meant a
     student could not reach a session at all, and the district/teacher review
     route could not load one either.

     Verified in a browser before changing anything: /student/sessions/<id>/player
     fell through to the dashboard, and the Play tab reported "Session id not
     provided."

     useParams() is now the primary source, so the id comes from the route
     definition rather than from a pattern the routes have to happen to match.
     The legacy regex is kept as a fallback for any bookmarked `/player` URL,
     and `id` is accepted alongside `sessionId` so a route may name it either
     way without silently rendering an empty player. */
  const routeParams = useParams();

  useEffect(() => {
    if (propSessionId) return;

    const fromRoute = routeParams?.sessionId || routeParams?.id;
    if (fromRoute) {
      setSessionId(fromRoute);
      return;
    }

    try {
      const m = window.location.pathname.match(/\/sessions\/(s[0-9]+)\/(?:player|review)/);
      if (m) setSessionId(m[1]);
    } catch (e) {
      // ignore quietly
    }
  }, [propSessionId, routeParams?.sessionId, routeParams?.id]);

  // ----- teacher review mode indicator -----
  const isTeacher = mode === "teacher";

  // navigation hook for redirect after review finalization
  const navigate = useNavigate();

  // ----- helper: fetch JSON safely -----
  async function fetchJsonSafe(url) {
    return apiFetch(url, {}, auth);
  }

  // ----- helper: fetch and attach taskModel to a task object -----
  // Returns a new task object with `taskModel` populated if available.
  async function enrichTaskWithModel(taskObj) {
    if (!taskObj) return taskObj;
    if (taskObj.taskModel) return taskObj; // already enriched
    if (!taskObj.taskModelId) return taskObj;

    try {
      const tm = await fetchJsonSafe(`/api/taskModels/${taskObj.taskModelId}`);
      return { ...taskObj, taskModel: tm };
    } catch (e) {
      // failed to enrich; return original task (silently)
      console.warn(`Failed to fetch taskModel ${taskObj.taskModelId}:`, e);
      return taskObj;
    }
  }

  // ----- helper: given a questionId and a (possibly enriched) taskModel,
  // find the itemMapping (if any) that links question -> observation/evidence -----
  function findItemMapping(taskModelObj, questionId) {
    if (!taskModelObj || !Array.isArray(taskModelObj.itemMappings) || !questionId) return null;
    return taskModelObj.itemMappings.find((m) => m.itemId === questionId) || null;
  }

  // ----- helper: compute session-level deadline (prefers session.endTime, else max(task.endTime)) -----
  function computeSessionDeadline(sess) {
    if (!sess) return null;
    if (sess.endTime) {
      const d = new Date(sess.endTime);
      if (!isNaN(d.getTime())) return d;
    }
    // use enriched tasks (if present) to find latest endTime
    const taskEndTimes = (sess.tasks || [])
      .map((t) => (t && t.endTime ? new Date(t.endTime) : null))
      .filter((d) => d && !isNaN(d.getTime()));
    if (taskEndTimes.length === 0) return null;
    return new Date(Math.max(...taskEndTimes.map((d) => d.getTime())));
  }

  // ----- initial load: session + evidenceModels -----
  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        // fetch session and evidenceModels in parallel
        const [sess, ems] = await Promise.all([
          fetchJsonSafe(`/api/sessions/${sessionId}`),
          // Same fallback as the raw fetch: a failed list becomes [].
          apiFetch("/api/evidenceModels", {}, auth).catch(() => []),
        ]);

        // 🔹 Fetch all referenced questions for teacher view
        let questionBank = [];
        try {
          questionBank = (await apiFetch("/api/questions", {}, auth)) || [];
        } catch (e) {
          console.warn("Failed to fetch item bank for review grouping", e);
        }
        sess.questions = questionBank;

        if (cancelled) return;

        setSession(sess || null);
        if (sess?.stopped) setMeasurementStop(sess.stopped);

        // enrich all tasks in the session
        let enrichedSess = sess;
        if (sess?.taskIds?.length) {
          const enrichedTasks = await Promise.all(
            sess.taskIds.map(async (tid) => {
              try {
                const t = await fetchJsonSafe(`/api/tasks/${tid}`);
                return await enrichTaskWithModel(t);
              } catch {
                return { id: tid };
              }
            })
          );
          enrichedSess = { ...sess, tasks: enrichedTasks };
        }
 
        setSession(enrichedSess || null);

        setEvidenceModels(ems || []);
      } catch (err) {
        console.error("Failed to load session or evidenceModels", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);


  useEffect(() => {
    sessionBootstrappedRef.current = false;
    setWizardPhase(WIZARD_PHASE.DRAFT);
  }, [sessionId]);

  useEffect(() => {
    if (!session) return;
    if (isSessionClosedForStudent(session)) {
      setWizardPhase(WIZARD_PHASE.SUBMITTED);
      return;
    }
    if (session.status === SESSION_STATUS.PAUSED) return;
    // First paint for this session id only — later setSession calls must
    // not yank the student back to next-task while they review a prior item.
    if (sessionBootstrappedRef.current) return;
    sessionBootstrappedRef.current = true;
    loadNextTask();
    setSelectedOptionId(null);
    setTextAnswer("");
    setSelectedRubricLevel(null);
  }, [session]);


  // ----- when session or its tasks change, compute deadline and start countdown -----
  useEffect(() => {
    let iv = null;
    if (!session) {
      setDeadline(null);
      setCountdownMs(null);
      return;
    }

    const d = computeSessionDeadline(session);
    setDeadline(d);

    // update countdown every 1s if deadline present and session appears in-progress
    function updateCountdown() {
      if (!d) {
        setCountdownMs(null);
        return;
      }
      const now = new Date();
      const ms = d.getTime() - now.getTime();
      setCountdownMs(ms > 0 ? ms : 0);
      // if time passed, trigger a refresh so UI picks up server-side auto-finish quickly
      if (ms <= 0) {
        // fetch updated session once
        (async () => {
          try {
            const s = await fetchJsonSafe(`/api/sessions/${sessionIdRef.current}`);
            setSession(s);
          } catch (e) {
            // ignore refresh failures
          }
        })();
      }
    }

    updateCountdown();
    if (d) iv = setInterval(updateCountdown, 1000);
    return () => {
      if (iv) clearInterval(iv);
    };
  }, [session?.tasks, session?.endTime, session?.status, sessionIdRef.current]);

  // ----- show resumed banner briefly when status flips to in-progress -----
  useEffect(() => {
    if (session?.status === SESSION_STATUS.IN_PROGRESS) {
      setShowResumedBanner(true);
      const timer = setTimeout(() => setShowResumedBanner(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [session?.status]);

  // ----- loadNextTask: ask backend for next-task, enrich with taskModel -----
  async function loadNextTask() {
    setLoadingTask(true);
    setNoMoreTasks(false);

    try {
      const data = await apiFetch(
        `/api/sessions/${sessionIdRef.current}/next-task`,
        {},
        auth
      );

      // D58: a stop is not "no tasks". Read data.stopped (the live decision,
      // now also persisted on the session) and show its reason. Ignoring this
      // field is exactly the defect that left every early-stopped session
      // looking like an empty form.
      if (data?.stopped) {
        setMeasurementStop(data.stopped);
        setCurrentTaskId(null);
        setTask(null);
        setQuestion(null);
        setTaskModel(null);
        setDeliveredItem(null);
        setNoMoreTasks(true);
        setReadingPassage(null);
        setActivePassageId(null);
        setActivePassageQuestions([]);
        return;
      }

      if (!data || !data.taskId) {
        // no tasks left
        setCurrentTaskId(null);
        setTask(null);
        setQuestion(null);
        setTaskModel(null);
        setNoMoreTasks(true);

        // 🔹 Reset reading passage context when session ends
        setReadingPassage(null);
        setActivePassageId(null);
        setActivePassageQuestions([]);        
        return;
      }

      const tid = data.taskId;
      setCurrentTaskId(tid);

      // fetch the task from API
      let taskObj = null;
      try {
        taskObj = await fetchJsonSafe(`/api/tasks/${tid}`);
      } catch (e) {
        console.error("Failed to fetch activity:", e);
        setTask(null);
        setTaskModel(null);
        setQuestion(null);
        return;
      }

      // enrich with taskModel metadata
      const enrichedTask = await enrichTaskWithModel(taskObj);
      setTask(enrichedTask);
      setTaskModel(enrichedTask.taskModel || null);
      
      // if composite, load its parent stimulus model once
      if (enrichedTask?.taskModel?.subTaskIds?.length > 0) {
        // This task itself defines sub-tasks — treat its description as stimulus
        setParentTaskModel(enrichedTask.taskModel);
      } else if (enrichedTask?.taskModel?.parentTaskId) {
        // If parentTaskId defined (optional future use), fetch it
        try {
          const parentTm = await fetchJsonSafe(`/api/taskModels/${enrichedTask.taskModel.parentTaskId}`);
          setParentTaskModel(parentTm);
        } catch (e) {
          console.warn("No parent taskModel found", e);
          setParentTaskModel(null);
        }
      } else {
        // If not composite, clear
        setParentTaskModel(null);
      }

      // D47: an item-backed task presents the ECD Item, not a legacy
      // question. Resolved from the task's own itemId pointer -- NOT
      // re-derived from taskModel.itemMappings, which the project treats
      // as best-effort until D154 makes it authoritative.
      if (enrichedTask?.itemId) {
        try {
          const it = await fetchJsonSafe(`/api/items/${enrichedTask.itemId}`);
          setDeliveredItem(it || null);
        } catch (e) {
          console.warn("Failed to fetch item", enrichedTask.itemId, e);
          setDeliveredItem(null);
        }
        setItemResponse(null);
        setQuestion(null);
        setReadingPassage(null);
        setActivePassageId(null);
        setActivePassageQuestions([]);
      } else if (enrichedTask?.questionId) {
        setDeliveredItem(null);
        setItemResponse(null);
      }

      // fetch question if linked
      if (!enrichedTask?.itemId && enrichedTask?.questionId) {
        try {
          const q = await fetchJsonSafe(`/api/questions/${enrichedTask.questionId}`);
          setQuestion(q || null);
          // 🔹 Handle reading comprehension context intelligently
          if (q?.passageId) {
            // If this is the same passage as the previous one, keep it visible
            if (q.passageId === activePassageId && readingPassage) {
              // no refetch needed; just keep current
              console.debug("Continuing existing reading passage set", q.passageId);
            } else {
              try {
                const passage = await fetchJsonSafe(`/api/questions/${q.passageId}`);
                if (passage?.type === "reading") {
                  setReadingPassage(passage);
                  setActivePassageId(passage.id);
                  setActivePassageQuestions(passage.subQuestionIds || []);
                } else {
                  setReadingPassage(null);
                  setActivePassageId(null);
                  setActivePassageQuestions([]);
                }
              } catch (e) {
                console.warn("No reading passage found for", q.passageId);
                setReadingPassage(null);
                setActivePassageId(null);
                setActivePassageQuestions([]);
              }
            }
          } else {
            // This question has no linked passage
            setReadingPassage(null);
            setActivePassageId(null);
            setActivePassageQuestions([]);
          }        
        } catch {
          setQuestion(null);
        }
      } else {
        setQuestion(null);
        setReadingPassage(null);
      }
    } catch (e) {
      console.error("Failed to load next activity:", e);
    } finally {
      setLoadingTask(false);
    }
  }

  // Load a specific activity from the session's task list (wizard nav /
  // review). Does not ask /next-task — that remains the adaptive path.
  async function loadTaskById(tid) {
    if (!tid) return;
    setLoadingTask(true);
    setMeasurementStop(null);
    setNoMoreTasks(false);
    try {
      setCurrentTaskId(tid);
      let taskObj = null;
      try {
        taskObj = await fetchJsonSafe(`/api/tasks/${tid}`);
      } catch (e) {
        console.error("Failed to fetch activity:", e);
        setTask(null);
        setTaskModel(null);
        setQuestion(null);
        setDeliveredItem(null);
        return;
      }

      const enrichedTask = await enrichTaskWithModel(taskObj);
      setTask(enrichedTask);
      setTaskModel(enrichedTask.taskModel || null);

      if (enrichedTask?.taskModel?.subTaskIds?.length > 0) {
        setParentTaskModel(enrichedTask.taskModel);
      } else if (enrichedTask?.taskModel?.parentTaskId) {
        try {
          const parentTm = await fetchJsonSafe(
            `/api/taskModels/${enrichedTask.taskModel.parentTaskId}`
          );
          setParentTaskModel(parentTm);
        } catch {
          setParentTaskModel(null);
        }
      } else {
        setParentTaskModel(null);
      }

      const existing = (session?.responses || []).find((r) => r.taskId === tid);
      if (enrichedTask?.itemId) {
        try {
          const it = await fetchJsonSafe(`/api/items/${enrichedTask.itemId}`);
          setDeliveredItem(it || null);
        } catch {
          setDeliveredItem(null);
        }
        setItemResponse(existing?.rawAnswer ?? null);
        setQuestion(null);
        setReadingPassage(null);
        setActivePassageId(null);
        setActivePassageQuestions([]);
      } else if (enrichedTask?.questionId) {
        setDeliveredItem(null);
        setItemResponse(null);
        try {
          const q = await fetchJsonSafe(`/api/questions/${enrichedTask.questionId}`);
          setQuestion(q || null);
          if (existing) {
            setSelectedOptionId(existing.rawAnswer || null);
            setTextAnswer(existing.rawAnswer || "");
            setSelectedRubricLevel(existing.rubricLevel || null);
          } else {
            setSelectedOptionId(null);
            setTextAnswer("");
            setSelectedRubricLevel(null);
          }
          if (q?.passageId) {
            try {
              const passage = await fetchJsonSafe(`/api/questions/${q.passageId}`);
              if (passage?.type === "reading") {
                setReadingPassage(passage);
                setActivePassageId(passage.id);
                setActivePassageQuestions(passage.subQuestionIds || []);
              } else {
                setReadingPassage(null);
                setActivePassageId(null);
                setActivePassageQuestions([]);
              }
            } catch {
              setReadingPassage(null);
            }
          } else {
            setReadingPassage(null);
            setActivePassageId(null);
            setActivePassageQuestions([]);
          }
        } catch {
          setQuestion(null);
        }
      } else {
        setQuestion(null);
        setDeliveredItem(null);
      }
    } finally {
      setLoadingTask(false);
    }
  }

  // ----- helper: find rubric levels for an observationId using evidenceModels -----
  function getRubricLevelsForObservation(obsId) {
    for (const em of evidenceModels || []) {
      const obs = (em.observations || []).find((o) => o.id === obsId);
      if (obs && obs.rubric && Array.isArray(obs.rubric.levels)) {
        return obs.rubric.levels;
      }
    }
    return null;
  }
  // 🔹 Group responses by reading comprehension passage
  function groupResponsesByPassage(sessionObj) {
    const groups = [];
    const others = [];
    if (!sessionObj || !sessionObj.responses?.length) {
      return { groups, others };
    }

    for (const resp of sessionObj.responses) {
      const qId = resp.questionId;
      if (!qId) {
        others.push(resp);
        continue;
      }
      const q = sessionObj.questions?.find?.((qq) => qq.id === qId) || null;
      if (q?.passageId) {
        let group = groups.find((g) => g.passageId === q.passageId);
        if (!group) {
          group = { passageId: q.passageId, subResponses: [] };
          groups.push(group);
        }
        group.subResponses.push(resp);
      } else {
        others.push(resp);
      }
    }

    return { groups, others };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    // Teachers review only — never submit examinee responses.
    if (isTeacher) return;
    if (!currentTaskId) return;
    setSubmitting(true);

    // D47: THE ITEM PATH. Sends the raw response and nothing else.
    //
    // No scoredValue, no questionId, and no itemMappings lookup: the
    // server derives the Observable Variable value from the item's own
    // evidenceActivationMap via identifyEvidence(), and derives the
    // observation/evidence binding from the item record itself. The
    // client asserting a score here is exactly finding F3, and the
    // legacy branch below is where that assertion still lives.
    if (deliveredItem) {
      const itemPayload = {
        taskId: currentTaskId,
        itemId: deliveredItem.id,
        rawAnswer: itemResponse ?? null,
      };

      try {
        const updatedSession = await apiFetch(
          `/api/sessions/${sessionIdRef.current}/submit`,
          {
            method: "POST",
            body: JSON.stringify(itemPayload),
          },
          auth
        );
        setSession(updatedSession);
        setItemResponse(null);
        setDeliveredItem(null);
        await loadNextTask();
      } catch (err) {
        // Match the legacy branch's failure reporting, but through the
        // toast system D43 made accessible rather than a blocking alert().
        console.error("Item submit failed", err);
        notify(apiErrorMessage(err, err.message || "Submission failed"), "error");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const payload = {
      taskId: currentTaskId,
    };

    if (question?.id) payload.questionId = question.id;

    // auto-map item → observation/evidence if mapping exists
    const mapping = findItemMapping(taskModel, question?.id);
    if (mapping) {
      if (mapping.observationId) payload.observationId = mapping.observationId;
      if (mapping.evidenceId) payload.evidenceId = mapping.evidenceId;
    }

    // Fill answers depending on type
    if (question?.type === "mcq") {
      payload.rawAnswer = selectedOptionId || null;
      const scored =
        selectedOptionId && question.correctOptionId === selectedOptionId ? 1 : 0;
      payload.scoredValue = scored;
    } else if (question?.type === "rubric") {
      payload.rubricLevel = selectedRubricLevel || null;
      payload.rawAnswer = textAnswer || null;
      payload.scoredValue = selectedRubricLevel || null;
    } else if (["constructed", "open"].includes(question?.type)) {
      payload.rawAnswer = textAnswer || null;
    } else {
      // fallback
      payload.rawAnswer = textAnswer || (selectedOptionId || null);
    }

    try {
      const updatedSession = await apiFetch(
        `/api/sessions/${sessionIdRef.current}/submit`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
        auth
      );
      setSession(updatedSession);

      // enrich tasks for updated session
      if (updatedSession?.taskIds?.length) {
        const enrichedTasks = await Promise.all(
          updatedSession.taskIds.map(async (tid) => {
            try {
              const t = await fetchJsonSafe(`/api/tasks/${tid}`);
              return await enrichTaskWithModel(t);
            } catch {
              return { id: tid };
            }
          })
        );
        updatedSession.tasks = enrichedTasks;
      }
      setSession(updatedSession);

      // clear inputs before next task
      setSelectedOptionId(null);
      setTextAnswer("");
      setSelectedRubricLevel(null);

      // load next task
      await loadNextTask();
    } catch (err) {
      console.error(err);
      alert("Submission failed: " + apiErrorMessage(err, err.message));
    } finally {
      setSubmitting(false);
    }
  }

  // ----- finish session -----
  const confirmCompleteSession = () => setCompleteModal(true);

  const performCompleteSession = async () => {
    try {
      await finishSession(session.id); // your existing API call
      notify?.("✅ Session completed");
      navigate("/sessions"); // or relevant route
    } catch (err) {
      notify?.("❌ Failed to complete session: " + err.message);
    } finally {
      setCompleteModal(false);
    }
  };


  async function handlePause() {
    if (!sessionIdRef.current) return;
    try {
      const updated = await apiFetch(
        `/api/sessions/${sessionIdRef.current}/pause`,
        { method: "POST" },
        auth
      );
      setSession((prev) => ({ ...(prev || {}), ...(updated || {}), status: updated?.status || "paused" }));
      notify("Session paused.");
    } catch (e) {
      console.error(e);
      notify("❌ Failed to pause session");
    }
  }

  async function handleResume() {
    if (!sessionIdRef.current) return;
    try {
      const updated = await apiFetch(
        `/api/sessions/${sessionIdRef.current}/resume`,
        { method: "POST" },
        auth
      );
      setSession((prev) => ({ ...(prev || {}), ...(updated || {}) }));
      notify("Session resumed.");
    } catch (e) {
      console.error(e);
      notify("❌ Failed to resume session");
    }
  }

  async function confirmFinish() {
    setFinishing(true);
    try {
      const updated = await apiFetch(
        `/api/sessions/${sessionIdRef.current}/finish`,
        { method: "POST" },
        auth
      );
      setSession(updated);
      setNoMoreTasks(true);
      setWizardPhase(WIZARD_PHASE.SUBMITTED);
      setFinishModalOpen(false);
      if (onFinished) onFinished(updated);
      if (!isTeacher) {
        notify("Session submitted.", "success");
        const listPath = sessionListPath(auth?.role || "student");
        if (listPath) navigate(listPath);
      }
    } catch (e) {
      console.error(e);
      notify(apiErrorMessage(e, e.message || "Failed to submit session"), "error");
    } finally {
      setFinishing(false);
    }
  }

  // ----- render banners -----
  let banner = null;
  // If autoFinished by backend, show auto-finished banner
  if (session?.autoFinished) {
    banner = (
      <div className="mb-4 p-3 rounded bg-yellow-50 text-yellow-800 border border-yellow-200">
        ⚠️ This session was <strong>auto-finished</strong> by the system
        {session?.finishedAt ? ` at ${new Date(session.finishedAt).toLocaleString()}` : "."}
        <div className="text-xs text-gray-500 mt-1">Teacher can review submitted responses.</div>
      </div>
    );
  } else if (countdownMs !== null && countdownMs > 0 && session?.status === SESSION_STATUS.IN_PROGRESS) {
    // show countdown when a deadline exists and is still in-progress
    function formatMs(ms) {
      const total = Math.max(0, Math.floor(ms / 1000));
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      if (h > 0) return `${h}h ${m}m ${s}s`;
      if (m > 0) return `${m}m ${s}s`;
      return `${s}s`;
    }
    banner = (
      <div className="mb-4 p-3 rounded bg-blue-50 text-blue-800 border border-blue-100">
        ⏱ Time remaining: <strong>{formatMs(countdownMs)}</strong>
        {deadline && <div className="text-xs text-gray-500 mt-1">Deadline: {deadline.toLocaleString()}</div>}
      </div>
    );
  } else if (session?.status === "paused") {
    banner = (
      <div className="mb-4 p-3 rounded bg-orange-100 text-orange-800 border border-orange-300">
        ⚠️ This session has been <strong>paused</strong> by your teacher.
      </div>
    );
  } else if (showResumedBanner) {
    banner = (
      <div className="mb-4 p-3 rounded bg-green-100 text-green-800 border border-green-300">
        ✅ Session resumed — you may continue.
      </div>
    );
  }

  const progressTotal = (session?.taskIds || []).length || 0;
  const progressDone = (session?.responses || []).length || 0;

  if (!sessionId) return <div className="p-6">Session id not provided.</div>;
  if (loading) return <div className="p-6">Loading session...</div>;

  const sessionClosed = isSessionClosedForStudent(session);
  const answeredIds = new Set(
    (session?.responses || []).map((r) => r.taskId).filter(Boolean)
  );
  const wizardTaskIds = session?.taskIds || [];
  const allAnswered =
    wizardTaskIds.length > 0 &&
    wizardTaskIds.every((id) => answeredIds.has(id));
  const canEnterReview =
    !sessionClosed &&
    (allAnswered || noMoreTasks || !!measurementStop || !!session?.stopped);
  const answerReadOnly =
    sessionClosed ||
    wizardPhase !== WIZARD_PHASE.DRAFT ||
    answeredIds.has(currentTaskId) ||
    session?.status === SESSION_STATUS.PAUSED;
  // Staff Review/View never edits examinee answers or submits the session.
  const staffReadOnly = isTeacher;

  if (!isTeacher) {
    const goBack = () => {
      const listPath = sessionListPath(auth?.role || "student");
      if (listPath) navigate(listPath);
      else navigate(-1);
    };

    return (
      <div className="p-4 md:p-6">
        {banner}
        <StudentSessionWizard
          sessionId={sessionId}
          phase={wizardPhase}
          taskIds={wizardTaskIds}
          currentTaskId={currentTaskId}
          answeredIds={answeredIds}
          sessionClosed={sessionClosed}
          canEnterReview={canEnterReview}
          submittingSession={finishing}
          showPause={canPauseSession(session, { reviewMode: false })}
          onPause={handlePause}
          stopHeading={
            session?.stopped ? measurementStopHeading(session.stopped) : null
          }
          onBack={goBack}
          onSelectTask={(tid) => {
            if (sessionClosed && !answeredIds.has(tid)) return;
            loadTaskById(tid);
          }}
          onEnterReview={() => {
            if (!canEnterReview) return;
            setWizardPhase(WIZARD_PHASE.REVIEW);
            const firstAnswered = wizardTaskIds.find((id) => answeredIds.has(id));
            if (firstAnswered) loadTaskById(firstAnswered);
          }}
          onMarkCompleted={() => setWizardPhase(WIZARD_PHASE.COMPLETED)}
          onSubmitSession={() => setFinishModalOpen(true)}
        >
          {loadingTask ? (
            <div className="text-sm text-slate-600">Loading question…</div>
          ) : measurementStop || session?.stopped ? (
            <div
              className="rounded-lg border border-slate-200 bg-white p-5"
              data-testid="measurement-stop-panel"
            >
              <p className="font-semibold text-slate-900">
                {measurementStopHeading(measurementStop || session.stopped)}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {(measurementStop || session.stopped)?.reason}
              </p>
              {measurementStopDetails(measurementStop || session.stopped).length > 0 && (
                <ul className="mt-2 list-disc ml-5 text-sm text-slate-800">
                  {measurementStopDetails(measurementStop || session.stopped).map((t) => (
                    <li key={t.smvId || t.classification}>
                      {t.smvId}
                      {t.classification ? `: ${t.classification}` : ""}
                      {Number.isFinite(t.expectedClassificationAccuracy)
                        ? ` (confidence ${t.expectedClassificationAccuracy.toFixed(2)})`
                        : ""}
                      {Number.isFinite(t.requiredSEM)
                        ? ` (SEM ${t.precision ?? "—"} ≤ ${t.requiredSEM})`
                        : ""}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-sm text-slate-500">
                Enter review when you are ready, then submit the session.
              </p>
            </div>
          ) : noMoreTasks && !task ? (
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <p className="font-semibold text-slate-900">All questions are done.</p>
              <p className="mt-1 text-sm text-slate-600">
                Enter review to check your answers, then submit the session.
              </p>
            </div>
          ) : task ? (
            <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Question
                  </div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {task.id}
                  </h2>
                </div>
                {answerReadOnly && (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                    {sessionClosed ? "Submitted" : "Read only"}
                  </span>
                )}
              </div>

              {parentTaskModel?.description && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-slate-800 whitespace-pre-line">
                  {parentTaskModel.description}
                </div>
              )}

              {deliveredItem ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <ItemPresenter
                    item={deliveredItem}
                    value={itemResponse}
                    onChange={setItemResponse}
                    disabled={answerReadOnly || submitting}
                  />
                  {!answerReadOnly && (
                    <button
                      type="submit"
                      disabled={submitting || !canPresentItem(deliveredItem)}
                      className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                    >
                      {submitting ? "Saving…" : "Save answer"}
                    </button>
                  )}
                </form>
              ) : question ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {readingPassage?.stem && (
                    <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm whitespace-pre-line text-slate-800">
                      {readingPassage.stem}
                    </div>
                  )}
                  <div className="text-sm font-medium text-slate-900">
                    {question.stem || question.prompt || question.id}
                  </div>
                  {question.type === "mcq" && (
                    <div className="space-y-2">
                      {(question.options || []).map((opt) => {
                        const oid = typeof opt === "string" ? opt : opt.id;
                        const label = typeof opt === "string" ? opt : opt.label || opt.text || oid;
                        return (
                          <label
                            key={oid}
                            className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                          >
                            <input
                              type="radio"
                              name={`q-${question.id}`}
                              checked={selectedOptionId === oid}
                              onChange={() => setSelectedOptionId(oid)}
                              disabled={answerReadOnly || submitting}
                            />
                            {label}
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {question.type === "rubric" && (
                    <input
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      placeholder="Enter rubric level or comment"
                      value={textAnswer}
                      onChange={(e) => setTextAnswer(e.target.value)}
                      disabled={answerReadOnly || submitting}
                    />
                  )}
                  {["constructed", "open"].includes(question.type) && (
                    <textarea
                      rows={6}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={textAnswer}
                      onChange={(e) => setTextAnswer(e.target.value)}
                      disabled={answerReadOnly || submitting}
                    />
                  )}
                  {!question.type && (
                    <input
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={textAnswer}
                      onChange={(e) => setTextAnswer(e.target.value)}
                      disabled={answerReadOnly || submitting}
                    />
                  )}
                  {!answerReadOnly && (
                    <button
                      type="submit"
                      disabled={submitting}
                      className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                    >
                      {submitting ? "Saving…" : "Save answer"}
                    </button>
                  )}
                </form>
              ) : (
                <p className="text-sm text-slate-600">
                  No linked item for this activity.
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              Select a question on the left to begin.
            </div>
          )}
        </StudentSessionWizard>

        <Modal
          isOpen={finishModalOpen}
          onClose={() => setFinishModalOpen(false)}
          onConfirm={confirmFinish}
          title="Submit session"
          message="Submit this session? You will not be able to change answers afterward."
          confirmClass="bg-emerald-700 hover:bg-emerald-600 text-white"
        />
      </div>
    );
  }

  const { groups: responseGroups, others: otherResponses } =
    groupResponsesByPassage(session);
  const hasGroupedResponses =
    responseGroups.length > 0 || otherResponses.length > 0;
  const toggleResponseGroup = (id) => {
    setCollapsedGroups((prev) => {
      const updated = new Set(prev);
      if (updated.has(id)) updated.delete(id);
      else updated.add(id);
      return updated;
    });
  };

  return (
    <div className="p-6 space-y-4">
      {isTeacher && (
        <div className="mb-3 p-3 rounded bg-purple-50 text-purple-800 border border-purple-200 shadow-sm">
          🔍 You are reviewing this session as:{" "}
          <strong>
            {window.location.pathname.includes("/district/")
              ? "District Officer"
              : "Teacher"}
          </strong>
          <div className="text-xs text-gray-600 mt-1">
            Review is read-only. You can inspect responses and open the report for
            completed sessions. Students submit their own sessions.
          </div>
        </div>
      )}

      {banner}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Session Player: {sessionId}</h2>
          <div className="text-sm text-gray-600 mt-1">
            Student: {session && session.studentId ? session.studentId : "(unassigned)"}
          </div>
          {session?.selectionStrategy && (
            <div className="text-sm text-gray-600">
              Strategy: {session.selectionStrategy}
              {session?.nextTaskPolicy?.policyId && (
                <span className="ml-2 text-xs text-gray-500">
                  (Policy: {getPolicyName(session.nextTaskPolicy.policyId)})
                </span>
              )}
            </div>
          )}
          {session?.stopped && (
            <div className="text-sm text-emerald-800 mt-1" data-testid="session-detail-stop">
              {measurementStopHeading(session.stopped)}
              {session.stopped.reason ? ` — ${session.stopped.reason}` : ""}
            </div>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => {
              const listPath = sessionListPath(auth?.role);
              if (listPath) navigate(listPath);
              else navigate(-1);
            }}
            className="bg-gray-200 text-gray-800 px-3 py-1 rounded hover:bg-gray-300"
            data-testid="session-player-back"
          >
            Back to sessions
          </button>
          {canPauseSession(session, { reviewMode: isTeacher }) && (
            <button
              type="button"
              onClick={handlePause}
              className="bg-orange-500 text-white px-3 py-1 rounded hover:bg-orange-600"
            >
              Pause
            </button>
          )}
          {session?.status === SESSION_STATUS.PAUSED && !isTeacher && (
            <button
              type="button"
              onClick={handleResume}
              className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600"
            >
              Resume
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="text-sm text-gray-700">
          Progress: {progressDone} / {progressTotal}
        </div>
        <div className="w-full bg-gray-200 rounded h-3 mt-1">
          <div
            className="h-3 rounded bg-blue-600"
            style={{
              width: `${
                progressTotal ? (progressDone / progressTotal) * 100 : 0
              }%`,
            }}
          />
        </div>
      </div>

      {loadingTask ? (
        <div>Loading next activity...</div>
      ) : measurementStop ? (
        <div className="p-4 border border-border rounded bg-muted text-foreground" data-testid="measurement-stop-panel">
          <p className="font-medium">{measurementStopHeading(measurementStop)}</p>
          <p className="text-sm text-muted-foreground mt-1">{measurementStop.reason}</p>
          {measurementStopDetails(measurementStop).length > 0 && (
            <ul className="mt-2 text-sm text-foreground list-disc ml-5">
              {measurementStopDetails(measurementStop).map((t) => (
                <li key={t.smvId || t.classification}>
                  {t.smvId}
                  {t.classification ? `: ${t.classification}` : ""}
                  {Number.isFinite(t.expectedClassificationAccuracy)
                    ? ` (confidence ${t.expectedClassificationAccuracy.toFixed(2)})`
                    : ""}
                  {Number.isFinite(t.requiredSEM)
                    ? ` (SEM ${t.precision ?? "—"} ≤ ${t.requiredSEM})`
                    : ""}
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm text-muted-foreground mt-2">
            You can finish the session or review responses.
          </p>
          <div className="mt-3 space-x-2">
            {!isTeacher && session?.status !== "completed" && (
              <button
                type="button"
                onClick={() => setFinishModalOpen(true)}
                disabled={session?.status === "paused" || finishing}
                className="px-3 py-1 bg-red-500 text-white rounded disabled:opacity-50"
              >
                {finishing ? "Finishing..." : "Finish Session"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="px-3 py-1 bg-indigo-600 text-white rounded"
            >
              Open Report
            </button>
          </div>
        </div>
      ) : noMoreTasks ? (
        <div className="p-4 border border-border rounded bg-muted text-foreground">
          <p className="font-medium">No more tasks available.</p>
          <p className="text-sm text-muted-foreground">
            You can finish the session or review responses.
          </p>
          <div className="mt-3 space-x-2">
            {!isTeacher && session?.status !== "completed" && (
              <button
                type="button"
                onClick={() => setFinishModalOpen(true)}
                disabled={session?.status === "paused" || finishing}
                className="px-3 py-1 bg-red-500 text-white rounded disabled:opacity-50"
              >
                {finishing ? "Finishing..." : "Finish Session"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="px-3 py-1 bg-indigo-600 text-white rounded"
            >
              Open Report
            </button>
          </div>
        </div>
      ) : task ? (
        <div className="p-4 border rounded bg-white">
          {/* Sticky shared stimulus area for composite parent tasks */}
          {parentTaskModel && (
            <div className="sticky top-0 z-10 bg-yellow-50 border border-yellow-200 rounded p-3 mb-3 shadow-sm">
              <h4 className="font-semibold text-yellow-800">
                Shared Stimulus
              </h4>
              {parentTaskModel.description ? (
                <p className="text-sm text-gray-800 mt-1 whitespace-pre-line">
                  {parentTaskModel.description}
                </p>
              ) : (
                <p className="text-sm text-gray-600">
                  (No stimulus text available)
                </p>
              )}
            </div>
          )}
          <div className="mb-3">
            <strong>Activity:</strong>{" "}
            <span className="text-sm text-gray-600">{task.id}</span>
          </div>

          {taskModel && (
            <div className="mb-3 text-sm text-gray-600">
              <div>
                <strong>Competency:</strong>{" "}
                {taskModel.competencyId || "(unknown)"}
              </div>
              <div>
                <strong>Evidence:</strong> {taskModel.evidenceId || "(unknown)"}
              </div>
              <div>
                <strong>Activity Template:</strong>{" "}
                {taskModel.name || taskModel.id || "(unnamed)"}
              </div>
            </div>
          )}

          {/* D47: item-backed task. Rendered by its own presenter so the
              legacy question path below is untouched by the cutover. */}
          {deliveredItem ? (
            <form onSubmit={handleSubmit} className="space-y-3">
              <ItemPresenter
                item={deliveredItem}
                value={itemResponse}
                onChange={setItemResponse}
                disabled={
                  staffReadOnly ||
                  submitting ||
                  !(
                    session &&
                    (session.status === SESSION_STATUS.IN_PROGRESS ||
                      session.status === undefined) &&
                    !session.autoFinished &&
                    !session.isCompleted
                  )
                }
              />
              {!isTeacher && (
                <button
                  type="submit"
                  disabled={submitting || !canPresentItem(deliveredItem)}
                  className="px-4 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
                >
                  {submitting ? "Submitting…" : "Submit"}
                </button>
              )}
            </form>
          ) : question ? (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
              {/* 🔹 Display Reading Passage if linked */}
              {/* 🔹 Show active reading passage only once per passage group */}
              {readingPassage && activePassageQuestions.includes(question?.id) && (
                <div className="sticky top-0 z-10 bg-blue-50 border border-blue-200 rounded p-3 mb-3 shadow-sm transition-opacity duration-500 ease-in-out">
                  <h4 className="font-semibold text-blue-800 mb-1 flex items-center justify-between">
                    📘 Reading Passage
                    <span className="text-xs text-gray-500">
                      ({activePassageQuestions.indexOf(question.id) + 1}/
                      {activePassageQuestions.length})
                    </span>
                  </h4>
                  <p className="text-sm text-gray-800 whitespace-pre-line">
                    {readingPassage.stem}
                  </p>
                  {readingPassage.subQuestionIds?.length > 0 && (
                    <div className="text-xs text-gray-500 mt-1">
                      Linked questions: {readingPassage.subQuestionIds.length}
                    </div>
                  )}
                </div>
              )}
                
                <div className="font-medium">Question</div>
                <div className="mt-1 text-gray-800">{question.stem}</div>
              </div>

              {/* MCQ */}
              {question.type === "mcq" && (
                <div>
                {(question.options || []).map((opt) => (
                      <label
                        key={opt.id}
                        className="block p-2 border rounded my-1"
                      >
                        <input
                          type="radio"
                          name="mcq"
                          value={opt.id}
                          checked={selectedOptionId === opt.id}
                          onChange={() => setSelectedOptionId(opt.id)}
                          disabled={
                            staffReadOnly ||
                            // session is editable only when in-progress and not autoFinished/isCompleted
                            !(
                              session &&
                              (session.status === SESSION_STATUS.IN_PROGRESS ||
                                session.status === undefined) &&
                              !session.autoFinished &&
                              !session.isCompleted
                            ) || submitting
                          }
                        />{" "}
                        <span className="ml-2">{opt.text}</span>
                      </label>
                    ))}
                </div>
              )}

              {/* Rubric */}
              {question.type === "rubric" && (
                <div>
                  <div className="text-sm text-gray-700">Rubric response</div>
                  {(() => {
                    const mapping = findItemMapping(taskModel, question.id);
                    const levels = mapping?.observationId
                      ? getRubricLevelsForObservation(mapping.observationId)
                      : null;
                    if (levels) {
                      return (
                        <select
                          className="border p-2 rounded w-full"
                          value={selectedRubricLevel || ""}
                          onChange={(e) => setSelectedRubricLevel(e.target.value)}
                          disabled={
                            staffReadOnly ||
                            !(
                              session &&
                              (session.status === SESSION_STATUS.IN_PROGRESS ||
                                session.status === undefined) &&
                              !session.autoFinished &&
                              !session.isCompleted
                            )
                          }
                        >
                          <option value="">Select rubric level</option>
                          {levels.map((lvl, i) => (
                            <option key={i} value={lvl}>
                              {lvl}
                            </option>
                          ))}
                        </select>
                      );
                    }
                    return (
                      <input
                        className="border p-2 rounded w-full"
                        placeholder="Enter rubric level or comment"
                        value={textAnswer}
                        onChange={(e) => setTextAnswer(e.target.value)}
                        disabled={
                          staffReadOnly ||
                          !(
                            session &&
                            (session.status === SESSION_STATUS.IN_PROGRESS ||
                              session.status === undefined) &&
                            !session.autoFinished &&
                            !session.isCompleted
                          )
                        }
                      />
                    );
                  })()}
                </div>
              )}

              {/* Constructed / open */}
              {["constructed", "open"].includes(question.type) && (
                <div>
                  <label className="block font-medium">Answer</label>
                  <textarea
                    rows={6}
                    className="w-full border p-2 rounded"
                    value={textAnswer}
                    onChange={(e) => setTextAnswer(e.target.value)}
                    disabled={
                      staffReadOnly ||
                      !(
                        session &&
                        (session.status === SESSION_STATUS.IN_PROGRESS ||
                          session.status === undefined) &&
                        !session.autoFinished &&
                        !session.isCompleted
                      )
                    }
                  />
                </div>
              )}

              {/* Fallback */}
              {!question.type && (
                <div>
                  <label className="block font-medium">Answer</label>
                  <input
                    className="border p-2 rounded w-full"
                    value={textAnswer}
                    onChange={(e) => setTextAnswer(e.target.value)}
                    disabled={
                      staffReadOnly ||
                      !(
                        session &&
                        (session.status === SESSION_STATUS.IN_PROGRESS ||
                          session.status === undefined) &&
                        !session.autoFinished &&
                        !session.isCompleted
                      )
                    }
                  />
                </div>
              )}

              <div className="flex items-center space-x-2">
                {/* Students answer; teachers only navigate / inspect */}
                {!isTeacher ? (
                  <>
                    <button
                      type="submit"
                      disabled={
                        submitting ||
                        !(
                          session &&
                          (session.status === SESSION_STATUS.IN_PROGRESS ||
                            session.status === undefined) &&
                          !session.autoFinished &&
                          !session.isCompleted
                        )
                      }
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      Submit Answer
                    </button>
                    <button
                      type="button"
                      onClick={loadNextTask}
                      disabled={
                        !(
                          session &&
                          (session.status === SESSION_STATUS.IN_PROGRESS ||
                            session.status === undefined) &&
                          !session.autoFinished &&
                          !session.isCompleted
                        )
                      }
                      className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
                    >
                      Skip
                    </button>
                    {session?.status !== "completed" && (
                      <button
                        type="button"
                        onClick={() => setFinishModalOpen(true)}
                        disabled={
                          finishing ||
                          !(
                            session &&
                            (session.status === SESSION_STATUS.IN_PROGRESS ||
                              session.status === undefined) &&
                            !session.autoFinished &&
                            !session.isCompleted
                          )
                        }
                        className="px-3 py-1 bg-red-500 text-white rounded disabled:opacity-50"
                      >
                        {finishing ? "Finishing..." : "Finish Session"}
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={loadNextTask}
                    className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                  >
                    Next activity
                  </button>
                )}

                {session?.status === "completed" && (
                  <div className="px-3 py-1 bg-green-500 text-white rounded inline-block">
                    ✅ Session Completed
                  </div>
                )}
              </div>
            </form>
          ) : (
            <div className="text-sm text-gray-600">
              No linked question for this activity. You may capture evidence manually.
            </div>
          )}
        </div>
      ) : (
        <div>No activity loaded.</div>
      )}
      {/* Responses timeline */}
      <div>
        <h4 className="font-semibold mb-2 flex justify-between items-center">
          <span>Responses</span>

          {/* Top-level collapse/expand for teacher */}
          {isTeacher && responseGroups.length > 0 && (
            <div className="space-x-2">
              <button
                type="button"
                onClick={() => setCollapsedGroups(new Set())}
                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Expand All
              </button>
              <button
                type="button"
                onClick={() =>
                  setCollapsedGroups(
                    new Set(responseGroups.map((g) => g.passageId))
                  )
                }
                className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Collapse All
              </button>
            </div>
          )}
        </h4>

        {isTeacher ? (
          !hasGroupedResponses ? (
            <p className="text-sm text-gray-500">No responses yet.</p>
          ) : (
            <div className="space-y-6">
              {responseGroups.map((grp, gi) => {
                const passage =
                  session.questions?.find?.((q) => q.id === grp.passageId) ||
                  null;
                const isCollapsed = collapsedGroups.has(grp.passageId);

                return (
                  <div
                    key={grp.passageId || gi}
                    className="border border-blue-200 bg-blue-50 rounded p-3 shadow-sm"
                  >
                    <div className="flex justify-between items-center">
                      <h5
                        className="font-semibold text-blue-800 cursor-pointer"
                        onClick={() => toggleResponseGroup(grp.passageId)}
                      >
                        📘 Passage {passage?.metadata?.topic || grp.passageId}
                      </h5>
                      <button
                        type="button"
                        onClick={() => toggleResponseGroup(grp.passageId)}
                        className="text-xs text-blue-600 underline"
                      >
                        {isCollapsed ? "Expand" : "Collapse"}
                      </button>
                    </div>

                    {!isCollapsed && (
                      <>
                        <p className="text-sm text-gray-800 whitespace-pre-line mt-1 mb-3">
                          {passage?.stem || "(passage text unavailable)"}
                        </p>

                        <div className="ml-3 border-l-4 border-blue-300 pl-3 space-y-2">
                          {grp.subResponses.map((r, i) => (
                            <div
                              key={i}
                              className="p-2 bg-white border rounded shadow-sm"
                            >
                              <div className="text-sm text-gray-700">
                                <strong>Q:</strong> {r.questionId}{" "}
                                <span className="text-gray-500 ml-1">
                                  {new Date(r.timestamp).toLocaleString()}
                                </span>
                              </div>
                              <div className="text-gray-800">
                                <strong>Answer:</strong>{" "}
                                {r.rawAnswer ||
                                  r.rubricLevel ||
                                  r.scoredValue ||
                                  "(none)"}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              {otherResponses.length > 0 && (
                <div className="border border-gray-200 rounded p-3 bg-white shadow-sm">
                  <h5 className="font-semibold mb-1 text-gray-800">
                    Other Responses
                  </h5>
                  <ul className="list-disc ml-5 text-sm">
                    {otherResponses.map((r, i) => (
                      <li key={i} className="text-gray-700">
                        <strong>Q:</strong> {r.questionId} —{" "}
                        {r.rawAnswer ||
                          r.rubricLevel ||
                          r.scoredValue ||
                          "(none)"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        ) : (
          <>
            {session?.responses?.length ? (
              <ul className="list-disc ml-5 text-sm">
                {session.responses.map((r, i) => {
                  const t = session.tasks?.find((x) => x.id === r.taskId) || null;
                  const competency = t?.taskModel?.competencyId || "?";
                  const evidence = t?.taskModel?.evidenceId || "?";

                  return (
                    <li key={i}>
                      <div>
                        <strong>Activity:</strong> {r.taskId}{" "}
                        <span className="text-gray-500">
                          at {new Date(r.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-gray-700">
                        Answer:{" "}
                        {r.rawAnswer ||
                          r.rubricLevel ||
                          r.scoredValue ||
                          "(none)"}
                      </div>
                      <div className="text-gray-500 text-xs">
                        [C: {competency}, E: {evidence}]
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">No responses yet.</p>
            )}
          </>
        )}
      </div>

      {reportOpen && sessionId && (
        <div className="p-4 border border-border rounded-md bg-card mt-4">
          <SessionReport sessionId={sessionId} onClose={() => setReportOpen(false)} />
        </div>
      )}

      {/* Finish confirmation modal */}
      <Modal
        isOpen={finishModalOpen}
        onClose={() => setFinishModalOpen(false)}
        onConfirm={confirmFinish}
        title="Finish Session"
        message="Are you sure you want to finish this session? This cannot be undone."
        confirmClass="bg-red-500 hover:bg-red-600 text-white"
      />
    </div>
  );
}
