// Node client for POST /calibrate/lltm. Not a calibration-queue kind:
// the template route calls this directly. A timeout kills the R process
// the same way a hung calibration job does, because plumber is one worker.

import { postRPath } from "./rClient.js";

export async function postLltm(body, options = {}) {
  const result = await postRPath("/calibrate/lltm", body, options);
  if (!result.ok) {
    const message =
      result.json?.error?.message ||
      result.error?.message ||
      `R LLTM request failed (${result.status || 0})`;
    return {
      ok: false,
      status: result.status || 502,
      error: message,
    };
  }
  return { ok: true, result: result.json };
}
