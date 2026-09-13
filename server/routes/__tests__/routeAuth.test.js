// @vitest-environment node
// server/routes/__tests__/routeAuth.test.js
//
// This is the single most important test file from the Phase 1 security
// pass: it asserts that every route file which previously had ZERO
// authentication now rejects a request with no token. If a future change
// (Phase 2's data-layer consolidation, or anything else) accidentally
// removes or reorders the `router.use(authenticateToken)` line added to
// each of these files, this test fails immediately instead of the gap
// being rediscovered by re-auditing the whole codebase again.
//
// Each router's own business logic (schema validation, lifecycle rules,
// etc.) is NOT exercised here — only the auth boundary. That's deliberate:
// this file's only job is "does a request with no token get rejected
// before it reaches any route handler."

import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";

// Static top-level imports on purpose. Under a WSL full-suite run that
// creates jsdom 61 times, a mid-suite cold dynamic import of reportsRoutes
// alone can exceed a 30s beforeAll hookTimeout even after caching one
// importer() per describe. Loading every protected router here moves that
// cost to file evaluation — once, before any hook clock starts — so this
// file stays a static auth-boundary check. hookTimeout does not apply to
// module evaluation; if a worker ever looks hung it is collection-time
// load under contention, not a failed 401/403 assertion. Do not swap
// these back to importer() / beforeAll, and do not "fix" a slow collect
// by bumping hookTimeout alone.
import sessionRoutes from "../sessionRoutes.js";
import itemsRoutes from "../itemsRoutes.js";
import itemAnalyticsRoutes from "../itemAnalyticsRoutes.js";
import competencyModels from "../competencyModels.js";
import evidenceModels from "../evidenceModels.js";
import tasksRoutes from "../tasksRoutes.js";
import taskModelsRoutes from "../taskModelsRoutes.js";
import reportsRoutes from "../reportsRoutes.js";
import studentsRoutes from "../studentsRoutes.js";
import policiesRoutes from "../policiesRoutes.js";
import calibrationRoutes from "../calibrationRoutes.js";
import calibrationJobsRoutes from "../calibrationJobsRoutes.js";
import qMatrixModelsRoutes from "../qMatrixModelsRoutes.js";
import assemblyModelsRoutes from "../assemblyModelsRoutes.js";
import compositeLibraryRoutes from "../compositeLibraryRoutes.js";

// One router per previously-unauthenticated route file, plus the base path
// it's normally mounted at in server/index.js (used only for a readable
// test name — supertest hits the router directly, mount path doesn't
// matter for the assertion itself).
const PROTECTED_ROUTERS = [
  { name: "sessionRoutes", path: "/api/sessions", router: sessionRoutes },
  { name: "itemsRoutes", path: "/api/items", router: itemsRoutes },
  { name: "itemAnalyticsRoutes", path: "/api/itemAnalytics", router: itemAnalyticsRoutes },
  { name: "competencyModels", path: "/api/competencies", router: competencyModels },
  { name: "evidenceModels", path: "/api/evidenceModels", router: evidenceModels },
  { name: "tasksRoutes", path: "/api/tasks", router: tasksRoutes },
  { name: "taskModelsRoutes", path: "/api/taskModels", router: taskModelsRoutes },
  { name: "reportsRoutes", path: "/api/reports", router: reportsRoutes },
  { name: "studentsRoutes", path: "/api/students", router: studentsRoutes },
  { name: "policiesRoutes", path: "/api/policies", router: policiesRoutes },
  { name: "calibrationRoutes", path: "/api/calibrate", router: calibrationRoutes },
  { name: "calibrationJobsRoutes", path: "/api/calibrationJobs", router: calibrationJobsRoutes },
  // D48: the three collections that had schema and lifecycle validation
  // but no HTTP surface at all. They join this list on the day their
  // routers are created, so the gate can never be removed silently.
  { name: "qMatrixModelsRoutes", path: "/api/qMatrixModels", router: qMatrixModelsRoutes },
  { name: "assemblyModelsRoutes", path: "/api/assemblyModels", router: assemblyModelsRoutes },
  { name: "compositeLibraryRoutes", path: "/api/compositeLibrary", router: compositeLibraryRoutes },
];

describe.each(PROTECTED_ROUTERS)(
  "$name requires authentication",
  ({ path, router }) => {
    it("rejects GET / with no Authorization header (401)", async () => {
      const app = express();
      app.use(express.json());
      app.use(path, router);

      const res = await request(app).get(path + "/");
      expect(res.status).toBe(401);
    });

    it("rejects a request with a garbage Authorization header (403)", async () => {
      const app = express();
      app.use(express.json());
      app.use(path, router);

      const res = await request(app)
        .get(path + "/")
        .set("Authorization", "Bearer this-is-not-a-real-token");
      expect(res.status).toBe(403);
    });
  }
);
