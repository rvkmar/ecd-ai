// Fields a session list query asks Mongo (and the file / memory stores) to return.
//
// Catalog routes (GET /, /active, /archived, /mine) send the session object.
// The JSON is that object, so the projection keeps every field those payloads
// include, heavy ones included. responses and studentModel stay: the staff
// list reads response counts and finish eligibility (response.taskId), the
// carried-forward line, and the evidence inspector reads smvPosteriors.
// studentId and studentIds are what tenancy uses to resolve a district.
//
// The rating queue does not send the session. It sends blindedQueueRow.
// Tenancy still needs the assignee ids. Response subfields are only the ones
// that row reads. Leaving studentModel and the rest of each response out of
// the query is the point of the projection.

const INTERNAL_KEYS = new Set(["_id", "__v"]);

export const CATALOG_LIST_PROJECTION = Object.freeze({
  _id: 0,
  id: 1,
  studentId: 1,
  studentIds: 1,
  assignmentGroupId: 1,
  cohortId: 1,
  taskIds: 1,
  currentTaskIndex: 1,
  responses: 1,
  studentModel: 1,
  selectionStrategy: 1,
  nextTaskPolicy: 1,
  deliveryModelId: 1,
  assemblyProgress: 1,
  carryForward: 1,
  status: 1,
  isCompleted: 1,
  startedAt: 1,
  finishedAt: 1,
  autoFinished: 1,
  reviewedAt: 1,
  updatedAt: 1,
  stopped: 1,
  wizardPhaseTimings: 1,
  wizardPhase: 1,
  closure: 1,
  endTime: 1,
  districtId: 1,
  schoolId: 1,
});

export const RATING_QUEUE_PROJECTION = Object.freeze({
  _id: 0,
  id: 1,
  studentId: 1,
  studentIds: 1,
  "responses.taskId": 1,
  "responses.itemId": 1,
  "responses.observationId": 1,
  "responses.evaluationStatus": 1,
  "responses.rawAnswer": 1,
  "responses.pendingPhase.order": 1,
  "responses.pendingPhase.kind": 1,
  "responses.pendingPhase.rubricId": 1,
  "responses.pendingPhase.adjudicationRule": 1,
  "responses.automatedPhaseResult.activated": 1,
  "responses.humanPhaseResult.activated": 1,
  "responses.adjudicationApplied": 1,
});

function splitProjection(projection) {
  const top = new Set();
  const dotted = [];
  for (const [key, flag] of Object.entries(projection || {})) {
    if (flag !== 1 || INTERNAL_KEYS.has(key)) continue;
    const dot = key.indexOf(".");
    if (dot === -1) top.add(key);
    else dotted.push([key.slice(0, dot), key.slice(dot + 1)]);
  }
  const byRoot = new Map();
  for (const [root, rest] of dotted) {
    if (top.has(root)) continue;
    if (!byRoot.has(root)) byRoot.set(root, []);
    byRoot.get(root).push(rest);
  }
  return { top, byRoot };
}

// Copy an array element or object down to the requested relative paths.
// Array indexes stay put, including elements that keep none of those paths,
// so a later responseIndex still names the same response.
function projectValue(value, relPaths) {
  if (Array.isArray(value)) return value.map((item) => projectValue(item, relPaths));
  if (value == null || typeof value !== "object") return value;
  const direct = new Set();
  const nested = new Map();
  for (const path of relPaths) {
    const dot = path.indexOf(".");
    if (dot === -1) direct.add(path);
    else {
      const head = path.slice(0, dot);
      const tail = path.slice(dot + 1);
      if (!nested.has(head)) nested.set(head, []);
      nested.get(head).push(tail);
    }
  }
  const out = {};
  for (const key of Object.keys(value)) {
    if (direct.has(key)) out[key] = value[key];
    else if (nested.has(key)) out[key] = projectValue(value[key], nested.get(key));
  }
  return out;
}

// Source key order. A catalog session that only has these fields stringifies
// to the same bytes the list returned before the projection existed.
export function projectSession(doc, projection) {
  if (!doc || typeof doc !== "object" || !projection) return doc;
  const { top, byRoot } = splitProjection(projection);
  const out = {};
  for (const key of Object.keys(doc)) {
    if (INTERNAL_KEYS.has(key)) continue;
    if (top.has(key)) out[key] = doc[key];
    else if (byRoot.has(key)) out[key] = projectValue(doc[key], byRoot.get(key));
  }
  return out;
}
