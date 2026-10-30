// server/delivery/sessionReportMeasurement.js
//
// D59: the measurement fields every session-level report shares.
// Classification is recomputed from stored posteriors (ADR 0004 / D57:
// nothing in attributeClassification.js is persisted as a second source
// of truth). The stop record is the one D58 already wrote on the session.
//
// This is not a second reporting stack and not a second stopping decision.
// reportsRoutes.js is the only HTTP caller.
//
// TU1: when the route passes db, each classifiable posterior is
// classified by classifyByRule (SMV cut, Assembly Model cut, mastery
// decisionRule, else 0.5). Without db the profile is the D59
// no-context classification at 0.5.

import {
  classifyAttributeProfile,
  classifyByRule,
  sourcesForPosterior,
} from "./attributeClassification.js";
import { attributeReportFields } from "./reportLevels.js";

const CLASSIFIABLE_METHOD = "attribute-mastery-posterior";

function posteriorRows(posteriors) {
  if (Array.isArray(posteriors)) return posteriors;
  if (posteriors && typeof posteriors === "object") return Object.values(posteriors);
  return [];
}

/**
 * Same row filter as classifyAttributeProfile. When a db is in hand,
 * each row is classified by classifyByRule so an authored cut replaces
 * 0.5. With no db, the no-context profile is unchanged.
 *
 * @param {object|null|undefined} session
 * @param {object|null|undefined} [db]
 */
function attributeProfileFor(session, db) {
  const posteriors = session?.studentModel?.smvPosteriors;
  if (!db) return classifyAttributeProfile(posteriors);

  const profile = [];
  for (const posterior of posteriorRows(posteriors)) {
    if (!posterior || typeof posterior !== "object") continue;
    if (posterior.supported === false) continue;
    if (posterior.method !== CLASSIFIABLE_METHOD) continue;

    const classified = classifyByRule(
      posterior.estimate,
      sourcesForPosterior(posterior, db, { session })
    );
    if (!classified) continue;

    profile.push({
      smvId: posterior.smvId,
      estimate: posterior.estimate,
      classification: classified.classification,
      expectedClassificationAccuracy: classified.expectedClassificationAccuracy,
      masteryThreshold: classified.threshold,
      ...attributeReportFields(posterior, db, session),
    });
  }
  return profile;
}

/**
 * @param {object|null|undefined} session
 * @param {object|null|undefined} [db] - when present, classification uses
 *   classifyByRule (SMV, Assembly Model, mastery decisionRule, else 0.5)
 * @returns {{
 *   stopped: object|null,
 *   attributeProfile: ReturnType<typeof classifyAttributeProfile>,
 * }}
 */
export function sessionMeasurementReport(session, db) {
  const stopped =
    session?.stopped && typeof session.stopped === "object" && !Array.isArray(session.stopped)
      ? session.stopped
      : null;

  let attributeProfile = attributeProfileFor(session, db);

  // A session that stopped on classification before posteriors were
  // persisted (or whose studentModel was later cleared) can still show
  // the profile D58 stored on the stop record. Prefer the live
  // recompute when it produced anything.
  if (attributeProfile.length === 0 && Array.isArray(stopped?.targets)) {
    attributeProfile = stopped.targets
      .filter((t) => t && t.smvId && t.classification)
      .map((t) => ({
        smvId: t.smvId,
        estimate: t.estimate,
        classification: t.classification,
        expectedClassificationAccuracy: t.expectedClassificationAccuracy ?? null,
        masteryThreshold: t.masteryThreshold,
      }));
  }

  return { stopped, attributeProfile };
}
