// src/components/sessions/presentationChrome.js
//
// D115: derive examinee-visible chrome from a Presentation Model overlay
// (the live object attached by /next-task). Pure — no React — so the
// "two models, one item" exit check can assert surface differences without
// mounting the full SessionPlayer.

/**
 * @param {object|null|undefined} presentation - overlay from /next-task
 *   (`presentationModelId`, `accessibility`, `conditionalDisplay`, …)
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
 *   rootClassName: string,
 *   rootStyle: { fontSize?: string },
 *   dataAttrs: Record<string, string>,
 * }}
 */
export function presentationChrome(presentation) {
  const hasOverlay = Boolean(presentation && presentation.presentationModelId);
  const a11y = presentation?.accessibility || {};
  const cd = presentation?.conditionalDisplay || {};

  const profile = typeof a11y.profile === "string" && a11y.profile ? a11y.profile : "default";
  const fontScale =
    typeof a11y.fontScale === "number" && a11y.fontScale >= 1 && a11y.fontScale <= 2
      ? a11y.fontScale
      : 1;
  const timeMultiplier =
    typeof a11y.timeMultiplier === "number" &&
    a11y.timeMultiplier >= 1 &&
    a11y.timeMultiplier <= 3
      ? a11y.timeMultiplier
      : 1;

  // No overlay → preserve pre-D115 player behaviour (progress + skip on).
  const showProgress = hasOverlay ? cd.showProgress === true : true;
  const allowSkip = hasOverlay ? cd.allowSkip === true : true;
  const allowReview = hasOverlay ? cd.allowReview === true : true;
  const showFeedback =
    hasOverlay && typeof cd.showFeedback === "string" ? cd.showFeedback : "none";

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
    rootClassName: classes.join(" "),
    rootStyle,
    dataAttrs: {
      "data-presentation-model-id": presentation?.presentationModelId || "",
      "data-presentation-profile": hasOverlay ? profile : "",
      "data-presentation-show-progress": showProgress ? "true" : "false",
      "data-presentation-allow-skip": allowSkip ? "true" : "false",
    },
  };
}
