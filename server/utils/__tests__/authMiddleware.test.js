// server/utils/__tests__/authMiddleware.test.js
//
// Unit tests for the two building blocks every protected route relies on.
// These are deliberately isolated from Express/supertest — plain function
// calls against hand-built req/res/next stand-ins — so they stay fast and
// pinpoint exactly which piece broke if something regresses.

import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { authenticateToken, authorizeRole } from "../authMiddleware.js";
import { JWT_SECRET } from "../../config/jwt.js";
import {
  setCachedAuthEpoch,
  _resetTokenServiceForTests,
} from "../tokenService.js";

function mockReqRes(headers = {}) {
  const req = { headers };
  const res = {
    statusCode: null,
    sendStatus(code) {
      this.statusCode = code;
      return this;
    },
  };
  const next = vi.fn();
  return { req, res, next };
}

describe("authenticateToken", () => {
  beforeEach(() => {
    _resetTokenServiceForTests();
    setCachedAuthEpoch("teach1", 0);
    setCachedAuthEpoch("eve", 0);
  });

  it("rejects a request with no Authorization header (401)", () => {
    const { req, res, next } = mockReqRes();
    authenticateToken(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a malformed token (403)", async () => {
    const { req, res, next } = mockReqRes({ authorization: "Bearer not-a-real-token" });
    authenticateToken(req, res, next);
    await vi.waitFor(() => expect(res.statusCode).toBe(403));
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a token signed with a different secret (403)", async () => {
    const badToken = jwt.sign(
      { username: "eve", role: "admin", ae: 0 },
      "a-completely-different-secret"
    );
    const { req, res, next } = mockReqRes({ authorization: `Bearer ${badToken}` });
    authenticateToken(req, res, next);
    await vi.waitFor(() => expect(res.statusCode).toBe(403));
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an expired token (403)", async () => {
    const expiredToken = jwt.sign(
      { username: "teach1", role: "teacher", ae: 0 },
      JWT_SECRET,
      { expiresIn: -10 }
    );
    const { req, res, next } = mockReqRes({ authorization: `Bearer ${expiredToken}` });
    authenticateToken(req, res, next);
    await vi.waitFor(() => expect(res.statusCode).toBe(403));
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts a validly signed, unexpired token and attaches req.user", async () => {
    const token = jwt.sign(
      { username: "teach1", role: "teacher", ae: 0 },
      JWT_SECRET,
      { expiresIn: "1h" }
    );
    const { req, res, next } = mockReqRes({ authorization: `Bearer ${token}` });
    authenticateToken(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1));
    expect(req.user.username).toBe("teach1");
    expect(req.user.role).toBe("teacher");
  });

  it("rejects a token whose authEpoch no longer matches (403)", async () => {
    const token = jwt.sign(
      { username: "teach1", role: "teacher", ae: 0 },
      JWT_SECRET,
      { expiresIn: "1h" }
    );
    setCachedAuthEpoch("teach1", 1);
    const { req, res, next } = mockReqRes({ authorization: `Bearer ${token}` });
    authenticateToken(req, res, next);
    await vi.waitFor(() => expect(res.statusCode).toBe(403));
    expect(next).not.toHaveBeenCalled();
  });
});

describe("authorizeRole", () => {
  it("blocks when req.user was never set (i.e. authenticateToken didn't run first)", () => {
    const { req, res, next } = mockReqRes();
    authorizeRole(["admin"])(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("blocks a role that isn't in the allowed list", () => {
    const { req, res, next } = mockReqRes();
    req.user = { username: "stud1", role: "student" };
    authorizeRole(["admin", "district"])(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows a role that is in the allowed list", () => {
    const { req, res, next } = mockReqRes();
    req.user = { username: "admin1", role: "admin" };
    authorizeRole(["admin"])(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeNull();
  });
});
