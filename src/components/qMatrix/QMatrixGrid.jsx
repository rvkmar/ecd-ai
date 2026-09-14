// src/components/qMatrix/QMatrixGrid.jsx
// ------------------------------------------------------------
// D51 — the Q-matrix editor's core: an attributes (columns) x items
// (rows) checkbox grid. Deliberately dumb/presentational -- all state
// (which items are included, which cells are checked, D52 validity) lives
// in QMatrixEditor, so this component is trivial to unit-test and to
// exercise in Storybook in isolation.
//
// Uses only named design tokens (text-caption, text-2xs) and semantic
// Tailwind colors -- no arbitrary `text-[Npx]` values, per the Day 41
// design-tokens rule.
//
// ACCESSIBILITY AND THE GRID INTERACTION MODEL (the D51 half that was
// outstanding until now). The UI change specification asks for three
// behaviours by name -- "arrow keys move, space toggles, shift-click
// range-selects" (§2.1) -- and §5 adds three more requirements that §6
// makes a condition of this surface being done at all: the grid must be
// "fully keyboard-operable," must "expose row and column headers to
// assistive technology," and must "announce cell state changes."
//
//   1. ROVING TABINDEX. The whole grid is ONE tab stop; arrows move
//      within it. The alternative -- every checkbox its own tab stop --
//      is technically "keyboard operable" and practically unusable: a
//      20-item, 5-attribute matrix would be 100 presses to traverse.
//      This is the WAI-ARIA grid pattern, and it is why `role="grid"`
//      is on the table rather than leaving it a plain `role="table"`.
//
//   2. NATIVE HEADERS, NOT RE-ANNOUNCED ONES. `<th scope="col">` and
//      `<th scope="row">` are what expose the headers; assistive
//      technology reads "Item it_004, Fraction Addition, checked"
//      without the component describing itself. The per-cell aria-label
//      is kept as a belt-and-braces fallback for AT that is not in
//      table-reading mode.
//
//   3. RANGE SELECT HAS A KEYBOARD EQUIVALENT. Shift-CLICK is what the
//      spec names, but a mouse-only capability inside a surface required
//      to be "fully keyboard-operable" is exactly the defect §5 exists to
//      prevent. So both gestures share one anchor model: the last cell
//      toggled normally is the anchor, and shift + activation on a second
//      cell applies to the whole rectangle between them. Mouse users
//      shift-click; keyboard users arrow to the target and press
//      Shift+Space. Same code path, same result.
//
//   4. RANGE SELECT IS ONE BATCHED CALLBACK, NOT N TOGGLES. `onSetCells`
//      exists rather than looping `onToggleCell`, because the editor's
//      own toggle handler derives the next entries[] from the CURRENT
//      draft it closed over -- calling it in a loop would have every
//      iteration after the first read pre-loop state and silently drop
//      all but the last cell. That is the same stale-closure family of
//      bug that made "Save for Review" no-op on a new record; not
//      reintroducing it here.
//
//   5. SEVERITY IS NEVER COLOUR ALONE (§5). A red row and an amber
//      column were previously the only signal. The row summary badge
//      that §2.1 asks for ("attribute count for the row; turns
//      destructive on zero") doubles as that second channel: a literal
//      "0" is readable without seeing red, and it is what a screen
//      reader reaches through the row header. Advisory columns get a
//      marker glyph and text for the same reason.
// ------------------------------------------------------------

