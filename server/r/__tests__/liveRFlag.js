// Resolve whether live R pipeline describes should run.
//
// CI `lsat7-pipeline` sets R_BACKEND_URL. Local `npm test` often does
// not, even when compose publishes plumber on :4000 — those describes
// then skip. Probe 127.0.0.1:4000 when the env is unset (or still the
// docker hostname) so a running r-backend is used.
//
// Live jobs share one R worker. Lock across vitest files so parallel
// workers cannot overlap mirt/TAM/GDINA/difR/plink runs.

import fs from "fs";
import os from "os";
import path from "path";

const LOCAL_R = "http://127.0.0.1:4000";
const LOCK_PATH = path.join(os.tmpdir(), "ecd-live-r.lock");
const LOCK_STALE_MS = 200_000;

async function healthy(url) {
  try {
    const res = await fetch(`${String(url).replace(/\/$/, "")}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return false;
    const json = await res.json();
    return json?.status === "healthy";
  } catch {
    return false;
  }
}

async function resolveLiveRUrl() {
  const raw = String(process.env.R_BACKEND_URL || "").trim();
  const dockerHost = /r-backend/i.test(raw);

  if (raw && !dockerHost) return raw;

  if (await healthy(LOCAL_R)) {
    process.env.R_BACKEND_URL = LOCAL_R;
    return LOCAL_R;
  }

  return raw;
}

export const LIVE_R_URL = await resolveLiveRUrl();
export const liveR = Boolean(LIVE_R_URL);

function lockIsStale() {
  try {
    return Date.now() - fs.statSync(LOCK_PATH).mtimeMs > LOCK_STALE_MS;
  } catch {
    return true;
  }
}

export async function acquireLiveR() {
  const start = Date.now();
  while (true) {
    try {
      fs.writeFileSync(LOCK_PATH, String(process.pid), { flag: "wx" });
      return;
    } catch {
      if (lockIsStale()) {
        try {
          fs.unlinkSync(LOCK_PATH);
        } catch {
          /* raced */
        }
        continue;
      }
      if (Date.now() - start > 12 * 60 * 1000) {
        throw new Error("Timed out waiting for the live R lock");
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

export function releaseLiveR() {
  try {
    fs.unlinkSync(LOCK_PATH);
  } catch {
    /* already released */
  }
}
