import React, { useState } from "react";
import { readAloudScript, speakAloud, stopAloud } from "./readAloudText.js";

/**
 * Toggle that reads the stem and options. Hidden unless the student's
 * accommodation asks for it. A browser without speechSynthesis does nothing.
 */
export default function ReadAloudButton({ stem, options, enabled = false }) {
  const [speaking, setSpeaking] = useState(false);
  if (!enabled) return null;
  const script = readAloudScript({ stem, options });
  if (!script) return null;

  function onClick() {
    if (speaking) {
      stopAloud();
      setSpeaking(false);
      return;
    }
    const utterance = speakAloud(script);
    if (!utterance) return;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={speaking}
      aria-label={speaking ? "Stop read aloud" : "Read aloud"}
      data-testid="read-aloud"
      className="rounded-md border border-current px-3 py-1 text-sm"
    >
      {speaking ? "Stop reading" : "Read aloud"}
    </button>
  );
}
