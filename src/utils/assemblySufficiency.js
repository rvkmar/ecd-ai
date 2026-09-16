// src/utils/assemblySufficiency.js
//
// EM-R5: shared Assembly Model sufficiency floors for Evidence Models.
// Step 7 surfaces these as warnings; confirm / strict validation promotes
// matching cases to hard errors.

export const ASSEMBLY_SEM_MIN_OBSERVABLES = 3;
export const ASSEMBLY_CLASSIFICATION_MIN_OBSERVABLES = 2;

function competencyLabel(em, db) {
  const competency = db?.competencies?.find((c) => c.id === em.competencyId);
  return {
    competencyId: em.competencyId || competency?.id || null,
    competencyName:
      em.competencyName || competency?.name || competency?.label || null,
  };
}

function targetMatchesEm(target, em, db) {
  const { competencyId, competencyName } = competencyLabel(em, db);
  if (target?.smvId && competencyId && target.smvId === competencyId) return true;
  if (
    target?.smvName &&
    competencyName &&
    String(target.smvName).trim() === String(competencyName).trim()
  ) {
    return true;
  }
  return false;
}

/**
 * @param {object} em - evidence model draft / record
 * @param {object} db - db snapshot (needs assemblyModels; competencies help)
 * @returns {{ warnings: string[], errors: string[] }}
 *   warnings = soft (reviewed / Step 7); errors = confirm/strict floors
 */
export function evaluateAssemblySufficiency(em, db) {
  const warnings = [];
  const errors = [];
  const observables = em?.observables || [];
  const nObs = observables.length;
  const plan = em?.calibrationPlan;
  const hasPilotSize =
    plan &&
    typeof plan === "object" &&
    typeof plan.pilotSampleSize === "number" &&
    plan.pilotSampleSize > 0;
  const planEmpty =
    plan == null ||
    (typeof plan === "object" &&
      !Array.isArray(plan) &&
      Object.keys(plan).length === 0);

  const assemblies = db?.assemblyModels || [];
  for (const am of assemblies) {
    for (const t of am.targetsBySMV || []) {
      if (!targetMatchesEm(t, em, db)) continue;
      const amTag = am.name || am.id || "assembly";

      if (typeof t.requiredSEM === "number") {
        if (nObs < ASSEMBLY_SEM_MIN_OBSERVABLES) {
          const msg = `Assembly '${amTag}' requires SEM≤${t.requiredSEM}; ${nObs} observable(s) may be thin — expand evidence or calibrationPlan.`;
          warnings.push(msg);
          errors.push(
            `Assembly '${amTag}' SEM target needs at least ${ASSEMBLY_SEM_MIN_OBSERVABLES} observables (have ${nObs}).`
          );
        }
        if (planEmpty || !hasPilotSize) {
          // SEM targets still want a stated calibration plan at confirm.
          const msg = `Assembly '${amTag}' SEM target should declare calibrationPlan.pilotSampleSize before confirm.`;
          warnings.push(msg);
          errors.push(
            `Assembly '${amTag}' SEM target requires calibrationPlan.pilotSampleSize at confirm.`
          );
        }
      }

      if (typeof t.requiredClassificationAccuracy === "number") {
        if (!hasPilotSize) {
          const msg = `Assembly '${amTag}' requires classification accuracy ${t.requiredClassificationAccuracy}; set calibrationPlan.pilotSampleSize before confirm.`;
          warnings.push(msg);
          errors.push(
            `Assembly '${amTag}' classification target requires calibrationPlan.pilotSampleSize at confirm.`
          );
        }
        if (nObs < ASSEMBLY_CLASSIFICATION_MIN_OBSERVABLES) {
          const msg = `Assembly '${amTag}' classification target with only ${nObs} observable(s) is likely under-powered.`;
          warnings.push(msg);
          errors.push(
            `Assembly '${amTag}' classification target needs at least ${ASSEMBLY_CLASSIFICATION_MIN_OBSERVABLES} observables (have ${nObs}).`
          );
        }
      }
    }
  }

  return { warnings, errors };
}
