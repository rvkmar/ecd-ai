// server/routes/api/reportsRoutes.js
import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { loadDB } from "../../src/utils/db-server.js";
import { dbAdapter } from "../utils/dbAdapter.js";
import { sessionMeasurementReport } from "../delivery/sessionReportMeasurement.js";


const router = express.Router();

// Every endpoint in this router requires a valid, logged-in session.
// (Previously this file had no auth check at all — added as part of the
// Phase 1 security hardening pass; see AUTH_SECURITY_FIXES.md.)
router.use(authenticateToken);

// D59: teacher-report payloads (per-session teacher report, class, and
// district) are staff-only. Authenticate-only was the examinee leak —
// any logged-in student could GET /session/:id/teacher-report. Matches
// rolePermissions.js `teacherReports` (admin / district / teacher).
// Learner feedback and the generic session report stay open to any
// authenticated role: students may read their own session's learner
// view. Ownership-scoping (a student may only read THEIR session) is
// the same outstanding gap sessionRoutes.js already names.
const canViewTeacherReports = authorizeRole(["admin", "district", "teacher"]);

// ------------------------------
// GET /api/reports/session/:id
// ------------------------------
router.get("/session/:id", (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  const session = db.sessions.find(s => s.id === id);
  if (!session) return res.status(404).json({ error: "Session not found" });

  const student = db.students?.find(stu => stu.id === session.studentId);

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
    responses: session.responses || [],
    captured: [], // new: evidence & observations from tasks
    constructs: [],
    recommendations: [],
    stopped: measurement.stopped,
    attributeProfile: measurement.attributeProfile,
  };

  // 🔹 Captured evidence/observations (from Task Instances)
  for (const tid of session.taskIds || []) {
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
      report.constructs.push({
        type: "BayesianNetwork",
        node,
        probability: prob,
        level: prob > 0.7 ? "Strong" : prob > 0.4 ? "Developing" : "Needs Support",
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
router.get("/session/:id/learner-feedback", (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  const session = db.sessions.find(s => s.id === id);
  if (!session) return res.status(404).json({ error: "Session not found" });

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
    for (const [node, prob] of Object.entries(session.studentModel.bnPosteriors)) {
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

  res.json(feedback);
});



// ------------------------------
// GET /api/reports/session/:id/teacher-report
// ------------------------------
router.get("/session/:id/teacher-report", canViewTeacherReports, (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  const session = db.sessions.find(s => s.id === id);
  if (!session) return res.status(404).json({ error: "Session not found" });

  const student = db.students?.find(stu => stu.id === session.studentId);

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
    studentName: student ? student.name : null,

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
    responses: (session.responses || []).map((r) => {
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

      report.modelSummary.BayesianNetwork[node] = {
        posterior: prob,
        entropy: entropy(prob),
        level: prob > 0.7 ? "Strong" : prob > 0.4 ? "Developing" : "Needs Support"
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

  res.json(report);
});

// ------------------------------
// GET /api/reports/teacher/class/:classId
// ------------------------------
router.get("/teacher/class/:classId", canViewTeacherReports, (req, res) => {
  const { classId } = req.params;
  const db = loadDB();

  // find students in class
  const students = db.students?.filter(stu => stu.classId === classId) || [];
  if (students.length === 0) {
    return res.status(404).json({ error: `No students found for classId ${classId}` });
  }

  // get all sessions for these students
  const sessions = db.sessions?.filter(s => students.some(stu => stu.id === s.studentId)) || [];
  if (sessions.length === 0) {
    return res.json({ classId, summary: {}, recommendations: [] });
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
    for (const tid of session.taskIds || []) {
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
    students: students.map(s => ({ id: s.id, name: s.name })),
    policiesUsed: policyUsage, // 🔹 NEW
    summary: {
      IRT: irtSummary,
      BayesianNetwork: bnSummary,
      captured: capturedSummary,
      competencyCoverage,
      evidenceCoverage,
    },
    recommendations
  });
});


// ------------------------------
// GET /api/reports/teacher/district/:districtId
// ------------------------------
router.get("/teacher/district/:districtId", canViewTeacherReports, (req, res) => {
  const { districtId } = req.params;
  const db = loadDB();

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
      for (const tid of session.taskIds || []) {
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
      IRT: irtSummary,
      BayesianNetwork: bnSummary,
      policiesUsed: classPolicyUsage // 🔹 NEW
    };
  }

  // district-wide IRT
  if (allIrt.length > 0) {
    const mean = allIrt.reduce((a, b) => a + b, 0) / allIrt.length;
    const variance = allIrt.reduce((a, b) => a + (b - mean) ** 2, 0) / allIrt.length;
    districtReport.districtSummary.IRT = {
      count: allIrt.length,
      mean,
      stddev: Math.sqrt(variance),
    };

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
  for (const [node, probs] of Object.entries(bnNodes)) {
    const mean = probs.reduce((a, b) => a + b, 0) / probs.length;
    districtReport.districtSummary.BayesianNetwork[node] = {
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

  // attach captured + coverage
  districtReport.districtSummary.captured = capturedSummary;
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
  districtReport.districtSummary.competencyCoverage = competencyCoverage;
  districtReport.districtSummary.evidenceCoverage = evidenceCoverage;

  // 🔹 Attach policy usage
  districtReport.policiesUsed = allPolicyUsage;

  res.json(districtReport);
});

// ------------------------------
// GET /api/reports/dashboard?role=admin|district|teacher|student
// ------------------------------
router.get("/dashboard", async (req, res) => {
  try {
    const {
      districtId,
      teacherId,
      studentId,
      startDate,
      endDate,
    } = req.query;

    // D59: the caller's role comes from the token, not from `?role=`.
    // The query string used to let any authenticated user request the
    // teacher/admin dashboard payload.
    const role = req.user?.role || "student";

    const [sessions, tasks, students] = await Promise.all([
      dbAdapter.list("sessions"),
      dbAdapter.list("tasks"),
      dbAdapter.list("students"),
    ]);

    // ------------------------------
    // 🔹 Role-based filtering
    // ------------------------------
    let scopedStudents = [...students];

    if (role === "district" && districtId) {
      scopedStudents = students.filter((s) => s.districtId === districtId);
    }

    if (role === "teacher" && teacherId) {
      // Assume teacher's class or assigned students marked by teacherId
      scopedStudents = students.filter((s) => s.teacherId === teacherId);
    }

    if (role === "student") {
      const selfId = studentId || req.user?.username;
      scopedStudents = students.filter((s) => s.id === selfId);
    }

    const scopedStudentIds = scopedStudents.map((s) => s.id);
    const scopedSessions = sessions.filter((s) =>
      scopedStudentIds.includes(s.studentId)
    );

    // ------------------------------
    // 🔹 Apply Date Filter
    // ------------------------------
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;

    const filteredSessions = scopedSessions.filter((s) => {
      const ts = new Date(s.finishedAt || s.updatedAt || s.startedAt || new Date());
      if (start && ts < start) return false;
      if (end && ts > end) return false;
      return true;
    });

    // ------------------------------
    // 🔹 Summary
    // ------------------------------
    const totalSessions = filteredSessions.length;
    const avgScore =
      sessions.reduce((sum, s) => {
        const vals = (s.responses || [])
          .map((r) => (typeof r.scoredValue === "number" ? r.scoredValue : parseFloat(r.scoredValue)))
          .filter((v) => !isNaN(v));
        return sum + (vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0);
      }, 0) / (totalSessions || 1);

    const activeStudents = students.length;
    const masteryRate = `${Math.round(avgScore)}%`;

    // 🔹 Summary section
    const summary = {
      sessions: totalSessions,
      averageScore: Math.round(avgScore),
      masteryRate,
      activeStudents,
    };

    // 🔹 Performance chart (per day)
    const byDate = {};
    for (const s of sessions) {
      const d = (s.finishedAt || s.updatedAt || s.startedAt || new Date()).toISOString().slice(0, 10);
      if (!byDate[d]) byDate[d] = [];
      const vals = (s.responses || []).map((r) => Number(r.scoredValue) || 0);
      if (vals.length > 0) byDate[d].push(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
    const performance = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date, average: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) }));

    // 🔹 Competency Mastery (from evidenceModels or responses)
    const masteryMap = {};
    for (const s of sessions) {
      for (const r of s.responses || []) {
        if (!r.evidenceId) continue;
        masteryMap[r.evidenceId] = masteryMap[r.evidenceId] || [];
        masteryMap[r.evidenceId].push(Number(r.scoredValue) || 0);
      }
    }
    const mastery = Object.entries(masteryMap).map(([competency, vals]) => ({
      competency,
      score: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
    }));

    // 🔹 Evidence coverage (types of observations)
    const evidenceCounts = { selected: 0, constructed: 0, rubric: 0, performance: 0 };
    for (const t of tasks) {
      for (const evid of t.generatedEvidenceIds || []) {
        const key =
          evid.toLowerCase().includes("rubric") ? "rubric" :
          evid.toLowerCase().includes("perf") ? "performance" :
          evid.toLowerCase().includes("const") ? "constructed" :
          "selected";
        evidenceCounts[key] = (evidenceCounts[key] || 0) + 1;
      }
    }
    const evidence = Object.entries(evidenceCounts).map(([label, value]) => ({ label, value }));

    // 🔹 Table summary (latest sessions)
    const table = sessions.slice(-10).map((s) => ({
      name: s.id,
      score: Math.round(
        ((s.responses || [])
          .map((r) => Number(r.scoredValue) || 0)
          .reduce((a, b) => a + b, 0) / ((s.responses || []).length || 1)) || 0
      ),
      tasks: s.taskIds?.length || 0,
      date: s.finishedAt ? new Date(s.finishedAt).toISOString().slice(0, 10) : "-",
    }));

    res.json({
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
