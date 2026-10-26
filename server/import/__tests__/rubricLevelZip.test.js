// A rubric with more than two performance levels survives zip import
// and export. The importer stores the dimensions array as written.

import { describe, it, expect } from "vitest";
import { zipFiles, unzipSafe } from "../../utils/safeZip.js";
import { exportDbAsZip, importZipIntoDb } from "../ecdZipImport.js";

function fourLevelRubric(status) {
  const levels = [0, 1, 2, 3].map((value) => ({
    value,
    label: `Band ${value}`,
    descriptor: value === 3 ? "Top band." : "",
    exemplar: value === 3 ? "Top band." : "",
  }));
  return {
    id: "rub-four",
    name: "Four level judgement",
    status,
    dimensions: [{ id: "accuracy", name: "Accuracy", levels, activatesAt: 2 }],
  };
}

function roundTrip(status, keepOriginalIds) {
  const zip = zipFiles({
    "rubrics.json": JSON.stringify([fourLevelRubric(status)]),
  });
  const db = { rubrics: [] };
  const report = importZipIntoDb(db, zip, {
    keepOriginalIds,
    user: { username: "admin1", role: "admin" },
  });
  const exported = unzipSafe(exportDbAsZip(db));
  const raw = exported.find((file) => file.name === "rubrics.json");
  const rows = JSON.parse(raw.data.toString("utf8"));
  return { db, report, rows };
}

describe("rubric levels in the ECD zip", () => {
  it("imports and exports four levels, and keeps a confirmed status when the id is kept", () => {
    const draft = roundTrip("draft", true);
    expect(draft.report.totals.failed).toBe(0);
    expect(draft.db.rubrics[0].dimensions[0].levels).toHaveLength(4);
    expect(draft.db.rubrics[0].dimensions[0].levels.map((level) => level.value)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(draft.rows[0].dimensions[0].levels).toHaveLength(4);

    const confirmed = roundTrip("confirmed", true);
    expect(confirmed.report.totals.failed).toBe(0);
    expect(confirmed.db.rubrics[0].status).toBe("confirmed");
    expect(confirmed.db.rubrics[0].id).toBe("rub-four");
    expect(confirmed.db.rubrics[0].dimensions[0].levels).toHaveLength(4);
    expect(confirmed.rows[0].dimensions[0].levels[3].exemplar).toBe("Top band.");
  });
});
