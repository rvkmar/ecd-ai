import { describe, it, expect, vi, beforeEach } from "vitest";

const dbState = { current: {} };

vi.mock("../../../src/utils/db-server.js", () => ({
  readRawDB: () => dbState.current,
  saveDB: (next) => {
    dbState.current = next;
  },
  loadDB: () => dbState.current,
}));

import migration from "../migrations/009-domain-analysis-entry-ids.js";

describe("009 domain analysis entry ids", () => {
  beforeEach(() => {
    dbState.current = {
      domainAnalyses: [
        {
          id: "da-plant",
          name: "Plant structure",
          valuedKnowledge: [{ label: "Leaf, root, stem, and flower" }],
          taskFeatures: [{ id: "tf-plant", label: "A labelled diagram" }],
          valuedWork: [{ label: "Name a plant part" }],
        },
      ],
    };
  });

  it("assigns missing ids on a real run and leaves an existing id alone", async () => {
    const result = await migration.run({ dryRun: false });
    expect(result.changed).toEqual(["da-plant"]);
    const analysis = dbState.current.domainAnalyses[0];
    expect(analysis.valuedKnowledge[0].id).toMatch(/^vk/);
    expect(analysis.valuedKnowledge[0].label).toBe("Leaf, root, stem, and flower");
    expect(analysis.taskFeatures[0].id).toBe("tf-plant");
    expect(analysis.valuedWork[0].id).toBeUndefined();

    const again = await migration.run({ dryRun: false });
    expect(again.changed).toEqual([]);
    expect(dbState.current.domainAnalyses[0].valuedKnowledge[0].id).toBe(
      analysis.valuedKnowledge[0].id
    );
  });

  it("does not write during a dry run", async () => {
    const before = JSON.stringify(dbState.current);
    const result = await migration.run({ dryRun: true });
    expect(result.changed).toEqual(["da-plant"]);
    expect(JSON.stringify(dbState.current)).toBe(before);
  });
});
