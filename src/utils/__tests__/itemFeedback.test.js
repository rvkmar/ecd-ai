import { describe, expect, it } from "vitest";
import { validateEntity } from "../schema.js";
import {
  itemFeedbackErrors,
  normalizeItemFeedback,
  resolveItemFeedback,
} from "../itemFeedback.js";
import { buildInitialItemDraft } from "../../components/itemBank/itemConstants.js";

const item = {
  interaction: {
    type: "mcq",
    responseComponents: [
      { id: "opt_a", label: "Leaf" },
      { id: "opt_b", label: "Root" },
    ],
  },
  feedback: {
    byOption: {
      opt_a: "The leaf is the part that makes food.",
      opt_b: "A root anchors the plant.",
    },
    byScore: {
      1: "Full credit.",
      "0..0.5": "Partial credit. Look again.",
    },
    general: "Review the diagram.",
  },
};

function dbFor(row) {
  return {
    items: [row],
    taskModels: [
      {
        id: "tm1",
        status: "confirmed",
        locked: true,
        versionNumber: 1,
        expectedObservations: [{ observationId: "o1", evidenceModelId: "em1" }],
      },
    ],
    evidenceModels: [],
    sessions: [],
  };
}

function authoredItem(feedback) {
  return {
    id: "it1",
    status: "draft",
    taskModelId: "tm1",
    taskModelVersion: 1,
    observationId: "o1",
    interaction: item.interaction,
    scoring: { method: "dichotomous", maxScore: 1, evidenceActivationMap: [] },
    ...(feedback === undefined ? {} : { feedback }),
  };
}

describe("resolveItemFeedback", () => {
  it("prefers the selected option, then an exact score, then a range, then general", () => {
    expect(resolveItemFeedback(item, { rawAnswer: "opt_b", value: 1 })).toEqual({
      text: "A root anchors the plant.",
      rule: "byOption",
      key: "opt_b",
    });

    expect(resolveItemFeedback(item, { rawAnswer: { selected: "opt_a" }, scoredValue: 0 })).toEqual({
      text: "The leaf is the part that makes food.",
      rule: "byOption",
      key: "opt_a",
    });

    expect(
      resolveItemFeedback(item, { rawAnswer: { selected: ["opt_c", "opt_b"] }, value: 1 })
    ).toEqual({
      text: "A root anchors the plant.",
      rule: "byOption",
      key: "opt_b",
    });

    expect(resolveItemFeedback(item, { rawAnswer: "opt_c", scoredValue: 1 })).toEqual({
      text: "Full credit.",
      rule: "byScore",
      key: "1",
    });

    expect(resolveItemFeedback(item, { rawAnswer: "opt_c", value: 0.25 })).toEqual({
      text: "Partial credit. Look again.",
      rule: "byScore",
      key: "0..0.5",
    });

    expect(resolveItemFeedback(item, { rawAnswer: "opt_c", category: "0.4" })).toEqual({
      text: "Partial credit. Look again.",
      rule: "byScore",
      key: "0..0.5",
    });

    expect(resolveItemFeedback(item, { rawAnswer: "opt_c" })).toEqual({
      text: "Review the diagram.",
      rule: "general",
      key: null,
    });
  });

  it("lets an exact score win over a range that also contains it", () => {
    const scored = {
      feedback: {
        byScore: { "0..2": "In the range.", 1: "Exact." },
        general: "Fallback.",
      },
    };
    expect(resolveItemFeedback(scored, { value: 1 })).toEqual({
      text: "Exact.",
      rule: "byScore",
      key: "1",
    });
    expect(resolveItemFeedback(scored, { value: 1.5 })).toEqual({
      text: "In the range.",
      rule: "byScore",
      key: "0..2",
    });
  });

  it("returns null when feedback is absent or nothing matches", () => {
    expect(resolveItemFeedback({}, { rawAnswer: "opt_a", value: 1 })).toBeNull();
    expect(resolveItemFeedback({ feedback: {} }, { rawAnswer: "opt_a" })).toBeNull();
    expect(
      resolveItemFeedback(
        { feedback: { byScore: { "2-3": "High." }, general: "   " } },
        { value: 1 }
      )
    ).toBeNull();
  });

  it("accepts a hyphen range when both ends are non-negative", () => {
    expect(
      resolveItemFeedback({ feedback: { byScore: { "0-1": "Between." } } }, { scoredValue: 0 })
    ).toEqual({ text: "Between.", rule: "byScore", key: "0-1" });
    expect(
      resolveItemFeedback({ feedback: { byScore: { "-1..0": "Below." } } }, { value: -0.5 })
    ).toEqual({ text: "Below.", rule: "byScore", key: "-1..0" });
  });
});

describe("item feedback authoring validation", () => {
  it("accepts an absent field and a well-formed object", () => {
    expect(itemFeedbackErrors(authoredItem())).toEqual([]);
    expect(itemFeedbackErrors(authoredItem(null))).toEqual([]);
    expect(itemFeedbackErrors(authoredItem(item.feedback))).toEqual([]);

    const { errors } = validateEntity("items", authoredItem(item.feedback), dbFor(authoredItem(item.feedback)), {
      strict: false,
    });
    expect(errors.filter((error) => error.includes("items.feedback"))).toEqual([]);

    const bare = validateEntity("items", authoredItem(), dbFor(authoredItem()), { strict: false });
    expect(bare.errors.filter((error) => error.includes("items.feedback"))).toEqual([]);
  });

  it("rejects an unknown option, a bad score key, and overlapping ranges", () => {
    const unknown = authoredItem({
      byOption: { opt_missing: "Try again." },
    });
    const badKey = authoredItem({
      byScore: { nope: "No." },
    });
    const overlap = authoredItem({
      byScore: { "0..1": "Low.", "1..2": "High." },
    });
    const reversed = authoredItem({
      byScore: { "2-1": "Backwards." },
    });

    expect(itemFeedbackErrors(unknown).join(" ")).toMatch(/does not match an option id/);
    expect(itemFeedbackErrors(badKey).join(" ")).toMatch(/score such as 1/);
    expect(itemFeedbackErrors(overlap).join(" ")).toMatch(/overlap/);
    expect(itemFeedbackErrors(reversed).join(" ")).toMatch(/lower score to a higher score/);

    const { errors } = validateEntity("items", unknown, dbFor(unknown), { strict: false });
    expect(errors.some((error) => /opt_missing/.test(error))).toBe(true);
  });

  it("rejects byOption when the interaction has no option ids", () => {
    const row = authoredItem({ byOption: { opt_a: "Yes." } });
    row.interaction = { type: "constructed", responseComponents: [] };
    expect(itemFeedbackErrors(row).join(" ")).toMatch(/needs option ids/);
  });

  it("round-trips authored feedback through the item draft and drops blanks", () => {
    const once = buildInitialItemDraft({
      taskModelId: "tm1",
      feedback: {
        byOption: { opt_a: "  Yes.  " },
        byScore: { 1: "Full." },
        general: "   ",
      },
    });
    const twice = buildInitialItemDraft(once);
    expect(once.feedback).toEqual({
      byOption: { opt_a: "Yes." },
      byScore: { 1: "Full." },
    });
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
    expect(normalizeItemFeedback(null)).toBeNull();
    expect(buildInitialItemDraft({ taskModelId: "tm1" }).feedback).toBeUndefined();
  });
});
