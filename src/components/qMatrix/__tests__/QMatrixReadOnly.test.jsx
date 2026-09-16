// The district read-only Q-matrix surface (UI spec §2.1:
// "/admin/q-matrices and /district/q-matrices (read-only for district),
// gated by RequirePermission").
//
// rolePermissions.js has granted district canView-but-not-canEdit on
// qMatrixModels since D48, stating the reason inline: a Q-matrix is a
// system-level measurement decision, not local authoring, and district
// users need to SEE the spec their sessions run under. The server has
// always admitted non-admin reads and gated every write with
// authorizeRole(["admin"]). Only the surface was missing.
//
// What is asserted here is the UI half of that: a district user is
// offered NO authoring affordance anywhere in the surface. The server is
// the real boundary and stays the real boundary — these tests do not
// replace it, they assert the UI does not offer a button the server would
// refuse.

import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import QMatrixList from "../QMatrixList";
import QMatrixGrid from "../QMatrixGrid";
import QMatrixEditor from "../QMatrixEditor";
import QMatrixModelBuilder from "../QMatrixModelBuilder";

// The list reads through React Query hooks; stub them so these tests stay
// about the read-only posture rather than about data fetching.
//
// The fixtures are hoisted so each hook returns the SAME OBJECT REFERENCE
// on every render. Returning a fresh literal instead makes QMatrixEditor's
// load effect (`[isEditing, existing]`) see a changed dependency on every
// pass, setDraft, re-render, and loop forever — the suite hangs rather
// than fails, which is a much worse way to find out.
const fx = vi.hoisted(() => ({
  draftMatrix: {
    id: "qm1",
    name: "Fractions Diagnostic",
    description: "",
    competencyModelId: "cm1",
    competencyModelVersion: 1,
    attributeIds: ["a1"],
    entries: [],
    status: "draft",
    locked: false,
  },
  competencyModels: [
    {
      id: "cm1",
      name: "CM One",
      versionNumber: 1,
      smVariables: [{ id: "a1", type: "binary", label: "Fraction Addition" }],
    },
  ],
  empty: [],
}));

vi.mock("@/api/queries/qMatrixModels", () => ({
  useQMatrixModels: () => ({
    data: [
      {
        id: "qm1",
        name: "Fractions Diagnostic",
        competencyModelId: "cm1",
        attributeIds: ["a1", "a2"],
        entries: [{ itemId: "i1", attributeId: "a1" }],
        status: "draft",
        locked: false,
      },
      {
        id: "qm2",
        name: "Locked Matrix",
        competencyModelId: "cm1",
        attributeIds: ["a1"],
        entries: [{ itemId: "i1", attributeId: "a1" }],
        status: "confirmed",
        locked: true,
      },
    ],
    isLoading: false,
  }),
  useDeleteQMatrixModel: () => ({ mutateAsync: vi.fn() }),
  // A DRAFT, UNLOCKED record on purpose. A read-only check written only
  // against `locked` would pass against a confirmed matrix and still leave
  // a district user editing a draft.
  useQMatrixModel: () => ({ data: fx.draftMatrix, isLoading: false }),
  useCreateQMatrixModel: () => ({ mutateAsync: vi.fn() }),
  useUpdateQMatrixModel: () => ({ mutateAsync: vi.fn() }),
  useTransitionQMatrixModel: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/api/queries/competencies", () => ({
  useCompetencyModels: () => ({ data: fx.competencyModels }),
  useCompetencies: () => ({ data: fx.empty }),
}));

vi.mock("@/api/queries/evidenceModels", () => ({ useEvidenceModels: () => ({ data: fx.empty }) }));
vi.mock("@/api/queries/items", () => ({ useItems: () => ({ data: fx.empty }) }));

