// server/r/killRBackend.js
// D86: aborting the Node fetch does not stop a blocked Plumber handler.
// On timeout the R OS process (compose service) must be killed so the
// worker is reclaimed and the next queued job can start after restart.
//
// Strategies (first that works):
//   1. Injected killer (tests)
//   2. R_BACKEND_KILL_COMMAND — shell command, e.g. `docker kill r-backend`
//   3. docker kill ${R_BACKEND_CONTAINER || r-backend}

import { spawnSync } from "node:child_process";

function runKillCommand(command, args = []) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 15_000,
    windowsHide: true,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
    error: result.error ? String(result.error.message || result.error) : "",
  };
}

/**
 * Kill the R backend process so a timed-out job cannot hold the worker.
 * @param {{ reason?: string, kind?: string, jobId?: string, killer?: Function }} [options]
 */
export async function killRBackend(options = {}) {
  const reason = options.reason || "timeout";
  const meta = `reason=${reason} kind=${options.kind || "?"} jobId=${options.jobId || "?"}`;

  if (typeof options.killer === "function") {
    const detail = await options.killer({ reason, kind: options.kind, jobId: options.jobId });
    return { ok: true, method: "injected", detail: detail == null ? meta : String(detail) };
  }

  const custom = process.env.R_BACKEND_KILL_COMMAND;
  if (custom && String(custom).trim()) {
    // Prefer /bin/sh -c on Unix; on Windows cmd.exe /c.
    const isWin = process.platform === "win32";
    const shell = isWin ? "cmd.exe" : "/bin/sh";
    const shellArgs = isWin ? ["/c", custom] : ["-c", custom];
    const ran = runKillCommand(shell, shellArgs);
    return {
      ok: ran.ok,
      method: "R_BACKEND_KILL_COMMAND",
      detail: ran.ok
        ? `${meta}; ${ran.stdout || "ok"}`
        : `${meta}; exit=${ran.status} ${ran.stderr || ran.error || "kill failed"}`,
    };
  }

  const container = process.env.R_BACKEND_CONTAINER || "r-backend";
  const ran = runKillCommand("docker", ["kill", container]);
  if (ran.ok) {
    return {
      ok: true,
      method: "docker-kill",
      detail: `${meta}; container=${container} ${ran.stdout || "killed"}`,
    };
  }

  return {
    ok: false,
    method: "none",
    detail:
      `${meta}; no kill path succeeded (docker: ${ran.stderr || ran.error || "unavailable"}). ` +
      "Set R_BACKEND_KILL_COMMAND or R_BACKEND_CONTAINER.",
  };
}
