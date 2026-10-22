export const taskModels = [
  {
    id: "tm-plant",
    name: "Plant part naming",
    versionNumber: 2,
    status: "operational",
    locked: true,
  },
  {
    id: "tm-frac",
    name: "Fractions",
    versionNumber: 1,
    status: "confirmed",
    locked: true,
  },
];

export const templates = [
  {
    id: "tpl-plant",
    name: "Plant part template",
    presentationModelId: "pm-ready",
  },
  {
    id: "tpl-frac",
    name: "Fraction template",
    presentationModelId: "pm-live",
  },
  {
    id: "tpl-orphan",
    name: "Orphan template",
    presentationModelId: "pm-missing",
  },
];

export const readyDraft = {
  id: "pm-ready",
  name: "Plant part presentation",
  description: "One item at a time, large type.",
  taskModelId: "tm-plant",
  taskModelVersion: 2,
  layout: { itemOrder: "authored", grouping: "single_item", navigation: "linear" },
  conditionalDisplay: {
    showFeedback: "immediate",
    allowSkip: false,
    allowReview: true,
    showProgress: true,
  },
  accessibility: { profile: "large_text", fontScale: 1.5, timeMultiplier: 1.5 },
  status: "draft",
  locked: false,
  versionNumber: 1,
  updatedAt: "2026-10-17T12:00:00.000Z",
};

export const reviewedModel = {
  id: "pm-reviewed",
  name: "Reviewed presentation",
  description: "Ready to lock.",
  taskModelId: "tm-plant",
  taskModelVersion: 2,
  layout: { itemOrder: "random", grouping: "section", navigation: "reviewable" },
  conditionalDisplay: {
    showFeedback: "delayed_end",
    allowSkip: true,
    allowReview: false,
    showProgress: false,
  },
  accessibility: { profile: "high_contrast", fontScale: 1.2 },
  status: "reviewed",
  locked: false,
  versionNumber: 1,
  updatedAt: "2026-10-17T18:00:00.000Z",
};

export const thinDraft = {
  id: "pm-thin",
  name: "Unfinished presentation",
  description: "",
  status: "draft",
  locked: false,
  layout: {},
  conditionalDisplay: {},
  accessibility: {},
  updatedAt: "2026-10-16T12:00:00.000Z",
};

export const confirmedModel = {
  id: "pm-confirmed",
  name: "Fraction presentation",
  description: "A locked fraction overlay.",
  taskModelId: "tm-frac",
  taskModelVersion: 1,
  layout: { itemOrder: "authored", grouping: "shared_stimulus", navigation: "free" },
  conditionalDisplay: {
    showFeedback: "none",
    allowSkip: true,
    allowReview: true,
    showProgress: true,
  },
  accessibility: { profile: "default" },
  status: "confirmed",
  locked: true,
  versionNumber: 1,
  updatedAt: "2026-10-15T12:00:00.000Z",
};

export const operationalModel = {
  id: "pm-live",
  name: "Live fraction presentation",
  description: "The operational overlay.",
  taskModelId: "tm-frac",
  taskModelVersion: 1,
  layout: { itemOrder: "random", grouping: "single_item", navigation: "linear" },
  conditionalDisplay: { showFeedback: "immediate", allowSkip: false, showProgress: true },
  accessibility: { profile: "screen_reader", fontScale: 2, timeMultiplier: 2 },
  status: "operational",
  locked: true,
  versionNumber: 2,
  parentModelId: "pm-confirmed",
  updatedAt: "2026-10-18T12:00:00.000Z",
};

export const presentationModels = [
  readyDraft,
  reviewedModel,
  thinDraft,
  confirmedModel,
  operationalModel,
];
