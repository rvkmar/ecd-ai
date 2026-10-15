import { describe, it, expect } from "vitest";
import {
  schema,
  validateEntity,
  DOMAIN_ANALYSIS_STATUS_VALUES,
  DOMAIN_ANALYSIS_STATUS_MEANINGS,
  DOMAIN_ANALYSIS_ENTITIES,
} from "../schema.js";
import {
  DOMAIN_ANALYSIS_STATUS_MIRROR,
  DOMAIN_ANALYSIS_ENTITY_MIRROR,
  domainAnalysisReadiness,
} from "../domainAnalysisReadiness.js";

const LAYER_1 = [
  "Valued work",
  "Task features",
  "Representational forms",
  "Performance outcomes",
  "Valued knowledge",
  "Knowledge structure",
  "Knowledge-task relationships",
];

const sections = {
  valuedWork: [{ label: "Explain a labelled diagram" }],
  taskFeatures: [{ label: "A figure with named parts" }],
  representationalForms: [{ label: "Diagram plus a written caption" }],
  performanceOutcomes: [{ label: "A causal explanation" }],
  valuedKnowledge: [{ label: "How the parts of a system relate" }],
  knowledgeStructure: [{ label: "Parts, relations, and the whole" }],
  knowledgeTaskRelationships: [{ label: "The task asks for the relation, not the labels" }],
};

describe("D141 domainAnalyses schema", () => {
  it("carries the seven Layer-1 entities on one record", () => {
    expect(DOMAIN_ANALYSIS_ENTITIES.map((row) => row.padi)).toEqual(LAYER_1);
    expect(DOMAIN_ANALYSIS_ENTITIES).toHaveLength(7);
    for (const row of DOMAIN_ANALYSIS_ENTITIES) {
      expect(schema.domainAnalyses[row.field], row.padi).toBe("array");
    }
    expect(schema.domainAnalyses.psychologicalPerspective).toBe("string");
    expect(DOMAIN_ANALYSIS_ENTITY_MIRROR).toEqual(
      DOMAIN_ANALYSIS_ENTITIES.map((row) => row.field)
    );
  });

  it("uses draft and confirmed, and writes a meaning for each", () => {
    expect([...DOMAIN_ANALYSIS_STATUS_VALUES]).toEqual(["draft", "confirmed"]);
    expect(DOMAIN_ANALYSIS_STATUS_VALUES).not.toContain("operational");
    for (const status of DOMAIN_ANALYSIS_STATUS_VALUES) {
      expect(DOMAIN_ANALYSIS_STATUS_MEANINGS[status].length).toBeGreaterThan(20);
      expect(DOMAIN_ANALYSIS_STATUS_MEANINGS[status].toLowerCase()).toMatch(/deliver/);
    }
    expect(DOMAIN_ANALYSIS_STATUS_MIRROR).toEqual([...DOMAIN_ANALYSIS_STATUS_VALUES]);
  });

  it("lets a draft omit the seven sections", () => {
    const draft = validateEntity(
      "domainAnalyses",
      { name: "Unfinished", status: "draft" },
      null,
      { strict: false }
    );
    expect(draft.valid).toBe(true);

    const ready = domainAnalysisReadiness(
      { name: "Unfinished", status: "draft" },
      { strict: false }
    );
    expect(ready.ready).toBe(true);
  });

  it("refuses confirm until every section and the perspective are present", () => {
    const record = {
      name: "Diagrams",
      status: "confirmed",
      ...sections,
      knowledgeTaskRelationships: [],
    };
    const confirmed = validateEntity("domainAnalyses", record, null, { strict: true });
    expect(confirmed.valid).toBe(false);
    expect(confirmed.errors.some((e) => /knowledgeTaskRelationships/.test(e))).toBe(true);
    expect(confirmed.errors.some((e) => /psychologicalPerspective/.test(e))).toBe(true);

    const ready = domainAnalysisReadiness(record, { strict: true });
    expect(ready.ready).toBe(false);
    expect(ready.errors.some((e) => /knowledgeTaskRelationships/.test(e))).toBe(true);
    expect(ready.errors.some((e) => /psychologicalPerspective/.test(e))).toBe(true);
  });

  it("accepts a complete analysis and refuses operational", () => {
    const ok = validateEntity(
      "domainAnalyses",
      { name: "Diagrams", status: "confirmed", psychologicalPerspective: "trait", ...sections },
      null,
      { strict: true }
    );
    expect(ok.valid).toBe(true);

    const live = validateEntity("domainAnalyses", {
      name: "Live?",
      status: "operational",
      psychologicalPerspective: "trait",
      ...sections,
    });
    expect(live.valid).toBe(false);
    expect(live.errors.some((e) => /operational/.test(e))).toBe(true);
  });

  it("refuses a curricular policy, a Q-matrix, or a competency link in a section", () => {
    const result = validateEntity(
      "domainAnalyses",
      {
        name: "Linked",
        status: "draft",
        valuedKnowledge: [{ label: "Goals", curricularPolicyId: "cp1" }],
        knowledgeTaskRelationships: [{ label: "Grid", qMatrixId: "qm1" }],
        valuedWork: [{ label: "Work", competencyModelId: "cm1" }],
      },
      {
        curricularPolicies: [{ id: "cp1", name: "NCF" }],
        qMatrixModels: [{ id: "qm1" }],
        competencyModels: [{ id: "cm1", name: "Existing", psychologicalPerspective: "trait" }],
      },
      { strict: false }
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /curricular policy/.test(e))).toBe(true);
    expect(result.errors.some((e) => /Q-matrix/.test(e))).toBe(true);
    expect(result.errors.some((e) => /Competency Model/.test(e))).toBe(true);
  });
});
