// D53 — the DINA/G-DINA configuration panel on the Evidence Wizard.
//
// The schema half of this unit was already covered by D18's
// `src/utils/__tests__/qMatrixAndDina.test.js` ("a G-DINA model validates
// against a Q-matrix, and refuses a continuous SMV"). What was never
// covered is the UI half, because until now there was no UI: `dina` and
// `gdina` were permitted by `schema.js` and absent from
// `modelGuidanceLibrary.js`, so Step 6 could not offer the family at all.
//
// Two things are asserted here that are easy to get wrong in opposite
// directions:
//
//   1. The library and the schema must AGREE about which competency
//      variable types admit a diagnostic model. The library drives Step
//      6's picker; the schema decides what confirmation accepts. Where
//      they disagree, an author is offered a card and then refused —
//      the defect modelGuidanceLibrary.js's own CTT comment warns about.
//      So this is an agreement test against the real validator, not an
//      assertion about the library's contents.
//
//   2. The panel must NOT re-implement the server's binary-SMV rule.
//      A non-binary attribute is rendered, with its type, so the author
//      can see which one the server will refuse. Filtering it out would
//      look tidier and would hide the only information that makes the
//      refusal actionable.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { validateEntity } from "@/utils/schema.js";
import { getModelAvailability } from "../../utils/modelGuidanceLibrary";
import DINAConfigPanel from "../DINAConfigPanel";

/* =====================================================
   1. LIBRARY <-> SCHEMA AGREEMENT
===================================================== */

describe("the picker and the validator agree about diagnostic models", () => {
  // A minimal chain: one competency of the variable type under test, one
  // evidence model carrying a single dina statistical model. Only the
  // compatibility error is inspected, so the fixture does not have to be
  // otherwise confirmable.
  //
  // `status: "confirmed"` is load-bearing, not decoration: schema.js gates
  // the whole variable-type compatibility block on it. A draft fixture
  // makes this helper report that every variable type admits dina, which
  // is the test passing for the wrong reason in three of four cases.
  function schemaAdmitsDina(variableType) {
    const db = {
      competencies: [{ id: "c1", modelId: "cm1", variableType }],
      competencyModels: [{ id: "cm1", name: "CM", versionNumber: 1, smVariables: [] }],
      qMatrixModels: [],
    };

    const evidenceModel = {
      id: "em1",
      name: "EM",
      status: "confirmed",
      competencyId: "c1",
      competencyModelVersion: 1,
      // Not decoration either: schema.js reads `obj.observables.filter(...)`
      // unguarded at ten sites under this same `status === "confirmed"`
      // branch, so a fixture without the array makes validateEntity THROW
      // rather than return errors. Logged as a finding; not this unit's to
      // fix.
      observables: [],
      statisticalModels: [
        { id: "sm1", type: "dina", active: true, structureConfig: { qMatrixId: "qm1" } },
      ],
    };

    const { errors = [] } = validateEntity("evidenceModels", evidenceModel, db) || {};

    // schema.js states ONE rule in three message shapes -- "Statistical
    // model 'x' incompatible with binary competency", "Continuous
    // competency requires a CTT, IRT or Rasch model", "Categorical
    // competency requires Bayesian network model" -- so a single literal
    // match silently reports "admitted" for the two shapes it misses, and
    // this agreement test passes for the wrong reason. Both shapes name a
    // model and a competency; that is what is matched.
    return !errors.some(
      (e) => /incompatible with \w+ competency/i.test(e) || /competency requires .*model/i.test(e)
    );
  }

  for (const variableType of ["binary", "ordinal", "continuous", "categorical"]) {
    it(`agrees for a ${variableType} competency`, () => {
      const card = getModelAvailability(variableType).find((m) => m.type === "dina");
      expect(card, "dina must appear in the picker's model list at all").toBeTruthy();
      expect(card.compatible).toBe(schemaAdmitsDina(variableType));
    });
  }

  it("offers gdina exactly where it offers dina", () => {
    // They share a config panel and a schema allow-list; a divergence here
    // would mean one is offered and the other silently missing.
    for (const variableType of ["binary", "ordinal", "continuous", "categorical"]) {
      const models = getModelAvailability(variableType);
      const dina = models.find((m) => m.type === "dina");
      const gdina = models.find((m) => m.type === "gdina");
      expect(gdina?.compatible).toBe(dina?.compatible);
    }
  });

  it("states a reason when it is not available, rather than hiding the card", () => {
    const card = getModelAvailability("continuous").find((m) => m.type === "dina");
    expect(card.compatible).toBe(false);
    expect(card.reason).toMatch(/continuous/i);
  });
});

