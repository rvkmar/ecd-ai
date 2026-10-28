import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import fs from "fs";
import os from "os";
import path from "path";
import { CATALOG_LIST_PROJECTION, RATING_QUEUE_PROJECTION } from "../sessionListProjection.js";
import { EVALUATION_STATUS } from "../../delivery/evaluationPhases.js";

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = {
      id: "admin1",
      role: req.headers["x-role"] || "admin",
      username: "admin1",
    };
    next();
  },
  authorizeRole: (roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.sendStatus(403);
    next();
  },
}));

vi.mock("../mongoSessionStore.js", async () => {
  const actual = await vi.importActual("../mongoSessionStore.js");
  return {
    ...actual,
    mongoFind: vi.fn(async () => []),
  };
});

const { mongoFind } = await import("../mongoSessionStore.js");
const { querySessions, resetSessionStoreForTests } = await import("../sessionRepository.js");
const { default: sessionRouter } = await import("../../routes/sessionRoutes.js");
const { forgetDbCache } = await import("../../../src/utils/db-server.js");

const app = express();
app.use(express.json());
app.use("/api/sessions", sessionRouter);

let tmp;
let previousBackend;
let previousFile;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-list-proj-"));
  previousBackend = process.env.SESSIONS_BACKEND;
  previousFile = process.env.ECD_DB_FILE;
  process.env.SESSIONS_BACKEND = "mongo";
  process.env.ECD_DB_FILE = path.join(tmp, "db.json");
  fs.writeFileSync(process.env.ECD_DB_FILE, JSON.stringify({ sessions: [], students: [], users: [] }));
  forgetDbCache();
  resetSessionStoreForTests();
  mongoFind.mockClear();
  mongoFind.mockResolvedValue([]);
});

afterEach(() => {
  resetSessionStoreForTests();
  forgetDbCache();
  if (previousBackend === undefined) delete process.env.SESSIONS_BACKEND;
  else process.env.SESSIONS_BACKEND = previousBackend;
  if (previousFile === undefined) delete process.env.ECD_DB_FILE;
  else process.env.ECD_DB_FILE = previousFile;
  fs.rmSync(tmp, { recursive: true, force: true });
});

function projectionOf(call) {
  return call[1]?.projection;
}

describe("list routes call Mongo with a projection", () => {
  it("uses the catalog projection for /, /active, /archived, and /mine", async () => {
    expect((await request(app).get("/api/sessions")).status).toBe(200);
    expect((await request(app).get("/api/sessions/active")).status).toBe(200);
    expect((await request(app).get("/api/sessions/archived")).status).toBe(200);
    expect((await request(app).get("/api/sessions/mine").set("x-role", "teacher")).status).toBe(200);

    const projections = mongoFind.mock.calls.map(projectionOf);
    expect(projections).toHaveLength(4);
    for (const projection of projections) {
      expect(projection).toEqual(CATALOG_LIST_PROJECTION);
      expect(projection.responses).toBe(1);
      expect(projection.studentModel).toBe(1);
      expect(projection.studentId).toBe(1);
      expect(projection.studentIds).toBe(1);
    }
    expect(mongoFind.mock.calls[1][0]).toEqual({ status: { $ne: "archived" } });
    expect(mongoFind.mock.calls[2][0]).toEqual({ status: "archived" });
    expect(mongoFind.mock.calls[0][0]).toEqual({});
    expect(mongoFind.mock.calls[3][0]).toEqual({});
  });

  it("uses the rating-queue projection and does not load studentModel", async () => {
    const res = await request(app).get("/api/sessions/rating-queue").set("x-role", "teacher");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
    expect(mongoFind).toHaveBeenCalledTimes(1);
    const [filter, options] = mongoFind.mock.calls[0];
    expect(filter).toEqual({
      "responses.evaluationStatus": {
        $in: [EVALUATION_STATUS.PENDING_HUMAN, EVALUATION_STATUS.PENDING_ADJUDICATION],
      },
    });
    expect(options.projection).toEqual(RATING_QUEUE_PROJECTION);
    expect(options.projection.studentModel).toBeUndefined();
    expect(options.projection.responses).toBeUndefined();
    expect(options.projection["responses.rawAnswer"]).toBe(1);
    expect(options.projection["responses.evaluationStatus"]).toBe(1);
    expect(options.projection.studentId).toBe(1);
    expect(options.projection.studentIds).toBe(1);
  });

  it("leaves non-list queries unprojected", async () => {
    await querySessions({ students: [], users: [] }, { closed: true });
    expect(mongoFind).toHaveBeenCalledTimes(1);
    expect(mongoFind.mock.calls[0][1]).toBeUndefined();
  });
});
