// server/routes/api/reportsRoutes.js
import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB } from "../../src/utils/db-server.js";
import { getSessionById, querySessions } from "../sessions/sessionRepository.js";
import { sessionMeasurementReport } from "../delivery/sessionReportMeasurement.js";
import { taskIdsIncludingDelivered } from "../delivery/activitySelection.js";
import { studentForbiddenFromSession } from "../../src/utils/sessionPlay.js";
import { assertCallerMayAccessDistrict } from "../utils/tenancyScope.js";
import { TenancyError, runWithTenancy } from "../utils/tenancyContext.js";
import {
  MIN_CELL_SIZE,
  namedAggregateScope,
  suppressBnSummary,
  suppressCoverageMap,
  suppressIrtSummary,
} from "../utils/aggregatePrivacy.js";
import { resolveStudentIdentity } from "../../src/utils/studentModelRecord.js";
import { queryStudentModelRecords } from "../studentModelRecords/studentModelRecordRepository.js";
import { buildStudentEcdReport } from "../delivery/studentEcdReport.js";
import {
  buildStudentCumulativeReport,
  buildTeacherCumulativeReport,
  buildDistrictCumulativeReport,
  scopedStudentsFor,
  sessionsForStudent,
  comparisonStudentsFor,
} from "../delivery/cumulativeEcdReport.js";


const router = express.Router();

// Every endpoint in this router requires a valid, logged-in session.
// (Previously this file had no auth check at all — added as part of the
// Phase 1 security hardening pass; see AUTH_SECURITY_FIXES.md.)
router.use(authenticateToken);
router.use(sanitizeRequestInputs);

// D59: teacher-report payloads (per-session teacher report, class, and
// district) are staff-only. Authenticate-only was the examinee leak —
// any logged-in student could GET /session/:id/teacher-report. Matches
// rolePermissions.js `teacherReports` (admin / district / teacher).
// Learner feedback and the generic session report stay open to any
// authenticated role for *their own* session. A student requesting
// another examinee's id is 403 (D72). Teacher-report remains staff-only.
const canViewTeacherReports = authorizeRole(["admin", "district", "teacher"]);

function bnLevel(probability) {
  return probability > 0.7 ? "Strong" : probability > 0.4 ? "Developing" : "Needs Support";
}

function bnNodeDistribution(session, node) {
  const posterior = session?.studentModel?.smvPosteriors?.[node];
  if (
    posterior &&
    posterior.modelFamily === "bayesian_network" &&
    posterior.distribution &&
    typeof posterior.distribution === "object" &&
    !Array.isArray(posterior.distribution)
  ) {
    return posterior.distribution;
  }
  return null;
}

async function recordsForSessionStudent(db, session) {
  const identity = resolveStudentIdentity(session?.studentId, db);
  return queryStudentModelRecords(db, { identity });
}

function personForStudentId(db, studentId) {
  const id = String(studentId || "");
  if (!id) return null;
  const student = (db.students || []).find(
    (s) => s && (s.id === id || s.username === id || s.userId === id)
  );
  const user = (db.users || []).find(
    (u) => u && (u.username === id || u.id === id)
  );
  const name =
    student?.name ||
    user?.name ||
    user?.profile?.name ||
    user?.username ||
    student?.username ||
    id;
  return { id: student?.id || user?.username || id, name };
}

function optionText(item, response) {
  const raw = response?.rawAnswer;
  const selected =
    raw && typeof raw === "object" && !Array.isArray(raw) ? raw.selected : raw;
  const key = Array.isArray(selected)
    ? selected.join(", ")
    : selected == null
      ? ""
      : String(selected);
  const match = (item?.interaction?.responseComponents || []).find(
    (opt) => opt.id === key || opt.value === key
  );
  return match?.label || key;
}

function responseLines(db, session) {
  const items = db.items || [];
  return (session.responses || []).map((response) => {
    const item = items.find((row) => row.id === response.itemId);
    return {
      ...response,
      itemId: response.itemId || null,
      option: optionText(item, response),
      activated: response.activated ?? null,
    };
  });
}

