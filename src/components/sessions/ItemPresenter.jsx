// src/components/sessions/ItemPresenter.jsx
//
// D47. Renders an ITEM for delivery — the ECD record — as opposed to the
// legacy `questions` record SessionPlayer has always rendered.
//
// WHY A SEPARATE COMPONENT rather than teaching the existing question
// renderer to also speak "item": the legacy delivery path must come
// through this cutover completely unchanged. It is still the path every
// real session uses, and it is the fallback if anything here is wrong.
// Two renderers with one shared submit path is a smaller blast radius
// than one renderer with two shapes threaded through it.
//
// WHAT THIS COMPONENT DELIBERATELY DOES NOT DO: score. It reports the
// examinee's raw response upward and nothing else. Scoring is
// identifyEvidence()'s job on the server, and the entire point of D47 is
// that the client stops having an opinion about correctness. There is no
// `correctOptionId` read anywhere in this file, and there should never be
// one.
//
// Presentation LOGIC (ordering, conditional display, the accessibility
// profile) belongs to the Presentation Model (D113 authored; D114 resolves
// the overlay on /next-task via presentationModelId pointer). SessionPlayer
// obedience is D115. This renders the item's own stimulus and interaction
// faithfully and stops there.

import React from "react";

// The raw answer shapes below are what sessionRoutes.js's /submit wraps
// into a work product:
//   scalar / array  -> { selected: <value> }
//   object          -> passed through unchanged
// identifyEvidence() then matches that against the item's
// evidenceActivationMap. Keeping the shapes here aligned with that
// wrapping is what makes an item scoreable without the client asserting
// anything about the result.

function StimulusBlocks({ stimulus }) {
  const blocks = Array.isArray(stimulus?.blocks) ? stimulus.blocks : [];
  if (blocks.length === 0) return null;

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        const key = block?.id || `block-${i}`;
        if (block?.type === "image" && block?.url) {
          return (
            <img
              key={key}
              src={block.url}
              alt={block.alt || ""}
              className="max-w-full rounded-md border border-border"
            />
          );
        }
        // text, and anything else with content, renders as prose. An
        // unknown block type is shown rather than silently dropped —
        // an examinee missing part of the stimulus is a measurement
        // problem, not a cosmetic one.
        return (
          <p key={key} className="text-sm leading-relaxed whitespace-pre-wrap">
            {block?.content ?? ""}
          </p>
        );
      })}
    </div>
  );
}

export default function ItemPresenter({ item, value, onChange, disabled = false }) {
  if (!item) return null;

  const type = item.interaction?.type;
  const components = Array.isArray(item.interaction?.responseComponents)
    ? item.interaction.responseComponents
    : [];

  const groupName = `item-${item.id}`;

  function renderInteraction() {
    switch (type) {
      case "mcq":
        return (
          <fieldset disabled={disabled} className="space-y-2">
            <legend className="sr-only">Select one answer</legend>
            {components.map((opt) => (
              <label
                key={opt.id}
                className="flex items-start gap-2 rounded-md border border-border p-3 cursor-pointer hover:bg-accent"
              >
                <input
                  type="radio"
                  name={groupName}
                  value={opt.id}
                  checked={value === opt.id}
                  onChange={() => onChange(opt.id)}
                  className="mt-1"
                />
                <span className="text-sm">{opt.label ?? opt.id}</span>
              </label>
            ))}
          </fieldset>
        );

      case "multiselect": {
        const selected = Array.isArray(value) ? value : [];
        return (
          <fieldset disabled={disabled} className="space-y-2">
            <legend className="sr-only">Select all that apply</legend>
            {components.map((opt) => (
              <label
                key={opt.id}
                className="flex items-start gap-2 rounded-md border border-border p-3 cursor-pointer hover:bg-accent"
              >
                <input
                  type="checkbox"
                  value={opt.id}
                  checked={selected.includes(opt.id)}
                  onChange={() =>
                    onChange(
                      selected.includes(opt.id)
                        ? selected.filter((s) => s !== opt.id)
                        : [...selected, opt.id]
                    )
                  }
                  className="mt-1"
                />
                <span className="text-sm">{opt.label ?? opt.id}</span>
              </label>
            ))}
          </fieldset>
        );
      }

      case "numeric":
        return (
          <div className="space-y-1">
            <label htmlFor={groupName} className="text-label block">
              Your answer
            </label>
            <input
              id={groupName}
              type="number"
              disabled={disabled}
              value={value ?? ""}
              onChange={(e) =>
                onChange(e.target.value === "" ? null : Number(e.target.value))
              }
              className="w-full rounded-md border border-border p-2 text-sm"
            />
          </div>
        );

      case "likert":
        return (
          <fieldset disabled={disabled} className="flex flex-wrap gap-2">
            <legend className="sr-only">Choose a rating</legend>
            {components.map((opt) => (
              <label
                key={opt.id}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-accent"
              >
                <input
                  type="radio"
                  name={groupName}
                  value={opt.id}
                  checked={value === opt.id}
                  onChange={() => onChange(opt.id)}
                />
                <span className="text-sm">{opt.label ?? opt.id}</span>
              </label>
            ))}
          </fieldset>
        );

      case "constructed":
        return (
          <div className="space-y-1">
            <label htmlFor={groupName} className="text-label block">
              Your response
            </label>
            <textarea
              id={groupName}
              rows={5}
              disabled={disabled}
              value={value ?? ""}
              onChange={(e) => onChange(e.target.value)}
              className="w-full rounded-md border border-border p-2 text-sm"
            />
          </div>
        );

      default:
        // Refuse rather than guess. An interaction type this component
        // cannot render must not silently present an unanswerable item
        // and record a null response as if the examinee had chosen it.
        return (
          <p className="text-sm text-destructive">
            This item uses an interaction type this player cannot present yet
            {type ? ` ("${type}")` : ""}. It has not been scored.
          </p>
        );
    }
  }

  return (
    <div className="space-y-4">
      <StimulusBlocks stimulus={item.stimulus} />
      {renderInteraction()}
    </div>
  );
}

// Exported for the submit path and for tests: an interaction type this
// component cannot render must not be submitted.
export function canPresentItem(item) {
  return ["mcq", "multiselect", "numeric", "likert", "constructed"].includes(
    item?.interaction?.type
  );
}
