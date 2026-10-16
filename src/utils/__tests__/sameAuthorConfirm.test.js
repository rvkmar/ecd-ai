import { describe, it, expect } from "vitest";
import {
  isSameAuthorConfirmation,
  reviewSubmitterOf,
  sameAuthorAcknowledgementReady,
} from "../sameAuthorConfirm";

describe("sameAuthorConfirm", () => {
  it("uses reviewMeta.submittedBy before the resolved submitter", () => {
    expect(
      reviewSubmitterOf({
        reviewMeta: { submittedBy: "admin1" },
        reviewSubmitter: "other",
      })
    ).toBe("admin1");
  });

  it("uses the audit-resolved submitter when reviewMeta is gone", () => {
    expect(reviewSubmitterOf({ status: "reviewed", reviewSubmitter: "admin1" })).toBe(
      "admin1"
    );
  });

  it("matches only a reviewed model whose submitter is the signed-in user", () => {
    const model = { status: "reviewed", reviewSubmitter: "admin1" };
    expect(isSameAuthorConfirmation(model, "admin1")).toBe(true);
    expect(isSameAuthorConfirmation(model, "admin2")).toBe(false);
    expect(isSameAuthorConfirmation({ ...model, status: "draft" }, "admin1")).toBe(false);
  });

  it("requires the checkbox and a reason of at least 10 characters", () => {
    expect(
      sameAuthorAcknowledgementReady({
        acknowledgeSameAuthor: true,
        sameAuthorReason: "I submitted this",
      })
    ).toBe(true);
    expect(
      sameAuthorAcknowledgementReady({
        acknowledgeSameAuthor: true,
        sameAuthorReason: "short",
      })
    ).toBe(false);
    expect(
      sameAuthorAcknowledgementReady({
        acknowledgeSameAuthor: false,
        sameAuthorReason: "I submitted this",
      })
    ).toBe(false);
  });
});