import React from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export default function QMatrixGrid({
  attributes = [],
  items = [],
  entries = [],
  onToggleCell,
  onSetCells,
  onRemoveItem,
  readOnly = false,
  rowErrors = [],
  columnAdvisories = [],
}) {
  const isChecked = (itemId, attributeId) =>
    entries.some((e) => e.itemId === itemId && e.attributeId === attributeId);

  const rowErrorItemIds = new Set(
    rowErrors.flatMap((e) => (e.itemId ? [e.itemId] : e.itemIds || []))
  );
  const advisoryAttrIds = new Set(
    columnAdvisories.map((a) => a.attributeId).filter(Boolean)
  );

  // Roving tabindex: exactly one cell is tabbable at a time. `anchor` is
  // the last normally-toggled cell, which shift + activation ranges from.
  const [focus, setFocus] = React.useState({ r: 0, c: 0 });
  const [anchor, setAnchor] = React.useState(null);
  const [announcement, setAnnouncement] = React.useState("");
  const cellRefs = React.useRef(new Map());

  // Rows and columns change while authoring (adding an item, dropping an
  // attribute). Clamp at render rather than in an effect so the tabbable
  // cell can never point past the end of a shrunken grid -- which would
  // leave the grid with NO tab stop at all and strand a keyboard user.
  const maxR = Math.max(0, items.length - 1);
  const maxC = Math.max(0, attributes.length - 1);
  const active = { r: clamp(focus.r, 0, maxR), c: clamp(focus.c, 0, maxC) };

  /* The origin comes from the cell the key event actually fired on, NOT
     from `active`. Reading component state here would mean navigating
     from wherever the last committed render thinks focus is, which can
     lag the real DOM focus (anything that focuses a cell directly, then
     sends a key before React has re-rendered, arrives with stale state).
     The event's own cell cannot be stale -- it is where the user is. */
  function moveFocus(fromR, fromC, dr, dc) {
    const r = clamp(fromR + dr, 0, maxR);
    const c = clamp(fromC + dc, 0, maxC);
    setFocus({ r, c });
    cellRefs.current.get(`${r}:${c}`)?.focus();
  }

  function announceCell(item, attr, checked) {
    setAnnouncement(
      `${item.id} ${checked ? "requires" : "no longer requires"} ${attr.label}`
    );
  }

  function toggleSingle(item, attr, r, c) {
    setAnchor({ r, c });
    onToggleCell?.(item.id, attr.id);
    announceCell(item, attr, !isChecked(item.id, attr.id));
  }

  /* Apply the rectangle between the anchor and this cell. The value
     applied to the whole block is the value a plain click on THIS cell
     would have produced, so the gesture's outcome is always predictable
     from the cell under the cursor: shift-clicking an unchecked cell
     fills the block, shift-clicking a checked one clears it. */
  function applyRange(item, attr, r, c) {
    if (!anchor) {
      toggleSingle(item, attr, r, c);
      return;
    }

    const nextChecked = !isChecked(item.id, attr.id);
    const r0 = Math.min(anchor.r, r);
    const r1 = Math.max(anchor.r, r);
    const c0 = Math.min(anchor.c, c);
    const c1 = Math.max(anchor.c, c);

    const cells = [];
    for (let ri = r0; ri <= r1; ri += 1) {
      for (let ci = c0; ci <= c1; ci += 1) {
        if (items[ri] && attributes[ci]) {
          cells.push({ itemId: items[ri].id, attributeId: attributes[ci].id });
        }
      }
    }

    onSetCells?.(cells, nextChecked);
    setFocus({ r, c });
    setAnnouncement(
      `${cells.length} cell${cells.length === 1 ? "" : "s"} ${
        nextChecked ? "checked" : "cleared"
      }, ${items[r0].id} to ${items[r1].id}`
    );
  }

  function handleKeyDown(e, item, attr, r, c) {
    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        moveFocus(r, c, -1, 0);
        break;
      case "ArrowDown":
        e.preventDefault();
        moveFocus(r, c, 1, 0);
        break;
      case "ArrowLeft":
        e.preventDefault();
        moveFocus(r, c, 0, -1);
        break;
      case "ArrowRight":
        e.preventDefault();
        moveFocus(r, c, 0, 1);
        break;
      case " ":
        // Plain Space is left to the native checkbox, which toggles and
        // fires change. Only the SHIFT variant is intercepted -- it is
        // the keyboard half of shift-click.
        if (e.shiftKey) {
          e.preventDefault();
          applyRange(item, attr, r, c);
        }
        break;
      default:
        break;
    }
  }

  if (items.length === 0) {
    return <p className="mt-2 text-caption text-slate-500">No items added yet.</p>;
  }

  const requiredCount = (itemId) =>
    attributes.filter((a) => isChecked(itemId, a.id)).length;

  return (
    <>
      <div
        className="mt-2 overflow-x-auto rounded-md border border-slate-200"
        tabIndex={0}
        aria-label="Q-matrix table"
      >
        <table
          role="grid"
          aria-label="Q-matrix: items by required attributes"
          aria-readonly={readOnly || undefined}
          className="min-w-full border-collapse text-caption"
        >
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 bg-slate-50 px-3 py-2 text-left font-medium text-slate-600"
              >
                Item
              </th>
              {attributes.map((attr) => {
                const advisory = advisoryAttrIds.has(attr.id);
                return (
                  <th
                    key={attr.id}
                    scope="col"
                    className={`px-3 py-2 text-center font-medium ${
                      advisory ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-600"
                    }`}
                    title={attr.label}
                  >
                    {attr.label}
                    {advisory && (
                      <>
                        {/* Second channel, so the amber is not the only
                            thing carrying "advisory" (§5). */}
                        <span aria-hidden="true" className="ml-1">ⓘ</span>
                        <span className="sr-only"> (advisory)</span>
                      </>
                    )}
                  </th>
                );
              })}
              <th scope="col" className="bg-slate-50 px-3 py-2 text-center font-medium text-slate-600">
                Required
              </th>
              {!readOnly && <th scope="col" className="bg-slate-50 px-2 py-2"><span className="sr-only">Remove</span></th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item, r) => {
              const count = requiredCount(item.id);
              const rowInvalid = rowErrorItemIds.has(item.id);

              return (
                <tr key={item.id} className={rowInvalid ? "bg-red-50" : ""}>
                  <th
                    scope="row"
                    className="sticky left-0 whitespace-nowrap border-t border-slate-100 bg-white px-3 py-2 text-left font-medium text-slate-700"
                  >
                    {item.id}
                    {item.metadata?.subject && (
                      <span className="ml-1.5 text-2xs text-slate-400">
                        {item.metadata.subject}
                      </span>
                    )}
                    {rowInvalid && (
                      <span className="sr-only"> — requires no attributes</span>
                    )}
                  </th>

                  {attributes.map((attr, c) => {
                    const checked = isChecked(item.id, attr.id);
                    const isActive = r === active.r && c === active.c;

                    return (
                      <td
                        key={attr.id}
                        role="gridcell"
                        className="border-t border-slate-100 px-3 py-2 text-center"
                      >
                        <input
                          type="checkbox"
                          className="h-6 w-6 min-h-6 min-w-6 align-middle"
                          ref={(el) => {
                            if (el) cellRefs.current.set(`${r}:${c}`, el);
                            else cellRefs.current.delete(`${r}:${c}`);
                          }}
                          checked={checked}
                          disabled={readOnly}
                          tabIndex={isActive ? 0 : -1}
                          onFocus={() => setFocus({ r, c })}
                          onKeyDown={(e) => handleKeyDown(e, item, attr, r, c)}
                          /* Both gestures are decided HERE, from one
                             handler, rather than intercepting shift-click
                             in onClick and calling preventDefault. That
                             does not work: React derives a checkbox's
                             onChange from the CLICK event, and the browser
                             has already flipped `checked` by the time the
                             handler runs, so React sees a change and fires
                             onChange anyway -- preventDefault only makes
                             the DOM revert afterwards. Suppressing it that
                             way fired the range AND a single toggle for
                             the same gesture. The cell is controlled by
                             `entries`, so letting the range decide its
                             value keeps it visually correct regardless. */
                          onChange={(e) =>
                            e.nativeEvent?.shiftKey
                              ? applyRange(item, attr, r, c)
                              : toggleSingle(item, attr, r, c)
                          }
                          aria-label={`${item.id} requires ${attr.label}`}
                          aria-invalid={rowInvalid || undefined}
                        />
                      </td>
                    );
                  })}

                  <td role="gridcell" className="border-t border-slate-100 px-3 py-2 text-center">
                    <Badge variant={count === 0 ? "destructive" : "secondary"}>
                      {count}
                    </Badge>
                  </td>

                  {!readOnly && (
                    <td role="gridcell" className="border-t border-slate-100 px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => onRemoveItem?.(item.id)}
                        className="text-slate-400 hover:text-red-600"
                        aria-label={`Remove ${item.id} from Q-matrix`}
                      >
                        <X size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* §5: "announce cell state changes." Polite, so it never
          interrupts the author mid-sentence. */}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </>
  );
}
