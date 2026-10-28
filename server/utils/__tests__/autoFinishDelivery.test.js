import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/utils/db-server.js", () => {
  const loadDB = vi.fn();
  return { loadDB, saveDB: vi.fn(), readRawDB: vi.fn(() => ({})) };
});

const { loadDB, saveDB } = await import("../../../src/utils/db-server.js");
const { autoFinishDueSessions } = await import("../autoFinish.js");

const past = new Date(Date.now() - 60_000).toISOString();
const future = new Date(Date.now() + 60 * 60_000).toISOString();

function clock(deadline, status = "in_progress") {
  return {
    timeLimitMinutes: 30,
    timeMultiplier: 1,
    extraTimeMinutes: 0,
    pausedMs: 0,
    clockStartedAt: new Date(Date.now() - 40 * 60_000).toISOString(),
    pauseStartedAt: null,
    effectiveDeadline: deadline,
  };
}

describe("autoFinishDueSessions delivery clock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("still closes an unstamped session from session.endTime", async () => {
    const db = {
      sessions: [{
        id: "legacy",
        status: "in_progress",
        isCompleted: false,
        endTime: past,
        taskIds: ["t1"],
        responses: [{ taskId: "t1" }],
      }],
      tasks: [],
    };
    loadDB.mockReturnValue(db);
    const changed = await autoFinishDueSessions();
    expect(changed).toEqual(["legacy"]);
    expect(db.sessions[0].status).toBe("submitted");
    expect(db.sessions[0].autoFinished).toBe(true);
    expect(db.sessions[0].responses[0].locked).toBe(true);
    expect(db.sessions[0].deliveryAdministration).toBeUndefined();
    expect(saveDB).toHaveBeenCalled();
  });

  it("still closes an unstamped session from the latest task endTime", async () => {
    const db = {
      sessions: [{
        id: "task-end",
        status: "in_progress",
        taskIds: ["t1"],
        responses: [],
      }],
      tasks: [{ id: "t1", endTime: past }],
    };
    loadDB.mockReturnValue(db);
    expect(await autoFinishDueSessions()).toEqual(["task-end"]);
    expect(db.sessions[0].autoFinished).toBe(true);
  });

  it("closes a running delivery clock that is past and ignores a later task endTime while the clock is running", async () => {
    const due = {
      id: "due",
      status: "in_progress",
      taskIds: ["t1"],
      responses: [{ taskId: "t1" }],
      deliveryAdministration: clock(past),
    };
    const held = {
      id: "held",
      status: "in_progress",
      taskIds: ["t1"],
      responses: [],
      deliveryAdministration: clock(future),
    };
    const db = {
      sessions: [due, held],
      tasks: [{ id: "t1", endTime: past }],
    };
    loadDB.mockReturnValue(db);
    expect(await autoFinishDueSessions()).toEqual(["due"]);
    expect(due.autoFinished).toBe(true);
    expect(due.deliveryAdministration.timeLimitReached).toBe(true);
    expect(held.autoFinished).toBeUndefined();
    expect(held.status).toBe("in_progress");
  });

  it("does not close a paused session, and does not use the delivery limit before the clock starts", async () => {
    const paused = {
      id: "paused",
      status: "paused",
      taskIds: ["t1"],
      responses: [],
      deliveryAdministration: {
        ...clock(past),
        pauseStartedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      },
    };
    const notStarted = {
      id: "ready",
      status: "in_progress",
      taskIds: ["t1"],
      responses: [],
      deliveryAdministration: {
        timeLimitMinutes: 30,
        timeMultiplier: 1,
        extraTimeMinutes: 0,
        pausedMs: 0,
        clockStartedAt: null,
        effectiveDeadline: null,
      },
    };
    const db = { sessions: [paused, notStarted], tasks: [{ id: "t1", endTime: future }] };
    loadDB.mockReturnValue(db);
    expect(await autoFinishDueSessions()).toEqual([]);
    expect(paused.status).toBe("paused");
    expect(notStarted.status).toBe("in_progress");
  });

  it("closes a not-yet-started stamp through the older task endTime", async () => {
    const db = {
      sessions: [{
        id: "both",
        status: "in_progress",
        taskIds: ["t1"],
        responses: [],
        deliveryAdministration: {
          timeLimitMinutes: 30,
          clockStartedAt: null,
          effectiveDeadline: null,
        },
      }],
      tasks: [{ id: "t1", endTime: past }],
    };
    loadDB.mockReturnValue(db);
    expect(await autoFinishDueSessions()).toEqual(["both"]);
    expect(db.sessions[0].autoFinished).toBe(true);
    expect(db.sessions[0].deliveryAdministration.timeLimitReached).toBeUndefined();
  });
});
