// Ensure validityEvidence exists and link stored TU4 fit results.
// One internal-structure row per analysis artefact, calibration job,
// or parameter set. A second run does not insert another row.
//
// Dry run writes nothing and does not copy a backup.
// A real run that changes the ECD file copies
// backups/db.json.pre-validity-evidence (and a db.json.<timestamp>
// crash copy) first.
//
// On a mongo validity-evidence backend the same run ensures the
// evidenceModelId + type index and the partial unique
// analysisArtefactId index. Dry run only reports that.
//
// Rollback: stop node. Copy backups/db.json.pre-validity-evidence
// over the ECD db file. Drop the Mongo validityEvidence collection
// if this run created it. Start the previous build. Linked rows are
// additive. The evidence models and analysis artefacts are unchanged.

import fs from "fs";
import path from "path";
import { backupDirPath, forgetDbCache, saveDB } from "../../../src/utils/db-server.js";
import { resolveValidityEvidenceBackend } from "../../validityEvidence/validityEvidenceBackend.js";
import { ensureValidityEvidenceIndexes } from "../../validityEvidence/mongoValidityEvidenceAdapter.js";
import {
  linkTu4FitEvidence,
  tu4LinkInputFromArtefact,
  tu4LinkInputFromParameterSet,
} from "../../validityEvidence/linkTu4Fit.js";
import { queryAnalysisArtefacts } from "../../analysisArtefacts/analysisArtefactRepository.js";
import { mongoReplaceValidityEvidence } from "../../validityEvidence/mongoValidityEvidenceAdapter.js";

function dbFilePath() {
  return process.env.ECD_DB_FILE || path.join(process.cwd(), "db.json");
}

function readFileDb(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function stamp(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function writePreMigrationCopy(file, now) {
  const dir = backupDirPath();
  fs.mkdirSync(dir, { recursive: true });
  const stamped = path.join(dir, `db.json.${stamp(now)}`);
  const stable = path.join(dir, "db.json.pre-validity-evidence");
  fs.copyFileSync(file, stamped);
  fs.copyFileSync(file, stable);
  return { stamped, stable };
}

function linkAll(db) {
  const created = [];
  const updated = [];
  for (const artefact of db.analysisArtefacts || []) {
    const input = tu4LinkInputFromArtefact(artefact);
    if (!input) continue;
    const result = linkTu4FitEvidence(db, input);
    if (result.created) created.push(result.record.id);
    else if (result.updated) updated.push(result.record.id);
  }
  for (const model of db.evidenceModels || []) {
    for (const statisticalModel of model.statisticalModels || []) {
      for (const parameterSet of statisticalModel.parameterSets || []) {
        const input = tu4LinkInputFromParameterSet(model.id, parameterSet);
        if (!input) continue;
        const result = linkTu4FitEvidence(db, input);
        if (result.created) created.push(result.record.id);
        else if (result.updated) updated.push(result.record.id);
      }
    }
  }
  return { created, updated };
}

export default {
  id: "016-validity-evidence",
  description:
    "Add validityEvidence and link stored TU4 fit results once per analysis artefact.",
  forwardOnly: false,
  rollback:
    "Stop node. Copy backups/db.json.pre-validity-evidence over the ECD db file. Drop the Mongo validityEvidence collection if this run created it. Evidence models and analysis artefacts are unchanged.",

  async run({ dryRun }) {
    const backend = resolveValidityEvidenceBackend();
    const file = dbFilePath();
    const onDisk = readFileDb(file);
    const indexNote =
      backend === "mongo"
        ? dryRun
          ? "Would ensure indexes on evidenceModelId + type and a partial unique analysisArtefactId."
          : "Ensured indexes on evidenceModelId + type and a partial unique analysisArtefactId."
        : "JSON harness: the mongo index is not created. A mongo backend creates evidenceModelId + type and a partial unique analysisArtefactId.";

    if (!onDisk) {
      if (!dryRun && backend === "mongo") await ensureValidityEvidenceIndexes();
      return {
        changed: [],
        summary: `No ECD file at ${file}. ${indexNote}`,
      };
    }

    const working = dryRun ? structuredClone(onDisk) : onDisk;
    const missingKey = !Array.isArray(working.validityEvidence);
    if (missingKey) working.validityEvidence = [];

    let artefacts = Array.isArray(working.analysisArtefacts) ? working.analysisArtefacts : [];
    if (backend !== "json") {
      try {
        const stored = await queryAnalysisArtefacts(working, { unscoped: true });
        if (Array.isArray(stored) && stored.length) artefacts = stored;
      } catch {
        artefacts = Array.isArray(working.analysisArtefacts) ? working.analysisArtefacts : [];
      }
    }
    working.analysisArtefacts = artefacts;

    const { created, updated } = linkAll(working);
    const changed = [...created];
    const keyNote = missingKey
      ? `${dryRun ? "Would add" : "Added"} validityEvidence.`
      : "validityEvidence already present.";
    const linkNote = created.length
      ? `${dryRun ? "Would link" : "Linked"} ${created.length} TU4 fit result${created.length === 1 ? "" : "s"}.`
      : "No new TU4 links.";
    const updateNote = updated.length ? ` Filled artefact id on ${updated.length} existing row${updated.length === 1 ? "" : "s"}.` : "";
    const summary = `${keyNote} ${linkNote}${updateNote} ${indexNote}`;

    if (dryRun || (!missingKey && created.length === 0 && updated.length === 0)) {
      if (!dryRun && backend === "mongo") await ensureValidityEvidenceIndexes();
      return { changed, summary };
    }

    const copies = writePreMigrationCopy(file, new Date());
    if (backend === "json") {
      forgetDbCache();
      await saveDB(working, { skipAudit: true });
    } else {
      const next = { ...onDisk };
      if (!Array.isArray(next.validityEvidence)) next.validityEvidence = [];
      if (backend === "memory") {
        next.validityEvidence = working.validityEvidence;
      }
      forgetDbCache();
      await saveDB(next, { skipAudit: true });
      if (backend === "mongo") {
        for (const id of created) {
          const row = working.validityEvidence.find((item) => item && item.id === id);
          if (row) await mongoReplaceValidityEvidence(row);
        }
        for (const id of updated) {
          const row = working.validityEvidence.find((item) => item && item.id === id);
          if (row) await mongoReplaceValidityEvidence(row);
        }
        await ensureValidityEvidenceIndexes();
      }
    }

    return {
      changed,
      summary: `${summary} Backup: ${copies.stable}`,
    };
  },
};
