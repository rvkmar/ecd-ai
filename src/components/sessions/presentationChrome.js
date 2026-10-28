// src/components/sessions/presentationChrome.js
//
// D115: derive examinee-visible chrome from a Presentation Model overlay
// (the live object attached by /next-task). Pure, no React, so the
// "two models, one item" exit check can assert surface differences without
// mounting the full SessionPlayer.
//
// R3: layout, review, feedback timing, and the extra-time factor are part
// of this surface. A missing overlay, or a missing key on an overlay, keeps
// the pre-R3 player behaviour for that key. showProgress and allowSkip stay
// opt-in when an overlay is present (D115).

import {
  PRESENTATION_FEEDBACK_TIMING_VALUES,
  PRESENTATION_GROUPING_VALUES,
  PRESENTATION_ITEM_ORDER_VALUES,
  PRESENTATION_NAVIGATION_VALUES,
} from "../../utils/ecdVocabulary.js";

function oneOf(value, allowed) {
  return allowed.includes(value) ? value : null;
}

function clampTimeMultiplier(value) {
  return typeof value === "number" && value >= 1 && value <= 3 ? value : null;
}

/**
 * @param {object|null|undefined} presentation - overlay from /next-task
 *   (`presentationModelId`, `accessibility`, `conditionalDisplay`, layout)
 * @returns {{
 *   hasOverlay: boolean,
 *   presentationModelId: string|null,
 *   profile: string,
 *   fontScale: number,
 *   timeMultiplier: number,
 *   showProgress: boolean,
 *   allowSkip: boolean,
 *   allowReview: boolean,
 *   showFeedback: string,
 *   itemOrder: string|null,
 *   grouping: string|null,
 *   navigation: string|null,
 *   rootClassName: string,
 *   rootStyle: { fontSize?: string },
 *   dataAttrs: Record<string, string>,
 * }}
 */
export function presentationChrome(presentation) {
  const hasOverlay = Boolean(presentation && presentation.presentationModelId);
  const a11y = presentation?.accessibility || {};
  const cd = presentation?.conditionalDisplay || {};
  const layout = presentation?.layout || {};

  const profile = typeof a11y.profile === "string" && a11y.profile ? a11y.profile : "default";
  const fontScale =
    typeof a11y.fontScale === "number" && a11y.fontScale >= 1 && a11y.fontScale <= 2
      ? a11y.fontScale
      : 1;
  // Top-level timeMultiplier is the resolver field (R2 reads the same
  // number). accessibility.timeMultiplier is the authored source.
  const timeMultiplier =
    clampTimeMultiplier(presentation?.timeMultiplier) ||
    clampTimeMultiplier(a11y.timeMultiplier) ||
    1;

  // No overlay preserves pre-D115 player behaviour (progress + skip on).
  const showProgress = hasOverlay ? cd.showProgress === true : true;
  const allowSkip = hasOverlay ? cd.allowSkip === true : true;
  // Missing allowReview means the player may still go back. Only an
  // explicit false closes review.
  const allowReview = !hasOverlay || cd.allowReview !== false;
  const showFeedback = hasOverlay
    ? oneOf(cd.showFeedback, PRESENTATION_FEEDBACK_TIMING_VALUES) || "none"
    : "none";
  const itemOrder = hasOverlay
    ? oneOf(layout.itemOrder, PRESENTATION_ITEM_ORDER_VALUES)
    : null;
  const grouping = hasOverlay
    ? oneOf(layout.grouping, PRESENTATION_GROUPING_VALUES)
    : null;
  const navigation = hasOverlay
    ? oneOf(layout.navigation, PRESENTATION_NAVIGATION_VALUES)
    : null;

  const classes = ["presentation-chrome"];
  if (hasOverlay) {
    classes.push(`presentation-profile-${profile}`);
    if (profile === "large_text" || fontScale > 1) classes.push("presentation-large-text");
    if (profile === "high_contrast") classes.push("presentation-high-contrast");
  }

  const rootStyle = fontScale !== 1 ? { fontSize: `${fontScale}rem` } : {};

  return {
    hasOverlay,
    presentationModelId: presentation?.presentationModelId || null,
    profile,
    fontScale,
    timeMultiplier,
    showProgress,
    allowSkip,
    allowReview,
    showFeedback,
    itemOrder,
    grouping,
    navigation,
    rootClassName: classes.join(" "),
    rootStyle,
    dataAttrs: {
      "data-presentation-model-id": presentation?.presentationModelId || "",
      "data-presentation-profile": hasOverlay ? profile : "",
      "data-presentation-show-progress": showProgress ? "true" : "false",
      "data-presentation-allow-skip": allowSkip ? "true" : "false",
      "data-presentation-allow-review": allowReview ? "true" : "false",
      "data-presentation-show-feedback": showFeedback,
      "data-presentation-item-order": itemOrder || "",
      "data-presentation-grouping": grouping || "",
      "data-presentation-navigation": navigation || "",
      "data-presentation-time-multiplier": String(timeMultiplier),
    },
  };
}
