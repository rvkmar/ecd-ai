function emptyCompetency() {
  return { code: "", statement: "", learningOutcomesText: "" };
}

function emptyGoal() {
  return { code: "", statement: "", competencies: [] };
}

function outcomesToText(outcomes) {
  return Array.isArray(outcomes) ? outcomes.filter((line) => typeof line === "string").join("\n") : "";
}

export function draftFromPolicy(policy) {
  const goals = Array.isArray(policy?.curricularGoals) ? policy.curricularGoals : [];
  return {
    name: policy?.name || "",
    description: policy?.description || "",
    version: policy?.version || "",
    issuingBody: policy?.issuingBody || "",
    subject: policy?.subject || "",
    stage: policy?.stage || "",
    curricularGoals: (goals.length ? goals : [emptyGoal()]).map((goal) => ({
      code: goal?.code || "",
      statement: goal?.statement || "",
      competencies: (Array.isArray(goal?.competencies) ? goal.competencies : []).map((comp) => ({
        code: comp?.code || "",
        statement: comp?.statement || "",
        learningOutcomesText: outcomesToText(comp?.learningOutcomes),
      })),
    })),
  };
}

export function payloadFromDraft(draft) {
  return {
    name: (draft.name || "").trim(),
    description: (draft.description || "").trim(),
    version: (draft.version || "").trim(),
    issuingBody: (draft.issuingBody || "").trim(),
    subject: (draft.subject || "").trim(),
    stage: (draft.stage || "").trim(),
    curricularGoals: (draft.curricularGoals || []).map((goal) => ({
      code: (goal.code || "").trim(),
      statement: (goal.statement || "").trim(),
      competencies: (goal.competencies || [])
        .filter(
          (comp) =>
            (comp.code || "").trim() ||
            (comp.statement || "").trim() ||
            (comp.learningOutcomesText || "").trim()
        )
        .map((comp) => ({
          code: (comp.code || "").trim(),
          statement: (comp.statement || "").trim(),
          learningOutcomes: (comp.learningOutcomesText || "")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
        })),
    })),
  };
}

export { emptyGoal, emptyCompetency };
