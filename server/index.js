import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import "dotenv/config";

import sessionRoutes from "./routes/sessionRoutes.js";
import questionsRoutes from "./routes/questionsRoutes.js";
// import aigRoutes from "./routes/aigRoutes.js"; // still unmounted -- AIG generation is out of scope for this pass
import itemsRoutes from "./routes/itemsRoutes.js";
import itemAnalyticsRoutes from "./routes/itemAnalyticsRoutes.js";
import competencyRoutes from "./routes/competencyModels.js";
// import linkRoutes from "./routes/links.js";
import evidenceRoutes from "./routes/evidenceModels.js";
import tasksRoutes from "./routes/tasksRoutes.js";
import taskModelsRoutes from "./routes/taskModelsRoutes.js";
import reportsRoutes from "./routes/reportsRoutes.js";
import studentsRoutes from "./routes/studentsRoutes.js";
import policiesRoutes from "./routes/policiesRoutes.js";
import curricularPoliciesRoutes from "./routes/curricularPoliciesRoutes.js";
import calibrationRoutes from "./routes/calibrationRoutes.js";
import calibrationJobsRoutes from "./routes/calibrationJobsRoutes.js";
import { recoverRunningJobs, processQueuedJobs } from "./r/calibrationWorker.js";
import { getRHealth, rBackendUrl } from "./r/rClient.js";
import usersRoutes from "./routes/usersRoutes.js";
// D48: the three collections that had schema, lifecycle validators and no
// HTTP surface at all -- artefacts 4 and 6 of the seven-artefact contract
// were absent for each. qMatrixModels/assemblyModels are authored and
// lifecycle-governed; compositeLibrary is a read-only build artifact.
import qMatrixModelsRoutes from "./routes/qMatrixModelsRoutes.js";
import assemblyModelsRoutes from "./routes/assemblyModelsRoutes.js";
import compositeLibraryRoutes from "./routes/compositeLibraryRoutes.js";
import announcementsRoutes from "./routes/announcementsRoutes.js";
import { authenticateToken, authorizeRole } from "./utils/authMiddleware.js";

const app = express();
app.use(express.json());
app.use(bodyParser.json());

// Enable CORS for development only
if (process.env.NODE_ENV !== "production") {
  app.use(cors({ origin: "http://localhost:5173", credentials: true }));
}

// Role-specific dashboard "am I still logged in" probes. These used to have
// no auth at all — anyone could hit /api/admin/data with no token — and the
// frontend dashboards relied on them as their own session-validity check, so
// the check was checking nothing. Each is now gated to the matching role.
app.get("/api/admin/data", authenticateToken, authorizeRole(["admin"]), (req, res) => {
  res.json({ message: "Admin-only data", timestamp: new Date() });
});

app.get("/api/district/data", authenticateToken, authorizeRole(["district", "admin"]), (req, res) => {
  res.json({ message: "District-only data", timestamp: new Date() });
});

app.get("/api/teacher/data", authenticateToken, authorizeRole(["teacher", "admin"]), (req, res) => {
  res.json({ message: "Teacher-only data", timestamp: new Date() });
});

app.get("/api/student/data", authenticateToken, authorizeRole(["student", "admin"]), (req, res) => {
  res.json({ message: "Student-only data", timestamp: new Date() });
});

// ------------------------------
// Existing API routes
// Every router below now requires a valid bearer token (see router.use()
// in each routes/*.js file) — previously only usersRoutes.js checked auth
// at all, so every other endpoint (sessions, items, competency/evidence/task
// models, reports, students, policies, calibration) was reachable by anyone
// with no login, token, or role.
// ------------------------------
app.use("/api/sessions", sessionRoutes);
app.use("/api/questions", questionsRoutes);
// app.use("/api/aig", aigRoutes);
app.use("/api/items", itemsRoutes);
app.use("/api/itemAnalytics", itemAnalyticsRoutes);
app.use("/api/tasks", tasksRoutes);
app.use("/api/competencies", competencyRoutes);
// app.use("/api/competency-links", linkRoutes);
app.use("/api/evidenceModels", evidenceRoutes);
app.use("/api/taskModels", taskModelsRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/students", studentsRoutes);
app.use("/api/policies", policiesRoutes);
// Curriculum documents (NCF-style curricular goals) — separate from the
// adaptive item-selection policies mounted immediately above.
app.use("/api/curricularPolicies", curricularPoliciesRoutes);
app.use("/api/calibrate", calibrationRoutes);
app.use("/api/calibrationJobs", calibrationJobsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/qMatrixModels", qMatrixModelsRoutes);
app.use("/api/assemblyModels", assemblyModelsRoutes);
app.use("/api/compositeLibrary", compositeLibraryRoutes);
app.use("/api/announcements", announcementsRoutes);

// ------------------------------
// No static serving here! Nginx handles frontend build
// ------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ ECD Assessment API running at http://localhost:${PORT}`);
  try {
    recoverRunningJobs();
  } catch (err) {
    console.error("calibration job recovery failed:", err);
  }
  getRHealth()
    .then((h) => {
      console.log(`R backend ${rBackendUrl()} /health -> ${h.status}${h.ok ? "" : " (unreachable)"}`);
    })
    .catch((err) => {
      console.error(`R backend ${rBackendUrl()} probe failed:`, err?.message || err);
    });
  if (process.env.CALIBRATION_QUEUE_AUTORUN === "1") {
    processQueuedJobs().catch((err) => {
      console.error("calibration queue start failed:", err);
    });
  }
});
