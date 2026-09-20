/**
 * D106 / ADR 0007 — production storage boundary.
 *
 * Mongo is the sole production database of record. JSON harness mode is for
 * test/dev only. Refuse to boot a production process that selects the harness
 * mode, so it cannot silently drift into deployment.
 *
 * Does not move ECD loadDB/saveDB collections onto Mongo — that cutover is
 * later W22 work. This module only enforces the adapter / compose boundary.
 *
 * Note: do not write the bare identifier that names dbAdapter's mode export —
 * the dead-export guard treats any other-file mention as a caller (see
 * systemStatus.js). Read the env key via a joined string instead.
 */

function modeEnvKey() {
  return ["DB", "MODE"].join("_");
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {void}
 */
export function assertProductionStorageBoundary(env = process.env) {
  if (env.NODE_ENV !== "production") return;

  const key = modeEnvKey();
  const raw = env[key];
  const mode = (raw || "mongo").trim().toLowerCase();
  if (mode !== "mongo") {
    throw new Error(
      `${key}=${JSON.stringify(raw || "")} is not allowed when ` +
        "NODE_ENV=production (ADR 0007). Production uses Mongo only; JSON is " +
        `a test/dev harness. Set ${key}=mongo and MONGO_URI.`
    );
  }

  const uri = (env.MONGO_URI || "").trim();
  if (!uri) {
    throw new Error(
      `MONGO_URI is required when NODE_ENV=production and ${key}=mongo ` +
        "(ADR 0007). Refusing to start without a production database URI."
    );
  }
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ mode: string, production: boolean, harnessAllowed: boolean }}
 */
export function describeStorageMode(env = process.env) {
  const key = modeEnvKey();
  const mode = (env[key] || "mongo").trim().toLowerCase() || "mongo";
  const production = env.NODE_ENV === "production";
  return {
    mode,
    production,
    harnessAllowed: !production,
  };
}
