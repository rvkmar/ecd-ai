// src/utils/modelActionLabel.js
// ------------------------------------------------------------
// One name for the "open this model" button, shared by all four
// model lists (Competency / Evidence / Task Model / Item) so the
// Manage tab reads the same way at every layer.
//
//   draft      → "Edit"    the model is still being authored.
//   reviewed   → "Review"  it was saved from the wizard's final step;
//                          reopening it is a review pass, and only
//                          that pass offers Lock & Confirm.
//   confirmed+ → "View"    locked. Structural changes require cloning.
//
// `locked` wins over `status`: an archived model carries locked:true
// and must never advertise an edit affordance.
// ------------------------------------------------------------

export function openActionLabel(model) {
    if (!model) return "View";
    if (model.locked) return "View";
    return model.status === "reviewed" ? "Review" : "Edit";
}

export function isReadOnlyModel(model) {
    return openActionLabel(model) === "View";
}

export default openActionLabel;
