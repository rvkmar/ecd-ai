import { describe, expect, it } from "vitest";
import { draftFromPolicy, payloadFromDraft } from "./curricularPolicyDraft";

describe("curricular policy draft", () => {
  it("turns an authored form into a goal tree and drops blank competencies", () => {
    const payload = payloadFromDraft({
      name: "  NCF Science  ",
      description: " Stage science ",
      version: "2023",
      issuingBody: "NCERT",
      subject: "Science",
      stage: "Middle",
      curricularGoals: [
        {
          code: " CG-1 ",
          statement: " Explains a labelled diagram ",
          competencies: [
            {
              code: " C-1.1 ",
              statement: " Names the parts ",
              learningOutcomesText: "Points to the nucleus\n\n  States its role  ",
            },
            { code: " ", statement: " ", learningOutcomesText: " " },
          ],
        },
      ],
    });

    expect(payload).toEqual({
      name: "NCF Science",
      description: "Stage science",
      version: "2023",
      issuingBody: "NCERT",
      subject: "Science",
      stage: "Middle",
      curricularGoals: [
        {
          code: "CG-1",
          statement: "Explains a labelled diagram",
          competencies: [
            {
              code: "C-1.1",
              statement: "Names the parts",
              learningOutcomes: ["Points to the nucleus", "States its role"],
            },
          ],
        },
      ],
    });
  });

  it("reopens a saved policy with outcomes on separate lines", () => {
    const draft = draftFromPolicy({
      name: "NCF Science",
      curricularGoals: [
        {
          code: "CG-1",
          statement: "Explains a labelled diagram",
          competencies: [
            {
              code: "C-1.1",
              statement: "Names the parts",
              learningOutcomes: ["Points to the nucleus", "States its role"],
            },
          ],
        },
      ],
    });
    expect(draft.curricularGoals[0].competencies[0].learningOutcomesText).toBe(
      "Points to the nucleus\nStates its role"
    );
  });
});
