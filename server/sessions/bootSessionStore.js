import { resolveSessionsBackend, sessionsUseExternalStore } from "./sessionBackend.js";
import { migrateFileSessions } from "../migrations/migrations/011-sessions-to-mongo.js";
import { ensureSessionCache } from "./sessionRepository.js";
import { ensureSessionIndexes } from "./mongoSessionStore.js";

export async function bootSessionStore() {
  if (!sessionsUseExternalStore()) {
    return { skipped: true, reason: "json harness" };
  }
  const migration = await migrateFileSessions({ dryRun: false });
  if (resolveSessionsBackend() === "mongo") {
    await ensureSessionIndexes();
  }
  await ensureSessionCache();
  return migration;
}
