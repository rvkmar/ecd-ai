// server/r/rClient.js
// Node-side HTTP client for the private R Plumber service.
// Called only from the calibration job worker -- never from
// server/delivery or any /api/sessions handler (ADR 0001).

import { rPathForJobKind, unboxPlumberScalars } from "./calibrationContract.js";

const DEFAULT_R_BACKEND_URL = "http://r-backend:4000";
const DEFAULT_R_JOB_TIMEOUT_MS = 15 * 60 * 1000;

export function rBackendUrl() {
  return process.env.R_BACKEND_URL || DEFAULT_R_BACKEND_URL;
}

function authHeaders() {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  const token = process.env.R_SERVICE_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function rFetch(path, { method = "GET", body, timeoutMs = DEFAULT_R_JOB_TIMEOUT_MS } = {}) {
  const url = `${rBackendUrl().replace(/\/$/, "")}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: authHeaders(),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    if (text) {
      try {
        json = unboxPlumberScalars(JSON.parse(text));
      } catch {
        json = null;
      }
    }
    return { ok: res.ok, status: res.status, json, text };
  } catch (err) {
    const aborted = err?.name === "AbortError";
    return {
      ok: false,
      status: 0,
      json: null,
      text: "",
      error: {
        message: aborted
          ? `R request timed out after ${timeoutMs}ms`
          : (err?.message || "R request failed"),
        rClass: aborted ? "Timeout" : (err?.name || "FetchError"),
        stderr: err?.stack || "",
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function getRHealth(options = {}) {
  return rFetch("/health", { timeoutMs: options.timeoutMs || 10_000 });
}

export async function postCalibration(kind, request, options = {}) {
  const path = rPathForJobKind(kind);
  if (!path) {
    return {
      ok: false,
      status: 0,
      json: null,
      text: "",
      error: {
        message: `No R path for job kind '${kind}'`,
        rClass: "UnknownKind",
        stderr: "",
      },
    };
  }
  return rFetch(path, {
    method: "POST",
    body: request,
    timeoutMs: options.timeoutMs || DEFAULT_R_JOB_TIMEOUT_MS,
  });
}
