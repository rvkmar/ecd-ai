import { describe, it, expect, vi, beforeEach } from "vitest";
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import request from "supertest";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// Native `node` cold-import of sessionRoutes.js (and, more lightly,
// sessionPlay.js) can exceed Vitest's default 5s testTimeout on WSL /
// memory-constrained hosts. Same 30s budget routeAuth.test.js documented
// for this router's cold import. execFileSync gets a matching timeout so
// a hung spawn fails instead of blocking the worker forever.
const NATIVE_ESM_LOAD_MS = 30_000;

vi.mock("../../utils/authMiddleware.js", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { username: "stud1", role: "student" };
    next();
  },
  authorizeRole: (roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.sendStatus(403);
    next();
  },
}));

vi.mock("../../../src/utils/db-server.js", () => ({
  loadDB: vi.fn(),
  saveDB: vi.fn(),
  finishSession: vi.fn(),
}));

const { loadDB } = await import("../../../src/utils/db-server.js");
const { default: router } = await import("../sessionRoutes.js");

const app = express();
app.use(express.json());
app.use("/api/sessions", router);

describe("GET /api/sessions/mine", () => {
  beforeEach(() => {
    loadDB.mockReturnValue({
      students: [{ id: "stu99", name: "stud1" }],
      sessions: [
        { id: "s-mine", studentId: "stu99", status: "in_progress", taskIds: ["t1"] },
        { id: "s-other", studentId: "stu-other", status: "in_progress", taskIds: ["t2"] },
        { id: "s-done", studentId: "stu99", status: "completed", taskIds: ["t1"] },
      ],
    });
  });

  it("returns live sessions assigned to the logged-in student, not everyone else's", async () => {
    const res = await request(app).get("/api/sessions/mine");
    expect(res.status).toBe(200);
    expect(res.body.map((s) => s.id)).toEqual(["s-mine"]);
  });

  it("returns closed sessions for the student when scope=history", async () => {
    const res = await request(app).get("/api/sessions/mine?scope=history");
    expect(res.status).toBe(200);
    expect(res.body.map((s) => s.id)).toEqual(["s-done"]);
  });

  it("returns an empty list, not 404 Session not found, when nothing is assigned", async () => {
    loadDB.mockReturnValue({ students: [], sessions: [] });
    const res = await request(app).get("/api/sessions/mine");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(res.body).not.toEqual(expect.objectContaining({ error: "Session not found" }));
  });

  it("does not fall back to every live session when identity matching finds none", async () => {
    loadDB.mockReturnValue({
      students: [],
      sessions: [
        { id: "s-other", studentId: "stu-other", status: "in_progress", taskIds: ["t1"] },
      ],
    });
    const res = await request(app).get("/api/sessions/mine");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("refuses GET /:id for another student's session", async () => {
    const res = await request(app).get("/api/sessions/s-other");
    expect(res.status).toBe(403);
  });

  it("omits other examinees from GET /", async () => {
    const res = await request(app).get("/api/sessions");
    expect(res.status).toBe(200);
    expect(res.body.map((s) => s.id)).toEqual(["s-mine", "s-done"]);
  });

  it("matches a session assigned by typed username in studentIds", async () => {
    loadDB.mockReturnValue({
      students: [],
      sessions: [
        {
          id: "s-typed",
          studentId: "stud1",
          studentIds: ["stud1"],
          status: "ready",
          taskIds: ["t1"],
        },
      ],
    });
    const res = await request(app).get("/api/sessions/mine");
    expect(res.status).toBe(200);
    expect(res.body.map((s) => s.id)).toEqual(["s-typed"]);
  });
});

describe("GET /api/sessions/:id never 404s reserved collection names", () => {
  it("returns [] for id=mine instead of Session not found", async () => {
    loadDB.mockReturnValue({ sessions: [] });
    const res = await request(app).get("/api/sessions/mine");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(JSON.stringify(res.body)).not.toMatch(/Session not found/);
  });
});

describe("POST /api/sessions/:id/play", () => {
  it("persists ready → in_progress", async () => {
    const session = { id: "s-ready", status: "ready", studentId: "stud1", taskIds: ["t1"] };
    const db = { sessions: [session], policies: [{ id: "p1", type: "fixed" }] };
    loadDB.mockReturnValue(db);
    const res = await request(app).post("/api/sessions/s-ready/play");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("in_progress");
    expect(db.sessions[0].status).toBe("in_progress");
  });
});

describe("POST /api/sessions assignment", () => {
  function dbWithPolicy() {
    return {
      sessions: [],
      students: [
        { id: "stu1", name: "Pat", classId: "6A" },
        { id: "stu2", name: "Sam", classId: "6A" },
      ],
      tasks: [{ id: "t1" }],
      policies: [{ id: "p-fixed", type: "fixed" }],
    };
  }

  it("creates one ready session per cohort member so /mine can find them", async () => {
    const db = dbWithPolicy();
    loadDB.mockReturnValue(db);
    const res = await request(app)
      .post("/api/sessions")
      .send({ taskIds: ["t1"], cohortId: "6A", selectionStrategy: "fixed" });
    expect(res.status).toBe(201);
    expect(res.body.sessions).toHaveLength(2);
    expect(res.body.sessions.every((s) => s.status === "ready")).toBe(true);
    expect(res.body.sessions.map((s) => s.studentId).sort()).toEqual(["stu1", "stu2"]);
    expect(db.sessions).toHaveLength(2);
  });

  it("accepts a typed student ID when the students collection is empty", async () => {
    const db = { sessions: [], students: [], tasks: [{ id: "t1" }], policies: [{ id: "p-fixed", type: "fixed" }] };
    loadDB.mockReturnValue(db);
    const res = await request(app)
      .post("/api/sessions")
      .send({ taskIds: ["t1"], studentId: "stud1", selectionStrategy: "fixed" });
    expect(res.status).toBe(201);
    expect(res.body.studentId).toBe("stud1");
    expect(res.body.studentIds).toEqual(["stud1"]);
    expect(res.body.status).toBe("ready");
  });
});

describe("GET /api/sessions/mine is loadable by native Node ESM", () => {
  it("sessionPlay.js resolves under node, not only Vite/Vitest", () => {
    // The D60 leftover: sessionPlay.js imported ./sessionStatus without .js.
    // Vitest still loaded GET /mine; `node server/index.js` did not, so the
    // student list hit GET /:id and returned 404 Session not found.
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        "import { attendableSessionsForStudent } from './src/utils/sessionPlay.js'; if (typeof attendableSessionsForStudent !== 'function') process.exit(2);",
      ],
      { cwd: REPO_ROOT, encoding: "utf8", timeout: NATIVE_ESM_LOAD_MS, env: process.env }
    );
  }, NATIVE_ESM_LOAD_MS);

  it("sessionRoutes.js loads under node so /mine can register before /:id", () => {
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        "import r from './server/routes/sessionRoutes.js'; if (!r) process.exit(2);",
      ],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: NATIVE_ESM_LOAD_MS,
        env: {
          ...process.env,
          JWT_SECRET:
            process.env.JWT_SECRET ||
            "test-only-secret-do-not-use-outside-automated-tests-please-thanks",
        },
      }
    );
  }, NATIVE_ESM_LOAD_MS);
});
