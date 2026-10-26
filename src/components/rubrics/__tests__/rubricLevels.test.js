import { describe, it, expect } from "vitest";
import {
  MAX_RUBRIC_LEVELS,
  MIN_RUBRIC_LEVELS,
  addLevelColumn,
  alignDimensions,
  columnHasText,
  commitLevelScore,
  removeLevelColumn,
} from "../rubricLevels";

function pair() {
  return [
    {
      id: "a",
      name: "Accuracy",
      activatesAt: 1,
      levels: [
        { value: 0, label: "Low", descriptor: "", exemplar: "" },
        { value: 1, label: "High", descriptor: "meets it", exemplar: "meets it" },
      ],
    },
    {
      id: "b",
      name: "Clarity",
      activatesAt: 1,
      levels: [
        { value: 0, label: "Low", descriptor: "muddy", exemplar: "muddy" },
        { value: 1, label: "High", descriptor: "", exemplar: "" },
      ],
    },
  ];
}

describe("rubric level columns", () => {
  it("appends one empty column with the next score and label", () => {
    const next = addLevelColumn(pair());
    expect(next).toHaveLength(2);
    for (const dimension of next) {
      expect(dimension.levels).toHaveLength(3);
      expect(dimension.levels[2]).toEqual({
        value: 2,
        label: "Level 3",
        descriptor: "",
        exemplar: "",
      });
    }
    expect(next[0].levels[1].descriptor).toBe("meets it");
    expect(next[0].activatesAt).toBe(1);
  });

  it("stops adding at the form maximum and still returns every existing column", () => {
    let dimensions = pair();
    for (let i = 0; i < 20; i += 1) dimensions = addLevelColumn(dimensions);
    expect(dimensions[0].levels).toHaveLength(MAX_RUBRIC_LEVELS);
    expect(dimensions[1].levels).toHaveLength(MAX_RUBRIC_LEVELS);
  });

  it("pads a short criterion when columns are aligned", () => {
    const aligned = alignDimensions([
      pair()[0],
      {
        id: "b",
        name: "Clarity",
        activatesAt: 1,
        levels: [{ value: 0, label: "Low", descriptor: "muddy", exemplar: "muddy" }],
      },
    ]);
    expect(aligned[1].levels).toHaveLength(2);
    expect(aligned[1].levels[1]).toMatchObject({
      value: 1,
      label: "High",
      descriptor: "",
      exemplar: "",
    });
  });

  it("removes an empty column without a text check, and keeps at least two", () => {
    const three = addLevelColumn(pair());
    expect(columnHasText(three, 2)).toBe(false);
    expect(columnHasText(three, 1)).toBe(true);
    const removed = removeLevelColumn(three, 2);
    expect(removed[0].levels.map((level) => level.label)).toEqual(["Low", "High"]);
    expect(removeLevelColumn(removed, 0)[0].levels.map((level) => level.label)).toEqual([
      "Low",
      "High",
    ]);
    expect(removed[0].levels).toHaveLength(MIN_RUBRIC_LEVELS);
  });

  it("retargets activatesAt when the removed score was the threshold", () => {
    const three = addLevelColumn(pair()).map((dimension) => ({
      ...dimension,
      activatesAt: 2,
    }));
    const removed = removeLevelColumn(three, 2);
    expect(removed.every((dimension) => dimension.activatesAt === 1)).toBe(true);
  });

  it("rejects a duplicate or blank score and keeps the previous value", () => {
    const dimensions = pair();
    const duplicate = commitLevelScore(dimensions, 1, "0", 1);
    expect(duplicate[0].levels[1].value).toBe(1);
    expect(duplicate[0].activatesAt).toBe(1);
    const blank = commitLevelScore(dimensions, 1, "", 1);
    expect(blank[0].levels[1].value).toBe(1);
    const moved = commitLevelScore(dimensions, 1, "4", 1);
    expect(moved[0].levels[1].value).toBe(4);
    expect(moved[1].levels[1].value).toBe(4);
    expect(moved[0].activatesAt).toBe(4);
    expect(moved[0].levels[1].descriptor).toBe("meets it");
    expect(moved[1].levels[1].descriptor).toBe("");
  });
});
