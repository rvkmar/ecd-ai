import { describe, it, expect } from "vitest";
import { syncTaskModelItemMappings } from "../syncTaskModelItemMappings.js";

function makeTm(overrides = {}) {
  return {
    id: "tm1",
    versionNumber: 1,
    locked: true,
    status: "operational",
    expectedObservations: [
      { observationId: "o1", evidenceModelId: "em1", required: true, weight: 1 },
    ],
    itemMappings: [],
    selectedItemIds: [],
    ...overrides,
  };
}

describe("syncTaskModelItemMappings", () => {
  it("writes confirmed items on this Task Model version", () => {
    const tm = makeTm();
    const db = {
      taskModels: [tm],
      items: [
        {
          id: "it1",
          taskModelId: "tm1",
          taskModelVersion: 1,
          observationId: "o1",
          evidenceModelId: "em1",
          status: "confirmed",
        },
      ],
    };

    syncTaskModelItemMappings(db, "tm1");

    expect(tm.itemMappings).toEqual([
      { itemId: "it1", observationId: "o1", evidenceModelId: "em1" },
    ]);
    expect(tm.selectedItemIds).toEqual(["it1"]);
  });

  it("omits drafts, other Task Models, and other versions", () => {
    const tm = makeTm({
      itemMappings: [{ itemId: "stale", observationId: "o1", evidenceModelId: "em1" }],
      selectedItemIds: ["stale"],
    });
    const db = {
      taskModels: [tm],
      items: [
        {
          id: "draft",
          taskModelId: "tm1",
          taskModelVersion: 1,
          observationId: "o1",
          status: "draft",
        },
        {
          id: "other-tm",
          taskModelId: "tm2",
          taskModelVersion: 1,
          observationId: "o1",
          status: "confirmed",
        },
        {
          id: "other-ver",
          taskModelId: "tm1",
          taskModelVersion: 2,
          observationId: "o1",
          status: "confirmed",
        },
      ],
    };

    syncTaskModelItemMappings(db, "tm1");

    expect(tm.itemMappings).toEqual([]);
    expect(tm.selectedItemIds).toEqual([]);
  });

  it("replaces authored mappings on a locked Task Model", () => {
    const tm = makeTm({
      itemMappings: [{ itemId: "stale", observationId: "o1", evidenceModelId: "em1" }],
      selectedItemIds: ["stale"],
    });
    const db = {
      taskModels: [tm],
      items: [
        {
          id: "it1",
          taskModelId: "tm1",
          taskModelVersion: 1,
          observationId: "o1",
          evidenceModelId: "em1",
          status: "confirmed",
        },
      ],
    };

    syncTaskModelItemMappings(db, "tm1");

    expect(tm.itemMappings).toEqual([
      { itemId: "it1", observationId: "o1", evidenceModelId: "em1" },
    ]);
  });
});
