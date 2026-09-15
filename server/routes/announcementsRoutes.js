// server/routes/announcementsRoutes.js
import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { loadDB, saveDB } from "../../src/utils/db-server.js";
import {
  announcementsForRole,
  buildAnnouncementRecord,
  canDeleteAnnouncement,
} from "../../src/utils/announcements.js";

const router = express.Router();
router.use(authenticateToken);

const canAuthor = authorizeRole(["admin", "district"]);

// GET /api/announcements — visible to the caller's role
router.get("/", (req, res) => {
  try {
    const db = loadDB();
    const role = req.user?.role;
    res.json(announcementsForRole(db.announcements || [], role));
  } catch (err) {
    console.error("GET /api/announcements failed:", err);
    res.json([]);
  }
});

// POST /api/announcements
router.post("/", canAuthor, (req, res) => {
  try {
    const db = loadDB();
    if (!db.announcements) db.announcements = [];
    const record = buildAnnouncementRecord({
      title: req.body?.title,
      body: req.body?.body,
      visibility: req.body?.visibility,
      audienceRoles: req.body?.audienceRoles,
      authorRole: req.user.role,
      createdBy: req.user.username,
    });
    db.announcements.push(record);
    saveDB(db);
    res.status(201).json(record);
  } catch (err) {
    res.status(400).json({ error: err.message || "Invalid announcement" });
  }
});

// DELETE /api/announcements/:id
router.delete("/:id", (req, res) => {
  const db = loadDB();
  if (!db.announcements) db.announcements = [];
  const idx = db.announcements.findIndex((a) => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Announcement not found" });

  const ann = db.announcements[idx];
  if (!canDeleteAnnouncement(ann, req.user)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  db.announcements.splice(idx, 1);
  saveDB(db);
  res.status(204).end();
});

export default router;
