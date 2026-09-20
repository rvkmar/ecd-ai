// server/cron/backupCron.js
//
// D107: daily encrypted full backup. Opt-in via ECD_BACKUP_ENABLED=1.
// Requires ECD_BACKUP_ENCRYPTION_KEY outside compose YAML.

import cron from "node-cron";
import { runFullBackup } from "../backup/runFullBackup.js";
import { logger } from "../utils/logger.js";

/**
 * @param {{ schedule?: string, run?: () => Promise<unknown> }} [options]
 */
export default function startBackupCron(options = {}) {
  const schedule =
    options.schedule || process.env.ECD_BACKUP_CRON || "20 2 * * *";
  const run = options.run || defaultTick;

  if (!cron.validate(schedule)) {
    console.error(`[backupCron] invalid schedule '${schedule}'; cron not started`);
    return null;
  }

  return cron.schedule(
    schedule,
    () => {
      Promise.resolve()
        .then(() => run())
        .catch((err) => {
          console.error("[backupCron] error:", err);
          try {
            logger.error("backup.failed", {
              error: err?.message || String(err),
            });
          } catch {
            // ignore
          }
        });
    },
    { timezone: "UTC" }
  );
}

async function defaultTick() {
  const result = await runFullBackup();
  if (!result.ok) {
    logger.error("backup.failed", { error: result.error });
    console.error("[backupCron]", result.error);
    return result;
  }
  logger.info("backup.completed", {
    path: result.path,
    byteLength: result.byteLength,
    retentionDeleted: result.retentionDeleted?.length ?? 0,
  });
  console.log(
    `[backupCron] wrote ${result.path} (${result.byteLength} bytes); pruned ${result.retentionDeleted.length}`
  );
  return result;
}
