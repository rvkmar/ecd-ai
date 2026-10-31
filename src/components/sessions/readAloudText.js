// Text the read-aloud control speaks. Item stimulus and option labels,
// or a legacy question stem and its options. No scoring fields.

import { stimulusBlockText } from "../../utils/stimulusText.js";

export function readAloudScript({ stem, options } = {}) {
  const chunks = [];
  const prose = typeof stem === "string" ? stem.trim() : "";
  if (prose) chunks.push(prose);
  const labels = Array.isArray(options) ? options : [];
  labels.forEach((label, index) => {
    const text = String(label ?? "").trim();
    if (!text) return;
    chunks.push(`Option ${index + 1}. ${text}`);
  });
  return chunks.join(" ");
}

export function itemReadAloudParts(item) {
  const blocks = Array.isArray(item?.stimulus?.blocks) ? item.stimulus.blocks : [];
  const fromBlocks = blocks.map((block) => stimulusBlockText(block)).filter(Boolean).join("\n");
  const stem = fromBlocks || (typeof item?.stem === "string" ? item.stem : "");
  const components = Array.isArray(item?.interaction?.responseComponents)
    ? item.interaction.responseComponents
    : [];
  const options = components
    .map((opt) => opt?.label ?? opt?.text ?? "")
    .filter((label) => String(label).trim());
  return { stem, options };
}

export function questionReadAloudParts(question) {
  const stem = question?.stem || question?.prompt || "";
  const options = (question?.options || []).map((opt) =>
    typeof opt === "string" ? opt : opt?.label || opt?.text || ""
  );
  return { stem, options };
}

/**
 * Speak with the browser Speech Synthesis API. Returns the utterance
 * when speaking started, or null when the API is missing or throws.
 * Null is a no-op, not an error.
 */
export function speakAloud(text) {
  if (typeof window === "undefined") return null;
  const synth = window.speechSynthesis;
  if (!synth || typeof synth.speak !== "function") return null;
  const Utterance = window.SpeechSynthesisUtterance;
  if (typeof Utterance !== "function") return null;
  const script = String(text || "").trim();
  if (!script) return null;
  try {
    if (typeof synth.cancel === "function") synth.cancel();
    const utterance = new Utterance(script);
    synth.speak(utterance);
    return utterance;
  } catch {
    return null;
  }
}

export function stopAloud() {
  try {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    if (synth && typeof synth.cancel === "function") synth.cancel();
  } catch {
    // Unsupported speech engines can throw. Stopping is still a no-op.
  }
}