/* =====================================================
   2. THE PANEL
===================================================== */

// Fixtures are hoisted so every hook returns the SAME reference on every
// render — a mock that returns a fresh literal is an identity bomb for any
// component with an effect keyed on the fetched object, and the failure
// mode is a hung suite rather than a red assertion.
const fx = vi.hoisted(() => ({
  competencyModel: {
    id: "cm1",
    name: "Grade 6 Fraction Diagnosis",
    smVariables: [
      { id: "a1", label: "Fraction Equivalence", type: "binary" },
      { id: "a2", label: "Comparison", type: "binary" },
      { id: "a3", label: "Overall Proficiency", type: "continuous" },
    ],
  },
  qMatrices: [
    {
      id: "qm1",
      name: "Fractions Diagnostic",
      status: "confirmed",
      competencyModelId: "cm1",
      attributeIds: ["a1", "a2"],
      entries: [
        { itemId: "i1", attributeId: "a1" },
        { itemId: "i2", attributeId: "a1" },
        { itemId: "i2", attributeId: "a2" },
      ],
    },
  ],
  // A Q-matrix that has drifted: one of its attributes is no longer a
  // binary SMV. The server refuses this on confirm; the panel's job is to
  // make it visible, not to hide it.
  driftedQMatrices: [
    {
      id: "qm2",
      name: "Drifted",
      status: "draft",
      competencyModelId: "cm1",
      attributeIds: ["a1", "a3"],
      entries: [{ itemId: "i1", attributeId: "a1" }],
    },
  ],
  empty: [],
}));

const hookSpy = vi.hoisted(() => ({ calls: [] }));
const ctx = vi.hoisted(() => ({ current: {} }));
const qm = vi.hoisted(() => ({ current: [], isLoading: false }));

vi.mock("@/api/queries/qMatrixModels", () => ({
  useQMatrixModels: (competencyModelId, options) => {
    hookSpy.calls.push({ competencyModelId, options });
    return { data: qm.current, isLoading: qm.isLoading };
  },
}));

vi.mock("../../../EvidenceWizardContext", () => ({
  useEvidenceWizardContext: () => ctx.current,
}));

