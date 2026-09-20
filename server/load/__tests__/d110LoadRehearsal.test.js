import { describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { performLoadRehearsal } from "../d110LoadRehearsal.js";

describe("D110 load rehearsal", () => {
  it("records five numbers with configurations", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ecd-d110-test-"));
    const recordPath = path.join(tmp, "record.json");
    try {
      const result = await performLoadRehearsal({
        tmpDir: tmp,
        recordPath,
        networkRttMs: 50,
        cohortSize: 10,
        selectionItemCount: 20,
      });

      expect(result.ok).toBe(true);
      expect(result.scenarios).toHaveLength(5);
      expect(result.recordedNumbers).toHaveLength(5);
      for (const n of result.recordedNumbers) {
        expect(typeof n.metric).toBe("string");
        expect(typeof n.value).toBe("number");
        expect(Number.isFinite(n.value)).toBe(true);
        expect(typeof n.unit).toBe("string");
      }
      expect(result.scenarios[4].configuration.depthAlarm).toBe(true);
      expect(result.scenarios[3].configuration.compiledItemCount).toBeGreaterThan(0);

      const onDisk = JSON.parse(fs.readFileSync(recordPath, "utf8"));
      expect(onDisk.recordedNumbers).toHaveLength(5);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 120_000);
});
