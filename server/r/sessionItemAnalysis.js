// Item analysis built from completed session responses for one evidence
// model. Sample size is the number of students with a scored response.
// LSAT7 stays a named fixture and is not used here.
//
// The matrix itself is built by liveResponseMatrix.js, which also serves
// IRT, Rasch, DINA, G-DINA, and CTT.

import { assessLiveResponseMatrix } from "./liveResponseMatrix.js";

export function assessSessionItemAnalysis(db, evidenceModelId) {
  return assessLiveResponseMatrix(db, {
    evidenceModelId,
    kind: "item-analysis",
  });
}