describe("district read-only list", () => {
  it("offers no way to create a Q-matrix", () => {
    render(<QMatrixList readOnly onCreate={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /new diagnostic design/i })).not.toBeInTheDocument();
  });

  it("offers no way to delete one, even an unlocked draft", () => {
    // The admin list shows Delete on any unlocked record. A draft is the
    // case that would slip through a check written only against `locked`.
    render(<QMatrixList readOnly onCreate={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
  });

  it("labels the row action 'View', not 'Edit' or 'Review'", () => {
    render(<QMatrixList readOnly onCreate={vi.fn()} onEdit={vi.fn()} />);

    const views = screen.getAllByRole("button", { name: /^view$/i });
    expect(views).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^review$/i })).not.toBeInTheDocument();
  });

  it("still shows the records themselves — read-only is not hidden", () => {
    render(<QMatrixList readOnly onCreate={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.getByText("Fractions Diagnostic")).toBeInTheDocument();
    expect(screen.getByText("Locked Matrix")).toBeInTheDocument();
  });

  it("keeps every authoring affordance for an admin (the guard admits too)", () => {
    // A read-only guard that also blanks the admin surface is not a guard,
    // it is a bug. Assert the converse explicitly.
    render(<QMatrixList onCreate={vi.fn()} onEdit={vi.fn()} />);

    expect(screen.getByRole("button", { name: /new diagnostic design/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^review$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^delete$/i })).toBeInTheDocument();
  });
});

describe("district read-only editor", () => {
  // The editor is where a write would actually originate, so this is the
  // control surface that matters most. The fixture is a DRAFT, UNLOCKED
  // matrix: `readOnly` has to hold on its own, not ride on `locked`.
  it("offers no Save for Review on a draft it is only viewing", () => {
    render(<QMatrixEditor qMatrixId="qm1" readOnly onCancel={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /save for review/i })).not.toBeInTheDocument();
  });

  it("offers no Lock & Confirm and no Return to draft", () => {
    render(<QMatrixEditor qMatrixId="qm1" readOnly onCancel={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /lock & confirm/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /return to draft/i })).not.toBeInTheDocument();
  });

  it("disables the metadata fields", () => {
    render(<QMatrixEditor qMatrixId="qm1" readOnly onCancel={vi.fn()} />);
    expect(screen.getByDisplayValue("Fractions Diagnostic")).toBeDisabled();
  });

  it("disables the attribute checkboxes", () => {
    render(<QMatrixEditor qMatrixId="qm1" readOnly onCancel={vi.fn()} />);
    screen.getAllByRole("checkbox").forEach((cb) => expect(cb).toBeDisabled());
  });

  it("still offers Save for Review to an author on the same draft", () => {
    // The converse. Without this, blanking the editor for everyone would
    // pass every assertion above.
    render(<QMatrixEditor qMatrixId="qm1" onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: /save for review/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Fractions Diagnostic")).not.toBeDisabled();
  });
});

describe("the surface threads readOnly end to end", () => {
  // Testing the list and the editor in isolation leaves the WIRING between
  // them unasserted: the builder could simply stop passing the prop on and
  // every other test here would still pass, while a district user who
  // clicked View would land in a fully editable draft. This is the seam,
  // so this is where it gets checked.
  it("opens the editor read-only after View is clicked", async () => {
    const user = userEvent.setup();
    render(<QMatrixModelBuilder readOnly />);

    await user.click(screen.getAllByRole("button", { name: /^view$/i })[0]);

    expect(screen.getByDisplayValue("Fractions Diagnostic")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /save for review/i })).not.toBeInTheDocument();
  });

  it("opens the editor editable after Edit is clicked, for an author", () => {
    render(<QMatrixModelBuilder />);
    expect(screen.getByRole("button", { name: /new diagnostic design/i })).toBeInTheDocument();
  });
});

describe("district read-only grid", () => {
  const attributes = [{ id: "a1", label: "Fraction Addition" }];
  const items = [{ id: "i1" }];

  it("disables every cell and removes the remove control", () => {
    render(
      <QMatrixGrid
        attributes={attributes}
        items={items}
        entries={[{ itemId: "i1", attributeId: "a1" }]}
        readOnly
      />
    );

    screen.getAllByRole("checkbox").forEach((cb) => expect(cb).toBeDisabled());
    expect(screen.queryByLabelText(/remove i1/i)).not.toBeInTheDocument();
  });

  it("still exposes headers and the row summary to a reader", () => {
    // Read-only must not mean read-poor: the district user is here to
    // understand the spec, so the structure has to survive.
    render(
      <QMatrixGrid
        attributes={attributes}
        items={items}
        entries={[{ itemId: "i1", attributeId: "a1" }]}
        readOnly
      />
    );

    expect(screen.getAllByRole("columnheader").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("rowheader")).toHaveLength(1);
    const row = screen.getAllByRole("row")[1];
    expect(within(row).getByText("1")).toBeInTheDocument();
    expect(screen.getByRole("grid")).toHaveAttribute("aria-readonly", "true");
  });
});