// The Combobox itself is covered by dialogAndCombobox.test.jsx. Stubbing it
// with a plain listbox keeps these assertions about the PANEL's wiring —
// which options it builds, and what it writes when one is chosen — rather
// than about Radix's popover behaviour in jsdom.
vi.mock("@/components/ui/combobox", () => ({
  Combobox: ({ options, value, onValueChange, placeholder, disabled }) => (
    <select
      aria-label={placeholder}
      value={value}
      disabled={disabled}
      onChange={(e) => onValueChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

function setup({
  model = { id: "sm1", type: "dina", structureConfig: {} },
  competencyModel = fx.competencyModel,
  qMatrices = fx.qMatrices,
  isLoading = false,
  locked = false,
  onChange = vi.fn(),
} = {}) {
  ctx.current = { selectedCompetencyModel: competencyModel };
  qm.current = qMatrices;
  qm.isLoading = isLoading;
  render(<DINAConfigPanel model={model} onChange={onChange} locked={locked} />);
  return { onChange };
}

beforeEach(() => {
  hookSpy.calls = [];
});

describe("Q-matrix binding", () => {
  it("scopes the offered Q-matrices to this evidence model's competency model", () => {
    // The narrowing happens server-side (?competencyModelId=), so the guard
    // that matters is that the id is actually passed. Without this, the
    // panel would offer every Q-matrix in the system and the server would
    // refuse the binding on confirm, with no hint at selection time.
    setup();
    expect(hookSpy.calls.at(-1).competencyModelId).toBe("cm1");
  });

  it("writes structureConfig.qMatrixId without discarding the rest of the config", async () => {
    const user = userEvent.setup();
    const { onChange } = setup({
      model: {
        id: "sm1",
        type: "dina",
        structureConfig: { observableIds: ["o1"] },
      },
    });

    await user.selectOptions(screen.getByRole("combobox"), "qm1");

    expect(onChange).toHaveBeenCalledWith({ observableIds: ["o1"], qMatrixId: "qm1" });
  });

  it("says what to do when the competency model has no Q-matrix yet", () => {
    setup({ qMatrices: fx.empty });
    expect(screen.getByText(/no q-matrix exists/i)).toBeInTheDocument();
    // Naming the model is the difference between a dead end and an errand.
    expect(screen.getByText(/Grade 6 Fraction Diagnosis/)).toBeInTheDocument();
    expect(screen.getByText(/Diagnostic design editor/i)).toBeInTheDocument();
  });

  it("explains the earlier missing step when no competency is selected", () => {
    setup({ competencyModel: null });
    expect(screen.getByText(/no competency selected/i)).toBeInTheDocument();
  });

  it("disables the binding when the model is locked", () => {
    setup({ locked: true });
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});

describe("attribute bindings", () => {
  const bound = { id: "sm1", type: "dina", structureConfig: { qMatrixId: "qm1" } };

  it("derives the attribute rows from the bound Q-matrix", () => {
    setup({ model: bound });
    expect(screen.getByRole("rowheader", { name: "Fraction Equivalence" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Comparison" })).toBeInTheDocument();
  });

  it("counts the distinct items requiring each attribute", () => {
    setup({ model: bound });
    const row = screen.getByRole("rowheader", { name: "Fraction Equivalence" }).closest("tr");
    // i1 and i2 both require a1; a1 appears twice in entries but that is
    // two items, not two counts of one.
    expect(within(row).getByText("2")).toBeInTheDocument();
  });

  it("offers no way to edit them here", () => {
    // §4 rule 4: two controls must never write one field. The Q-matrix
    // editor owns the attribute list; a second editable copy would drift.
    setup({ model: bound });
    const table = screen.getByRole("table");
    expect(within(table).queryAllByRole("textbox")).toHaveLength(0);
    expect(within(table).queryAllByRole("checkbox")).toHaveLength(0);
    expect(within(table).queryAllByRole("button")).toHaveLength(0);
  });

  it("shows a non-binary attribute rather than hiding it", () => {
    // The server refuses this binding, naming the offending SMV. Filtering
    // it out here would leave the author with a refusal they cannot act on.
    setup({
      model: { id: "sm1", type: "dina", structureConfig: { qMatrixId: "qm2" } },
      qMatrices: fx.driftedQMatrices,
    });
    const row = screen.getByRole("rowheader", { name: "Overall Proficiency" }).closest("tr");
    expect(within(row).getByText("continuous")).toBeInTheDocument();
  });

  it("carries the attribute type as a word, not only as a colour", () => {
    setup({ model: bound });
    const row = screen.getByRole("rowheader", { name: "Comparison" }).closest("tr");
    expect(within(row).getByText("binary")).toBeInTheDocument();
  });

  it("shows nothing at all until a Q-matrix is bound", () => {
    setup();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("the coherence advisory", () => {
  it("fires when the competency model declares a trait perspective", () => {
    setup({
      competencyModel: { ...fx.competencyModel, psychologicalPerspective: "trait" },
    });
    expect(screen.getByRole("note")).toHaveTextContent(/trait/i);
    expect(screen.getByRole("note")).toHaveTextContent(/advisory, not blocking/i);
  });

  it("stays silent for a perspective that fits a diagnostic model", () => {
    setup({
      competencyModel: {
        ...fx.competencyModel,
        psychologicalPerspective: "information_processing",
      },
    });
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("stays silent when no perspective is declared", () => {
    // An absent field is not a contradiction. Warning here would train
    // authors to ignore the advisory.
    setup();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});

describe("the honest notes", () => {
  it("says plainly that slip and guess are not authorable yet", () => {
    // UI spec §2.3's rule, applied here: do not tell an author a value is
    // configurable when it is not. evidenceAccumulation.js refuses a pilot
    // DINA group for exactly this reason.
    setup();
    expect(screen.getByText(/not authorable yet/i)).toBeInTheDocument();
  });

  it("shows the pattern ordering as fixed, with no control to change it", () => {
    setup({ model: { id: "sm1", type: "dina", structureConfig: { qMatrixId: "qm1" } } });
    const heading = screen.getByText(/attribute-pattern ordering/i);
    const section = heading.closest("section");
    expect(within(section).getByText(/graded-lexicographic/i)).toBeInTheDocument();
    expect(within(section).queryAllByRole("combobox")).toHaveLength(0);
    expect(within(section).queryAllByRole("textbox")).toHaveLength(0);
  });
});
