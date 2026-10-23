// src/api/__tests__/apiClient.test.js
//
// Locks in apiFetch()'s current contract. This matters specifically because
// Phase 2 (consolidating the ~35 raw fetch() call sites) is expected to
// build on or replace this function — these tests are the safety net that
// says "the contract didn't silently change" while that refactor happens.
//
// 2026-08-21: the safety net had a hole. Commit 2c22921 changed apiFetch's
// success path from `res.json()` to read-as-text-then-parse, so that a 204
// (every DELETE route in this API) stops rejecting a delete that actually
// succeeded. The mocks here still stubbed only `json`, so `res.text is not
// a function` — the tests were failing against correct source. Mocks now
// stub `text`, and the 204 / empty-body / non-JSON paths that the fix
// introduced are covered, since none of them were.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiFetch } from "../apiClient.js";

/** A fetch Response stub shaped the way apiFetch actually consumes one. */
const okResponse = (body) => ({
  ok: true,
  status: 200,
  text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
});

describe("apiFetch", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it("adds a Bearer Authorization header when auth.token is provided", async () => {
    global.fetch.mockResolvedValue(okResponse({ hello: "world" }));

    const result = await apiFetch("/api/x", {}, { token: "tok123" });

    expect(result).toEqual({ hello: "world" });
    const [, init] = global.fetch.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer tok123");
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("omits the Authorization header when no auth is provided", async () => {
    global.fetch.mockResolvedValue(okResponse({}));

    await apiFetch("/api/x");

    const [, init] = global.fetch.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("throws with the status and response body text when the request fails", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "Forbidden",
    });

    await expect(apiFetch("/api/x")).rejects.toThrow("403: Forbidden");
  });

  it("attaches the parsed error body to the thrown Error", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify({ error: "Model is locked." }),
    });

    await expect(apiFetch("/api/x")).rejects.toMatchObject({
      status: 409,
      body: { error: "Model is locked." },
    });
  });

  it("leaves .body null when the error response is not JSON", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "<html>gateway blew up</html>",
    });

    await expect(apiFetch("/api/x")).rejects.toMatchObject({ body: null });
  });

  it("preserves caller-supplied options like method and body", async () => {
    global.fetch.mockResolvedValue(okResponse({}));

    await apiFetch("/api/x", { method: "POST", body: JSON.stringify({ a: 1 }) }, { token: "t" });

    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/x");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });

  /* =====================================================
     EMPTY-BODY SUCCESS PATHS
     The reason apiFetch stopped calling res.json(): every DELETE
     route responds 204 with no body, and res.json() throws on an
     empty body -- which rejected a delete that had already
     succeeded, so the row stayed on screen until a manual refresh.
  ===================================================== */

  it("returns null for a 204 without reading the body", async () => {
    const text = vi.fn();
    global.fetch.mockResolvedValue({ ok: true, status: 204, text });

    await expect(apiFetch("/api/x", { method: "DELETE" })).resolves.toBeNull();
    expect(text).not.toHaveBeenCalled();
  });

  it("returns null for a 200 with an empty body", async () => {
    global.fetch.mockResolvedValue(okResponse(""));

    await expect(apiFetch("/api/x")).resolves.toBeNull();
  });

  it("returns null rather than throwing when a success body is not JSON", async () => {
    global.fetch.mockResolvedValue(okResponse("OK"));

    await expect(apiFetch("/api/x")).resolves.toBeNull();
  });

  it("sends a raw body with the caller's content type", async () => {
    global.fetch.mockResolvedValue(okResponse({ created: 1 }));
    const body = new Uint8Array([1, 2, 3]);

    await apiFetch(
      "/api/data/zip",
      { method: "POST", rawBody: true, headers: { "Content-Type": "application/zip" }, body },
      { token: "t" }
    );

    const [, init] = global.fetch.mock.calls[0];
    expect(init.body).toBe(body);
    expect(init.headers["Content-Type"]).toBe("application/zip");
    expect(init.headers.Authorization).toBe("Bearer t");
    expect(init.rawBody).toBeUndefined();
  });

  it("returns a blob when responseType is blob", async () => {
    const blob = new Blob(["zip"]);
    global.fetch.mockResolvedValue({ ok: true, status: 200, blob: async () => blob });

    await expect(apiFetch("/api/data/zip", { responseType: "blob" })).resolves.toBe(blob);
    const [, init] = global.fetch.mock.calls[0];
    expect(init.responseType).toBeUndefined();
  });
});