// ------------------------------
// GET /api/reports/session/:id
// ------------------------------
router.get("/session/:id", async (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  const session = await getSessionById(db, id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (
    studentForbiddenFromSession(
      session,
      req.user,
      db.students || [],
      db.users || []
    )
  ) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const student = personForStudentId(db, session.studentId);

  // 🔹 Lookup policy info
  const policies = db.policies || [];
  let policyDetails = null;

  if (session.nextTaskPolicy?.policyId) {
    policyDetails = policies.find(p => p.id === session.nextTaskPolicy.policyId);
  } else {
    // fallback: match by type (selectionStrategy)
    policyDetails = policies.find(p => p.type === session.selectionStrategy);
  }

  const measurement = sessionMeasurementReport(session);

  const report = {
    sessionId: id,
    student: student ? { id: student.id, name: student.name } : null,
    selectionStrategy: session.selectionStrategy,
    policy: policyDetails
      ? {
          id: policyDetails.id,
          name: policyDetails.name,
          description: policyDetails.description,
          type: policyDetails.type,
        }
      : null,
    responses: responseLines(db, session),
    captured: [], // new: evidence & observations from tasks
    constructs: [],
    recommendations: [],
    stopped: measurement.stopped,
    attributeProfile: measurement.attributeProfile,
    studentModelRecords: await recordsForSessionStudent(db, session),
    ...(session.assemblyProgress ? { assemblyProgress: session.assemblyProgress } : {}),
  };

  // 🔹 Captured evidence/observations (from Task Instances)
  for (const tid of taskIdsIncludingDelivered(session)) {
    const task = db.tasks.find(t => t.id === tid);
    if (!task) continue;

    report.captured.push({
      taskId: task.id,
      taskModelId: task.taskModelId,
      generatedObservationIds: task.generatedObservationIds || [],
      generatedEvidenceIds: task.generatedEvidenceIds || [],
    });
  }

  // 🔹 Add measurement feedback (IRT / BN)
  if (session.selectionStrategy === "IRT" && session.studentModel?.irtTheta !== undefined) {
    const theta = session.studentModel.irtTheta;
    report.constructs.push({
      type: "IRT",
      estimate: theta,
      level: theta > 1 ? "Advanced" : theta > 0 ? "Proficient" : "Needs Support",
    });
    report.recommendations.push("Assign items near current theta for better precision.");
  }

  if (session.selectionStrategy === "BayesianNetwork" && session.studentModel?.bnPosteriors) {
    for (const [node, prob] of Object.entries(session.studentModel.bnPosteriors)) {
      const distribution = bnNodeDistribution(session, node);
      report.constructs.push({
        type: "BayesianNetwork",
        node,
        probability: prob,
        level: bnLevel(prob),
        ...(distribution ? { distribution } : {}),
      });
    }
    report.recommendations.push("Focus on nodes with highest uncertainty.");
  }

  for (const row of measurement.attributeProfile) {
    report.constructs.push({
      type: "AttributeProfile",
      smvId: row.smvId,
      classification: row.classification,
      expectedClassificationAccuracy: row.expectedClassificationAccuracy,
      estimate: row.estimate,
    });
  }

  if (report.recommendations.length === 0) {
    report.recommendations.push("Complete more tasks for a fuller assessment.");
  }

  report.ecdReport = buildStudentEcdReport(db, session, {
    student,
    measurement,
    studentModelRecords: report.studentModelRecords,
  });

  res.json(report);
});



// ------------------------------
// GET /api/reports/session/:id/feedback
// ------------------------------
// router.get("/:id/feedback", (req, res) => {
//   const { id } = req.params;
//   const db = loadDB();
//   const session = db.sessions.find((s) => s.id === id);
//   if (!session) return res.status(404).json({ error: "Session not found" });

//   const feedback = {
//     sessionId: id,
//     strategy: session.selectionStrategy,
//     responses: session.responses.length,
//     constructs: [],
//     recommendations: [],
//     studentModel: session.studentModel || {},
//   };

//   // IRT feedback
//   if (session.selectionStrategy === "IRT" && session.studentModel?.irtTheta !== undefined) {
//     const theta = session.studentModel.irtTheta;
//     feedback.constructs.push({
//       type: "IRT",
//       estimate: theta,
//       level: theta > 1 ? "Advanced" : theta > 0 ? "Proficient" : "Needs Support",
//     });
//     feedback.recommendations.push("Assign items near current theta for better precision.");
//   }

//   // BN feedback
//   if (session.selectionStrategy === "BayesianNetwork" && session.studentModel?.bnPosteriors) {
//     for (const [node, prob] of Object.entries(session.studentModel.bnPosteriors)) {
//       feedback.constructs.push({
//         type: "BayesianNetwork",
//         node,
//         probability: prob,
//         level: prob > 0.7 ? "Strong" : prob > 0.4 ? "Developing" : "Needs Support",
//       });
//     }
//     feedback.recommendations.push("Focus on nodes with highest uncertainty.");
//   }

//   // Default / generic
//   if (feedback.recommendations.length === 0) {
//     feedback.recommendations.push("Complete more tasks for a fuller assessment.");
//   }

//   res.json(feedback);
// });

// ------------------------------
// GET /api/reports/session/:id/learner-feedback
// ------------------------------
router.get("/session/:id/learner-feedback", async (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  const session = await getSessionById(db, id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (
    studentForbiddenFromSession(
      session,
      req.user,
      db.students || [],
      db.users || []
    )
  ) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // 🔹 Lookup policy info
  const policies = db.policies || [];
  let policyDetails = null;

  if (session.nextTaskPolicy?.policyId) {
    policyDetails = policies.find(p => p.id === session.nextTaskPolicy.policyId);
  } else {
    policyDetails = policies.find(p => p.type === session.selectionStrategy);
  }

  const measurement = sessionMeasurementReport(session);

  const feedback = {
    sessionId: id,
    policy: policyDetails
      ? {
          name: policyDetails.name,
          type: policyDetails.type,
          description: policyDetails.description,
        }
      : { type: session.selectionStrategy }, // fallback only
    summary: {},
    strengths: [],
    focusAreas: [],
    nextSteps: [],
    encouragement: "Great effort! Keep practicing.",
    stopped: measurement.stopped,
    attributeProfile: measurement.attributeProfile,
    studentModelRecords: await recordsForSessionStudent(db, session),
    ...(session.assemblyProgress ? { assemblyProgress: session.assemblyProgress } : {}),
  };

  // IRT version
  if (session.selectionStrategy === "IRT" && session.studentModel?.irtTheta !== undefined) {
    const theta = session.studentModel.irtTheta;
    feedback.summary.level = theta > 1 ? "Advanced" : theta > 0 ? "Proficient" : "Needs Support";
    feedback.summary.message =
      theta > 1
        ? "Excellent! You’re ready for challenging problems."
        : theta > 0
        ? "Great work! You’re showing good understanding."
        : "Don’t worry, this is just a starting point.";

    if (theta <= 0) {
      feedback.focusAreas.push("Core skills practice");
      feedback.nextSteps.push("Review basic exercises with examples.");
    } else if (theta > 1) {
      feedback.strengths.push("Core skills mastered");
      feedback.nextSteps.push("Try advanced, multi-step problems.");
    }
  }

  // BN version
  if (session.selectionStrategy === "BayesianNetwork" && session.studentModel?.bnPosteriors) {
    feedback.bayesianNetwork = {};
    for (const [node, prob] of Object.entries(session.studentModel.bnPosteriors)) {
      const distribution = bnNodeDistribution(session, node);
      feedback.bayesianNetwork[node] = {
        probability: prob,
        level: bnLevel(prob),
        ...(distribution ? { distribution } : {}),
      };
      if (prob > 0.7) feedback.strengths.push(node);
      else if (prob < 0.4) feedback.focusAreas.push(node);
    }
    if (feedback.focusAreas.length > 0) {
      feedback.nextSteps.push(`Practice more in: ${feedback.focusAreas.join(", ")}`);
    }
  }

  for (const row of measurement.attributeProfile) {
    if (row.classification === "master") feedback.strengths.push(row.smvId);
    else if (row.classification === "nonmaster") feedback.focusAreas.push(row.smvId);
  }

  if (measurement.stopped?.reason && !feedback.summary.message) {
    feedback.summary.message = measurement.stopped.reason;
  }
  if (measurement.attributeProfile.length > 0 && !feedback.summary.level) {
    const mastered = measurement.attributeProfile.filter((r) => r.classification === "master").length;
    feedback.summary.level = `${mastered} of ${measurement.attributeProfile.length} attributes classified as mastered`;
  }

  const student = personForStudentId(db, session.studentId);
  feedback.ecdReport = buildStudentEcdReport(db, session, {
    student,
    measurement,
    studentModelRecords: feedback.studentModelRecords,
  });

  res.json(feedback);
});



// ------------------------------
// GET /api/reports/session/:id/teacher-report
// ------------------------------
router.get("/session/:id/teacher-report", canViewTeacherReports, async (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  const session = await getSessionById(db, id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (
    studentForbiddenFromSession(
      session,
      req.user,
      db.students || [],
      db.users || []
    )
  ) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const student = personForStudentId(db, session.studentId);

  // 🔹 Lookup policy info
  const policies = db.policies || [];
  let policyDetails = null;

  if (session.nextTaskPolicy?.policyId) {
    policyDetails = policies.find(p => p.id === session.nextTaskPolicy.policyId);
  } else {
    policyDetails = policies.find(p => p.type === session.selectionStrategy);
  }

  // 🔹 Pre-index collections
  const taskMap = Object.fromEntries((db.tasks || []).map((t) => [t.id, t]));
  const taskModelMap = Object.fromEntries((db.taskModels || []).map((tm) => [tm.id, tm]));
  const evidenceModelMap = {};
  for (const em of db.evidenceModels || []) {
    const obsMap = Object.fromEntries((em.observations || []).map((o) => [o.id, o]));
    const constructMap = Object.fromEntries((em.constructs || []).map((c) => [c.id, c]));
    evidenceModelMap[em.id] = { ...em, _obsMap: obsMap, _constructMap: constructMap };
  }

  const measurement = sessionMeasurementReport(session);

  const report = {
    sessionId: id,
    studentId: session.studentId,
    studentName: student ? student.name : session.studentId || null,

    // 🔹 Include policy info
    selectionStrategy: session.selectionStrategy,
    policy: policyDetails
      ? {
          id: policyDetails.id,
          name: policyDetails.name,
          description: policyDetails.description,
          type: policyDetails.type,
        }
      : null,

    modelSummary: {},
    responses: responseLines(db, session).map((r) => {
      const task = taskMap[r.taskId];
      const tm = task ? taskModelMap[task.taskModelId] : null;

      let competencyId = null;
      let evidenceId = null;

      if (tm) {
        for (const emId of tm.evidenceModelIds || []) {
          const em = evidenceModelMap[emId];
          if (!em) continue;

          if (r.observationId) {
            const obs = em._obsMap[r.observationId];
            if (obs) {
              const construct = em._constructMap[obs.constructId];
              if (construct) {
                competencyId = construct.competencyId || competencyId;
                evidenceId = construct.evidenceId || evidenceId;
              }
            }
          }

          if (!competencyId && (em.constructs || []).length > 0) {
            competencyId = em.constructs[0].competencyId || competencyId;
            evidenceId = em.constructs[0].evidenceId || evidenceId;
          }
        }
      }

      return {
        ...r,
        taskModelId: task?.taskModelId || null,
        competencyId,
        evidenceId,
      };
    }),
    recommendations: {
      groupLevel: [],
      individualLevel: []
    },
    stopped: measurement.stopped,
    attributeProfile: measurement.attributeProfile,
    studentModelRecords: await recordsForSessionStudent(db, session),
    ...(session.assemblyProgress ? { assemblyProgress: session.assemblyProgress } : {}),
  };

  // 🔹 IRT summary
  if (session.selectionStrategy === "IRT" && session.studentModel?.irtTheta !== undefined) {
    const theta = session.studentModel.irtTheta;
    const stderr = session.responses.length > 0 ? (1 / Math.sqrt(session.responses.length)) : null;

    report.modelSummary.IRT = {
      theta,
      stderr,
      level: theta > 1 ? "Advanced" : theta > 0 ? "Proficient" : "Needs Support"
    };

    report.recommendations.individualLevel.push(
      "Assign items near current theta for higher measurement precision."
    );
  }

  // 🔹 BN summary
  if (session.selectionStrategy === "BayesianNetwork" && session.studentModel?.bnPosteriors) {
    report.modelSummary.BayesianNetwork = {};

    for (const [node, prob] of Object.entries(session.studentModel.bnPosteriors)) {
      const entropy = (p) => (p <= 0 || p >= 1)
        ? 0
        : -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
      const distribution = bnNodeDistribution(session, node);

      report.modelSummary.BayesianNetwork[node] = {
        posterior: prob,
        entropy: entropy(prob),
        level: bnLevel(prob),
        ...(distribution ? { distribution } : {}),
      };
    }

    report.recommendations.individualLevel.push("Focus on nodes with highest entropy (uncertainty).");
    report.recommendations.groupLevel.push("Review group-level trends to identify systemic weaknesses.");
  }

  if (measurement.attributeProfile.length > 0) {
    report.modelSummary.AttributeProfile = Object.fromEntries(
      measurement.attributeProfile.map((row) => [
        row.smvId,
        {
          classification: row.classification,
          expectedClassificationAccuracy: row.expectedClassificationAccuracy,
          estimate: row.estimate,
          masteryThreshold: row.masteryThreshold,
        },
      ])
    );
  }

  // 🔹 Generic fallback
  if (Object.keys(report.modelSummary).length === 0) {
    report.recommendations.individualLevel.push("Complete more tasks to build a measurable profile.");
  }

  report.ecdReport = buildStudentEcdReport(db, session, {
    student,
    measurement,
    studentModelRecords: report.studentModelRecords,
  });

  res.json(report);
});

// ------------------------------
// GET /api/reports/teacher/class/:classId
// ------------------------------
router.get("/teacher/class/:classId", canViewTeacherReports, async (req, res) => {
  const { classId } = req.params;
  const db = loadDB();
  db.sessions = await querySessions(db);

  // find students in class
  const students = db.students?.filter(stu => stu.classId === classId) || [];
  if (students.length === 0) {
    return res.status(404).json({ error: `No students found for classId ${classId}` });
  }

  // D99: class must sit inside the caller's district (teachers/district).
  const callerDistrict = req.user?.districtId;
  if (req.user?.role !== "admin" && callerDistrict) {
    const foreign = students.some((s) => s.districtId && s.districtId !== callerDistrict);
    if (foreign) {
      return res.status(403).json({
        error: "Class is outside caller district",
        code: "TENANCY_REQUIRED",
      });
    }
  }

  // get all sessions for these students
  const sessions = db.sessions?.filter(s => students.some(stu => stu.id === s.studentId)) || [];
  if (sessions.length === 0) {
    return res.json({
      classId,
      scope: namedAggregateScope(req, { kind: "class-report", classId }),
      minCellSize: MIN_CELL_SIZE,
      summary: {},
      recommendations: [],
    });
  }

  // 🔹 Pre-index collections
  const taskMap = Object.fromEntries((db.tasks || []).map((t) => [t.id, t]));
  const evidenceModelMap = {};
  for (const em of db.evidenceModels || []) {
    const obsMap = Object.fromEntries((em.observations || []).map((o) => [o.id, o]));
    const constructMap = Object.fromEntries((em.constructs || []).map((c) => [c.id, c]));
    evidenceModelMap[em.id] = { ...em, _obsMap: obsMap, _constructMap: constructMap };
  }

  // 🔹 Policy lookup map
  const policyMap = Object.fromEntries((db.policies || []).map((p) => [p.id, p]));

  const irtValues = [];
  const bnNodes = {};
  const capturedSummary = [];
  const policyUsage = [];

  for (const session of sessions) {
    // Track policy details
    let policyDetails = null;
    if (session.nextTaskPolicy?.policyId && policyMap[session.nextTaskPolicy.policyId]) {
      policyDetails = policyMap[session.nextTaskPolicy.policyId];
    } else {
      policyDetails = Object.values(policyMap).find(p => p.type === session.selectionStrategy);
    }
    if (policyDetails) {
      policyUsage.push({
        sessionId: session.id,
        policy: {
          id: policyDetails.id,
          name: policyDetails.name,
          description: policyDetails.description,
          type: policyDetails.type,
        }
      });
    }

    // collect IRT
    if (session.selectionStrategy === "IRT" && session.studentModel?.irtTheta !== undefined) {
      irtValues.push(session.studentModel.irtTheta);
    }

    // collect BN
    if (session.selectionStrategy === "BayesianNetwork" && session.studentModel?.bnPosteriors) {
      for (const [node, prob] of Object.entries(session.studentModel.bnPosteriors)) {
        if (!bnNodes[node]) bnNodes[node] = [];
        bnNodes[node].push(prob);
      }
    }

    // collect captured evidence
    for (const tid of taskIdsIncludingDelivered(session)) {
      const task = taskMap[tid];
      if (task) {
        capturedSummary.push({
          sessionId: session.id,
          studentId: session.studentId,
          taskId: task.id,
          generatedObservationIds: task.generatedObservationIds || [],
          generatedEvidenceIds: task.generatedEvidenceIds || [],
        });
      }
    }
  }

  // 🔹 Compute competency/evidence coverage
  const competencyCoverage = {};
  const evidenceCoverage = {};
  for (const cap of capturedSummary) {
    for (const obsId of cap.generatedObservationIds || []) {
      for (const em of Object.values(evidenceModelMap)) {
        const obs = em._obsMap[obsId];
        if (obs) {
          const construct = em._constructMap[obs.constructId];
          if (construct) {
            competencyCoverage[construct.competencyId] =
              (competencyCoverage[construct.competencyId] || 0) + 1;
            evidenceCoverage[construct.evidenceId] =
              (evidenceCoverage[construct.evidenceId] || 0) + 1;
          }
        }
      }
    }
  }

  // 🔹 Aggregate IRT
  let irtSummary = null;
  if (irtValues.length > 0) {
    const mean = irtValues.reduce((a, b) => a + b, 0) / irtValues.length;
    const variance = irtValues.reduce((a, b) => a + (b - mean) ** 2, 0) / irtValues.length;
    irtSummary = {
      count: irtValues.length,
      mean,
      stddev: Math.sqrt(variance),
      distribution: {
        below0: irtValues.filter(v => v < 0).length,
        between0and1: irtValues.filter(v => v >= 0 && v <= 1).length,
        above1: irtValues.filter(v => v > 1).length,
      }
    };
  }

  // 🔹 Aggregate BN
  const bnSummary = {};
  for (const [node, probs] of Object.entries(bnNodes)) {
    const mean = probs.reduce((a, b) => a + b, 0) / probs.length;
    const entropy = (p) => (p <= 0 || p >= 1) ? 0 : -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
    bnSummary[node] = {
      count: probs.length,
      mean,
      meanEntropy: probs.map(p => entropy(p)).reduce((a, b) => a + b, 0) / probs.length,
      level: mean > 0.7 ? "Strong" : mean > 0.4 ? "Developing" : "Needs Support"
    };
  }

  // 🔹 Recommendations
  const recommendations = [];
  if (irtSummary) {
    if (irtSummary.mean < 0) {
      recommendations.push("Class average ability is below expected level. Provide additional practice.");
    } else if (irtSummary.mean > 1) {
      recommendations.push("Class shows advanced proficiency. Introduce more challenging material.");
    } else {
      recommendations.push("Class is around average. Continue balanced practice.");
    }
  }
  for (const [node, summary] of Object.entries(bnSummary)) {
    if (summary.level === "Needs Support") {
      recommendations.push(`Focus on improving ${node} across the class.`);
    } else if (summary.meanEntropy > 0.8) {
      recommendations.push(`More data needed for ${node} — assign additional tasks.`);
    }
  }

  res.json({
    classId,
    scope: namedAggregateScope(req, { kind: "class-report", classId }),
    minCellSize: MIN_CELL_SIZE,
    // D99: roster size only — not names/ids (small-cell / peer identification).
    studentCount: suppressCountSafe(students.length),
    policiesUsed: policyUsage.map((p) => ({
      // Drop sessionId — ties policy to an individual delivery.
      policy: p.policy,
    })),
    summary: {
      IRT: suppressIrtSummary(irtSummary),
      BayesianNetwork: suppressBnSummary(bnSummary),
      // Aggregate capture counts only — no per-student captured[].
      capturedTaskCount: suppressCountSafe(capturedSummary.length),
      competencyCoverage: suppressCoverageMap(competencyCoverage),
      evidenceCoverage: suppressCoverageMap(evidenceCoverage),
    },
    recommendations
  });
});

function suppressCountSafe(n) {
  if (n > 0 && n < MIN_CELL_SIZE) return null;
  return n;
}


// ------------------------------
// GET /api/reports/teacher/district/:districtId
// ------------------------------
router.get("/teacher/district/:districtId", canViewTeacherReports, async (req, res) => {
  const { districtId } = req.params;
  try {
    assertCallerMayAccessDistrict(districtId);
  } catch (err) {
    if (err instanceof TenancyError || err?.code === "TENANCY_REQUIRED") {
      return res.status(403).json({ error: err.message, code: err.code });
    }
    throw err;
  }
  const db = loadDB();
  db.sessions = await querySessions(db);

  // Find all students in district
  const students = db.students?.filter(stu => stu.districtId === districtId) || [];
  if (students.length === 0) {
    return res.status(404).json({ error: `No students found for districtId ${districtId}` });
  }

  // Group students by class
  const classGroups = {};
  for (const stu of students) {
    if (!stu.classId) continue;
    if (!classGroups[stu.classId]) classGroups[stu.classId] = [];
    classGroups[stu.classId].push(stu.id);
  }

  // 🔹 Pre-index
  const taskMap = Object.fromEntries((db.tasks || []).map((t) => [t.id, t]));
  const evidenceModelMap = {};
  for (const em of db.evidenceModels || []) {
    const obsMap = Object.fromEntries((em.observations || []).map((o) => [o.id, o]));
    const constructMap = Object.fromEntries((em.constructs || []).map((c) => [c.id, c]));
    evidenceModelMap[em.id] = { ...em, _obsMap: obsMap, _constructMap: constructMap };
  }
  const policyMap = Object.fromEntries((db.policies || []).map((p) => [p.id, p]));

  const districtReport = {
    districtId,
    classes: {},
    policiesUsed: [], // 🔹 NEW
    districtSummary: {
      IRT: null,
      BayesianNetwork: {},
      captured: [],
    },
    recommendations: []
  };

  const allIrt = [];
  const bnNodes = {};
  const capturedSummary = [];
  const allPolicyUsage = [];

  // Process each class group
  for (const [classId, stuIds] of Object.entries(classGroups)) {
    const classSessions = db.sessions?.filter(s => stuIds.includes(s.studentId)) || [];

    const irtValues = [];
    const bnLocal = {};
    const classPolicyUsage = [];

    for (const session of classSessions) {
      // 🔹 Track policy
      let policyDetails = null;
      if (session.nextTaskPolicy?.policyId && policyMap[session.nextTaskPolicy.policyId]) {
        policyDetails = policyMap[session.nextTaskPolicy.policyId];
      } else {
        policyDetails = Object.values(policyMap).find(p => p.type === session.selectionStrategy);
      }
      if (policyDetails) {
        classPolicyUsage.push({
          sessionId: session.id,
          policy: {
            id: policyDetails.id,
            name: policyDetails.name,
            description: policyDetails.description,
            type: policyDetails.type,
          }
        });
        allPolicyUsage.push({
          classId,
          sessionId: session.id,
          policy: {
            id: policyDetails.id,
            name: policyDetails.name,
            description: policyDetails.description,
            type: policyDetails.type,
          }
        });
      }

      // collect IRT
      if (session.selectionStrategy === "IRT" && session.studentModel?.irtTheta !== undefined) {
        irtValues.push(session.studentModel.irtTheta);
        allIrt.push(session.studentModel.irtTheta);
      }

      // collect BN
      if (session.selectionStrategy === "BayesianNetwork" && session.studentModel?.bnPosteriors) {
        for (const [node, prob] of Object.entries(session.studentModel.bnPosteriors)) {
          if (!bnLocal[node]) bnLocal[node] = [];
          if (!bnNodes[node]) bnNodes[node] = [];
          bnLocal[node].push(prob);
          bnNodes[node].push(prob);
        }
      }

      // collect captured evidence
      for (const tid of taskIdsIncludingDelivered(session)) {
        const task = taskMap[tid];
        if (task) {
          capturedSummary.push({
            sessionId: session.id,
            studentId: session.studentId,
            classId,
            taskId: task.id,
            generatedObservationIds: task.generatedObservationIds || [],
            generatedEvidenceIds: task.generatedEvidenceIds || [],
          });
        }
      }
    }

    // summarize IRT for class
    let irtSummary = null;
    if (irtValues.length > 0) {
      const mean = irtValues.reduce((a, b) => a + b, 0) / irtValues.length;
      const variance = irtValues.reduce((a, b) => a + (b - mean) ** 2, 0) / irtValues.length;
      irtSummary = { count: irtValues.length, mean, stddev: Math.sqrt(variance) };
    }

    // summarize BN for class
    const bnSummary = {};
    const entropy = (p) => (p <= 0 || p >= 1) ? 0 : -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
    for (const [node, probs] of Object.entries(bnLocal)) {
      const mean = probs.reduce((a, b) => a + b, 0) / probs.length;
      bnSummary[node] = {
        count: probs.length,
        mean,
        meanEntropy: probs.map(p => entropy(p)).reduce((a, b) => a + b, 0) / probs.length,
      };
    }

    districtReport.classes[classId] = {
      IRT: suppressIrtSummary(irtSummary),
      BayesianNetwork: suppressBnSummary(bnSummary),
      // D99: policy type counts only — no sessionId.
      policiesUsed: classPolicyUsage.map((p) => ({ policy: p.policy })),
    };
  }

  // district-wide IRT
  if (allIrt.length > 0) {
    const mean = allIrt.reduce((a, b) => a + b, 0) / allIrt.length;
    const variance = allIrt.reduce((a, b) => a + (b - mean) ** 2, 0) / allIrt.length;
    districtReport.districtSummary.IRT = suppressIrtSummary({
      count: allIrt.length,
      mean,
      stddev: Math.sqrt(variance),
    });

    if (mean < 0) {
      districtReport.recommendations.push("District average ability is below expected. Consider remedial programs.");
    } else if (mean > 1) {
      districtReport.recommendations.push("District shows advanced proficiency. Consider enrichment programs.");
    } else {
      districtReport.recommendations.push("District is around average. Balanced curriculum is appropriate.");
    }
  }

  // district-wide BN
  const entropy = (p) => (p <= 0 || p >= 1) ? 0 : -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
  const bnDistrict = {};
  for (const [node, probs] of Object.entries(bnNodes)) {
    const mean = probs.reduce((a, b) => a + b, 0) / probs.length;
    bnDistrict[node] = {
      count: probs.length,
      mean,
      meanEntropy: probs.map(p => entropy(p)).reduce((a, b) => a + b, 0) / probs.length,
    };
    if (mean < 0.4) {
      districtReport.recommendations.push(`District needs support in ${node}.`);
    } else if (mean > 0.7) {
      districtReport.recommendations.push(`District shows strong performance in ${node}.`);
    }
  }
  districtReport.districtSummary.BayesianNetwork = suppressBnSummary(bnDistrict);

  // D99: capture counts only — no per-student captured[].
  const competencyCoverage = {};
  const evidenceCoverage = {};
  for (const cap of capturedSummary) {
    for (const obsId of cap.generatedObservationIds || []) {
      for (const em of Object.values(evidenceModelMap)) {
        const obs = em._obsMap[obsId];
        if (obs) {
          const construct = em._constructMap[obs.constructId];
          if (construct) {
            competencyCoverage[construct.competencyId] =
              (competencyCoverage[construct.competencyId] || 0) + 1;
            evidenceCoverage[construct.evidenceId] =
              (evidenceCoverage[construct.evidenceId] || 0) + 1;
          }
        }
      }
    }
  }
  districtReport.districtSummary.captured = undefined;
  districtReport.districtSummary.capturedTaskCount = suppressCountSafe(capturedSummary.length);
  districtReport.districtSummary.competencyCoverage = suppressCoverageMap(competencyCoverage);
  districtReport.districtSummary.evidenceCoverage = suppressCoverageMap(evidenceCoverage);

  districtReport.policiesUsed = allPolicyUsage.map((p) => ({
    classId: p.classId,
    policy: p.policy,
  }));
  districtReport.scope = namedAggregateScope(req, {
    kind: "district-report",
    districtId,
  });
  districtReport.minCellSize = MIN_CELL_SIZE;

  res.json(districtReport);
});

const UNSCOPED_DB = Object.freeze({
  role: "admin",
  username: "",
  viewScope: null,
  districtId: null,
  schoolId: null,
  unscoped: true,
});

function loadDbForCumulative() {
  return runWithTenancy(UNSCOPED_DB, () => loadDB());
}

function staffMayReadStudent(user, identity) {
  if (!user || !identity) return false;
  if (user.role === "admin") return true;
  if (!identity.districtId && !identity.schoolId) {
    return user.role === "district" || user.role === "teacher";
  }
  const did = user.districtId;
  if (!did || !identity.districtId || String(did) !== String(identity.districtId)) return false;
  if (user.role === "district") return true;
  if (user.role === "teacher") {
    const sid = user.schoolId;
    if (sid && identity.schoolId) return String(sid) === String(identity.schoolId);
    return true;
  }
  return false;
}

function studentRowFromIdentity(db, identity, fallbackId) {
  const aliases = new Set((identity?.identityAliases || []).map(String));
  if (identity?.canonicalStudentId) aliases.add(String(identity.canonicalStudentId));
  if (fallbackId) aliases.add(String(fallbackId));
  const row = (db.students || []).find(
    (s) =>
      s &&
      (aliases.has(String(s.id)) ||
        aliases.has(String(s.username)) ||
        aliases.has(String(s.userId)))
  );
  if (row) return row;
  return {
    id: identity?.canonicalStudentId || fallbackId,
    name: identity?.displayName || fallbackId,
    districtId: identity?.districtId || null,
    schoolId: identity?.schoolId || null,
  };
}

// ------------------------------
// GET /api/reports/cumulative/student
// Student: own history only (query studentId ignored). Staff: ?studentId= in tenancy.
// ------------------------------
router.get("/cumulative/student", async (req, res) => {
  const role = req.user?.role;
  const db = loadDbForCumulative();
  db.sessions = await querySessions(db, { unscoped: true });

  let requestedId;
  if (role === "student") {
    requestedId = req.user.username || req.user.id;
  } else if (role === "admin" || role === "district" || role === "teacher") {
    requestedId = req.query.studentId;
    if (!requestedId) {
      return res.status(400).json({ error: "studentId is required" });
    }
  } else {
    return res.status(403).json({ error: "Forbidden" });
  }

  const identity = resolveStudentIdentity(requestedId, db);
  if (role === "student") {
    const self = resolveStudentIdentity(req.user.username || req.user.id, db);
    const selfKeys = new Set(self.identityAliases || []);
    const overlap = (identity.identityAliases || []).some((alias) => selfKeys.has(String(alias)));
    if (!overlap) {
      return res.status(403).json({ error: "Forbidden" });
    }
  } else if (!staffMayReadStudent(req.user, identity)) {
    return res.status(403).json({ error: "Forbidden", code: "TENANCY_REQUIRED" });
  }

  const student = studentRowFromIdentity(db, identity, requestedId);
  const sessions = sessionsForStudent(db.sessions || [], db, student, requestedId);
  const studentModelRecords = await queryStudentModelRecords(db, { identity });
  const comparisonStudents = comparisonStudentsFor(db, student);
  const report = buildStudentCumulativeReport(db, {
    student,
    sessions,
    studentModelRecords,
    comparisonStudents,
    comparisonSessions: db.sessions || [],
  });
  report.scope = namedAggregateScope(req, { kind: "student-cumulative", studentId: student.id });
  res.json(report);
});

// ------------------------------
// GET /api/reports/cumulative/teacher
// Teacher classroom (named roster). District/admin may pass ?teacherId=.
// Students: 403.
// ------------------------------
router.get("/cumulative/teacher", canViewTeacherReports, async (req, res) => {
  const db = loadDbForCumulative();
  db.sessions = await querySessions(db, { unscoped: true });
  const role = req.user?.role;
  const teacherUser = {
    role: "teacher",
    username: role === "teacher" ? (req.user.username || req.user.id) : (req.query.teacherId || req.user.username),
    id: req.user.id,
    districtId: req.user.districtId || null,
    schoolId: req.user.schoolId || null,
  };
  if (role === "teacher") {
    teacherUser.username = req.user.username || req.user.id;
    teacherUser.districtId = req.user.districtId || null;
    teacherUser.schoolId = req.user.schoolId || null;
  } else if (req.query.teacherId) {
    const listed = (db.users || []).find(
      (u) => u && u.role === "teacher" && (u.username === req.query.teacherId || u.id === req.query.teacherId)
    );
    teacherUser.username = listed?.username || req.query.teacherId;
    teacherUser.districtId = listed?.districtId || listed?.profile?.districtId || req.user.districtId || null;
    teacherUser.schoolId = listed?.schoolId || listed?.profile?.schoolId || req.user.schoolId || null;
    if (role !== "admin") {
      const callerDid = req.user.districtId;
      if (callerDid && teacherUser.districtId && String(callerDid) !== String(teacherUser.districtId)) {
        return res.status(403).json({ error: "Teacher is outside caller district", code: "TENANCY_REQUIRED" });
      }
    }
  }

  const students = scopedStudentsFor(
    role === "teacher" ? req.user : { ...req.user, role: "teacher", schoolId: teacherUser.schoolId, districtId: teacherUser.districtId, username: teacherUser.username },
    db
  );
  const aliases = new Set();
  for (const student of students) {
    const identity = resolveStudentIdentity(student.id, db);
    for (const alias of identity.identityAliases || []) aliases.add(String(alias));
    aliases.add(String(student.id));
  }
  const sessions = (db.sessions || []).filter(
    (s) => aliases.has(String(s.studentId)) || (s.studentIds || []).some((id) => aliases.has(String(id)))
  );
  const report = buildTeacherCumulativeReport(db, { teacher: teacherUser, students, sessions });
  report.scope = namedAggregateScope(req, { kind: "teacher-cumulative", teacherId: teacherUser.username });
  res.json(report);
});

// ------------------------------
// GET /api/reports/cumulative/district
// District/admin curriculum. Named students omitted. MIN_CELL_SIZE on cells.
// Teacher and student: 403.
// ------------------------------
router.get("/cumulative/district", authorizeRole(["admin", "district"]), async (req, res) => {
  const db = loadDbForCumulative();
  db.sessions = await querySessions(db, { unscoped: true });
  let districtId = null;
  if (req.user.role === "district") {
    districtId = req.user.districtId || null;
    if (!districtId) {
      return res.status(403).json({ error: "District id missing on caller", code: "TENANCY_REQUIRED" });
    }
  } else if (req.query.districtId) {
    districtId = req.query.districtId;
  }

  if (districtId && req.user.role !== "admin") {
    try {
      assertCallerMayAccessDistrict(districtId);
    } catch (err) {
      if (err instanceof TenancyError || err?.code === "TENANCY_REQUIRED") {
        return res.status(403).json({ error: err.message, code: err.code });
      }
      throw err;
    }
  }

  const students = districtId
    ? (db.students || []).filter((s) => s && s.districtId === districtId)
    : scopedStudentsFor(req.user, db);
  const aliases = new Set();
  for (const student of students) {
    const identity = resolveStudentIdentity(student.id, db);
    for (const alias of identity.identityAliases || []) aliases.add(String(alias));
    aliases.add(String(student.id));
  }
  const sessions = (db.sessions || []).filter(
    (s) => aliases.has(String(s.studentId)) || (s.studentIds || []).some((id) => aliases.has(String(id)))
  );
  const report = buildDistrictCumulativeReport(db, { districtId, students, sessions });
  report.scope = namedAggregateScope(req, { kind: "district-cumulative", districtId });
  res.json(report);
});

// ------------------------------
// GET /api/reports/dashboard
// D99: aggregates ONLY over JWT-scoped sessions/students (never query-role).
// ------------------------------
function percentFromMean(mean) {
  if (!Number.isFinite(mean)) return 0;
  return mean <= 1 ? Math.round(mean * 100) : Math.round(mean);
}

function responseScore(response) {
  if (!response || typeof response !== "object") return null;
  if (typeof response.scoredValue === "number" && Number.isFinite(response.scoredValue)) {
    return response.scoredValue;
  }
  if (response.scoredValue != null && response.scoredValue !== "") {
    const parsed = parseFloat(response.scoredValue);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (response.activated === true) return 1;
  if (response.activated === false) return 0;
  return null;
}

router.get("/dashboard", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const role = req.user?.role || "student";

    // Same store as the session and class-report routes. dbAdapter follows
    // DB_MODE, which on the live server is mongo, while delivery writes
    // the JSON file. Reading mongo here showed an empty dashboard beside
    // sessions that had just been completed.
    const db = loadDB();
    db.sessions = await querySessions(db);
    const sessions = db.sessions || [];
    const tasks = db.tasks || [];
    const students = db.students || [];

    // Scope from JWT claims only (ignore query districtId/teacherId spoofing).
    let scopedStudents = [...students];
    if (role === "district") {
      const did = req.user?.districtId;
      scopedStudents = did
        ? students.filter((s) => s.districtId === did)
        : [];
    } else if (role === "teacher") {
      const sid = req.user?.schoolId;
      const did = req.user?.districtId;
      scopedStudents = students.filter((s) => {
        if (sid && s.schoolId) return s.schoolId === sid;
        if (did) return s.districtId === did;
        return false;
      });
    } else if (role === "student") {
      const selfId = req.user?.username;
      scopedStudents = students.filter(
        (s) => s.id === selfId || s.username === selfId
      );
    }
    // admin: all (ALS already unscoped)

    const scopedStudentIds = new Set(scopedStudents.map((s) => s.id));
    // Sessions for students in scope; also include sessions already ALS-filtered
    // whose studentId is in the set (or student self sessions).
    let scopedSessions = sessions.filter(
      (s) =>
        scopedStudentIds.has(s.studentId) ||
        (role === "student" &&
          (s.studentId === req.user?.username ||
            (s.studentIds || []).includes(req.user?.username)))
    );
    if (role === "admin") scopedSessions = sessions;

    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    const filteredSessions = scopedSessions.filter((s) => {
      const ts = new Date(s.finishedAt || s.updatedAt || s.startedAt || new Date());
      if (start && ts < start) return false;
      if (end && ts > end) return false;
      return true;
    });

    const totalSessions = filteredSessions.length;
    const avgScore =
      filteredSessions.reduce((sum, s) => {
        const vals = (s.responses || [])
          .map(responseScore)
          .filter((v) => v != null);
        return (
          sum +
          (vals.length > 0
            ? vals.reduce((a, b) => a + b, 0) / vals.length
            : 0)
        );
      }, 0) / (totalSessions || 1);

    const activeStudentsRaw = scopedStudents.length;
    const activeStudents =
      activeStudentsRaw > 0 && activeStudentsRaw < MIN_CELL_SIZE
        ? null
        : activeStudentsRaw;

    const summary = {
      sessions:
        totalSessions > 0 && totalSessions < MIN_CELL_SIZE ? null : totalSessions,
      sessionsSuppressed:
        totalSessions > 0 && totalSessions < MIN_CELL_SIZE,
      averageScore: percentFromMean(avgScore),
      masteryRate: `${percentFromMean(avgScore)}%`,
      activeStudents,
      activeStudentsSuppressed:
        activeStudentsRaw > 0 && activeStudentsRaw < MIN_CELL_SIZE,
    };

    const byDate = {};
    for (const s of filteredSessions) {
      const d = new Date(
        s.finishedAt || s.updatedAt || s.startedAt || Date.now()
      )
        .toISOString()
        .slice(0, 10);
      if (!byDate[d]) byDate[d] = [];
      const vals = (s.responses || []).map(responseScore).filter((v) => v != null);
      if (vals.length > 0)
        byDate[d].push(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
    const performance = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({
        date,
        average: percentFromMean(vals.reduce((a, b) => a + b, 0) / vals.length),
        n:
          vals.length > 0 && vals.length < MIN_CELL_SIZE ? null : vals.length,
      }));

    const masteryMap = {};
    for (const s of filteredSessions) {
      for (const r of s.responses || []) {
        const key = r.evidenceId || r.evidenceModelId;
        const score = responseScore(r);
        if (!key || score == null) continue;
        masteryMap[key] = masteryMap[key] || [];
        masteryMap[key].push(score);
      }
    }
    const mastery = Object.entries(masteryMap)
      .filter(([, vals]) => vals.length === 0 || vals.length >= MIN_CELL_SIZE)
      .map(([competency, vals]) => ({
        competency,
        score: percentFromMean(vals.reduce((a, b) => a + b, 0) / vals.length),
        n: vals.length,
      }));

    // Tasks are global content — evidence-type histogram is bank-wide and
    // OK to show; not examinee PII. Still name the bank scope.
    const evidenceCounts = { selected: 0, constructed: 0, rubric: 0, performance: 0 };
    for (const t of tasks) {
      for (const evid of t.generatedEvidenceIds || []) {
        const key =
          evid.toLowerCase().includes("rubric")
            ? "rubric"
            : evid.toLowerCase().includes("perf")
              ? "performance"
              : evid.toLowerCase().includes("const")
                ? "constructed"
                : "selected";
        evidenceCounts[key] = (evidenceCounts[key] || 0) + 1;
      }
    }
    const evidence = Object.entries(evidenceCounts).map(([label, value]) => ({
      label,
      value,
    }));

    const table = filteredSessions.slice(-10).map((s) => ({
      // D99: no raw session id as "name" for non-admin small lists.
      name: role === "admin" ? s.id : "session",
      score: (() => {
        const vals = (s.responses || []).map(responseScore).filter((v) => v != null);
        if (vals.length === 0) return 0;
        return percentFromMean(vals.reduce((a, b) => a + b, 0) / vals.length);
      })(),
      tasks: taskIdsIncludingDelivered(s).length,
      date: s.finishedAt
        ? new Date(s.finishedAt).toISOString().slice(0, 10)
        : "-",
    }));

    res.json({
      scope: namedAggregateScope(req, { kind: "dashboard" }),
      minCellSize: MIN_CELL_SIZE,
      summary,
      charts: { performance, mastery, evidence },
      table,
    });
  } catch (err) {
    console.error("❌ Dashboard analytics failed:", err);
    res.status(500).json({ error: "Failed to generate analytics" });
  }
});

export default router;
