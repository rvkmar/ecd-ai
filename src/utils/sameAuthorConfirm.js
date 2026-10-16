// Same comparison the competency-model confirm route uses
// (resolveReviewSubmitter): reviewMeta.submittedBy when it is still
// stored, otherwise the submitter resolved from the audit log and
// attached as reviewSubmitter. The wizard must not invent a third rule.

export function reviewSubmitterOf(model) {
  if (model?.reviewMeta?.submittedBy) return model.reviewMeta.submittedBy;
  return model?.reviewSubmitter || null;
}

export function isSameAuthorConfirmation(model, username) {
  const submitter = reviewSubmitterOf(model);
  return (
    model?.status === "reviewed" &&
    !!submitter &&
    !!username &&
    submitter === username
  );
}

export function sameAuthorAcknowledgementReady(ack) {
  const reason =
    typeof ack?.sameAuthorReason === "string" ? ack.sameAuthorReason.trim() : "";
  return ack?.acknowledgeSameAuthor === true && reason.length >= 10;
}
