 // server/routes/autoFinishRoutes.js
 //
 // Not currently mounted in server/index.js. Gated anyway: an unmounted
 // route file is one accidental `app.use()` away from being live, and an
 // ungated admin sweep / force-finish is exactly the kind of gap that
 // slipped through before the RBAC sweep found it in the mounted routers.
 import express from "express";
 import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
 import { autoFinishDueSessions } from "../utils/autoFinish.js";
 import { loadDB, saveDB } from "../../src/utils/db-server.js";
 import { getSessionById, replaceStoredSession } from "../sessions/sessionRepository.js";
 import { commitFinishedStudentModel } from "../studentModelRecords/studentModelRecordRepository.js";

 const router = express.Router();
 router.use(authenticateToken);

 // ------------------------------
 // POST /api/admin/auto-finish/run
 // Run sweeping job immediately (admin only)
 // ------------------------------
 router.post("/admin/auto-finish/run", authorizeRole(["admin"]), async (req, res) => {
   try {
     const changed = await autoFinishDueSessions();
     res.json({ success: true, changed });
   } catch (err) {
     console.error(err);
     res.status(500).json({ success: false, error: err.message });
   }
 });
 
 // ------------------------------
 // POST /api/sessions/:id/force-finish
 // Teacher/admin can force finish a session
 // ------------------------------
 router.post("/sessions/:id/force-finish", authorizeRole(["admin", "teacher"]), async (req, res) => {
   const { id } = req.params;
   const db = loadDB();
   const session = await getSessionById(db, id);
   if (!session) {
     return res.status(404).json({ error: "Session not found" });
   }
 
   if (session.status === "submitted" && session.isCompleted) {
     return res.json({ success: true, message: "Already submitted", id });
   }
 
   const now = new Date();
   session.status = "submitted";
   session.isCompleted = true;
   session.autoFinished = false; // teacher override, not auto
   session.finishedAt = now.toISOString();
   session.updatedAt = now.toISOString();
 
   session.responses = session.responses || [];
   for (const r of session.responses) {
     r.locked = true;
     r.submittedAt = r.submittedAt || now.toISOString();
   }
 
   await commitFinishedStudentModel(db, session, { now: session.finishedAt });
   await replaceStoredSession(db, session);
   saveDB(db);
 
   res.json({ success: true, id });
 });
 
 export default router;
