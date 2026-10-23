// Admin zip import/export for the ECD chain.
// POST /api/data/zip?dryRun=1&keepOriginalIds=0  body: application/zip
// GET  /api/data/zip                              → the same file layout

import express from "express";
import { authenticateToken, authorizeRole } from "../utils/authMiddleware.js";
import { sanitizeRequestInputs } from "../utils/requestValidation.js";
import { loadDB, saveDB } from "../../src/utils/db-server.js";
import { exportDbAsZip, importZipIntoDb, ZipError } from "../import/ecdZipImport.js";
import { ZIP_LIMITS } from "../utils/safeZip.js";

const router = express.Router();

router.use(authenticateToken);
router.use(authorizeRole(["admin"]));
router.use(sanitizeRequestInputs);

function flag(value) {
  return value === "1" || value === "true" || value === "yes";
}

router.get("/", (req, res, next) => {
  try {
    const zip = exportDbAsZip(loadDB());
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="ecd-entities.zip"');
    res.send(zip);
  } catch (err) {
    next(err);
  }
});

router.post("/", authorizeRole(["admin"]), (req, res, next) => {
  express.raw({ type: () => true, limit: ZIP_LIMITS.maxBytes })(req, res, (err) => {
    if (err) {
      const tooLarge = err.type === "entity.too.large" || err.status === 413;
      if (tooLarge) {
        return res.status(413).json({ error: "Zip exceeds the size limit." });
      }
      return next(err);
    }

    try {
      const body = req.body;
      if (!body || !Buffer.isBuffer(body) || body.length === 0) {
        return res.status(400).json({ error: "Request body must be a zip archive." });
      }
      const dryRun = flag(req.query.dryRun);
      const keepOriginalIds = flag(req.query.keepOriginalIds);
      const loaded = loadDB();
      const db = dryRun ? structuredClone(loaded) : loaded;
      const report = importZipIntoDb(db, body, {
        user: req.user,
        keepOriginalIds,
      });
      if (!dryRun && report.totals.created > 0) saveDB(db);
      res.status(200).json({ dryRun, ...report });
    } catch (error) {
      if (error instanceof ZipError || error?.name === "ZipError") {
        return res.status(error.status || 400).json({ error: error.message });
      }
      return next(error);
    }
  });
});

export default router;
