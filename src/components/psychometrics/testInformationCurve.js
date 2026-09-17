// D83 — curve helpers for test-information artefacts + Assembly requiredSEM.

/**
 * Flatten D78 payload.parameters.{theta,information,conditionalSEM} into
 * chart rows.
 */
export function curvePointsFromArtefact(artefact) {
  const params = artefact?.payload?.parameters || artefact?.parameters || {};
  const theta = Array.isArray(params.theta) ? params.theta : [];
  const information = Array.isArray(params.information) ? params.information : [];
  const conditionalSEM = Array.isArray(params.conditionalSEM)
    ? params.conditionalSEM
    : [];
  const n = Math.max(theta.length, information.length, conditionalSEM.length);
  const points = [];
  for (let i = 0; i < n; i += 1) {
    points.push({
      theta: theta[i],
      information: information[i] ?? null,
      conditionalSEM: conditionalSEM[i] ?? null,
    });
  }
  return points;
}

/**
 * Continuous Assembly targets that can overlay the SEM curve.
 * @returns {{ assemblyModelId: string, assemblyName: string, smvId: string, requiredSEM: number }[]}
 */
export function continuousSemTargetsFromAssemblyModels(assemblyModels = []) {
  const out = [];
  for (const am of assemblyModels) {
    for (const t of am.targetsBySMV || []) {
      if (typeof t.requiredSEM === "number" && Number.isFinite(t.requiredSEM)) {
        out.push({
          assemblyModelId: am.id,
          assemblyName: am.name || am.id,
          smvId: t.smvId || t.smvName || "(smv)",
          requiredSEM: t.requiredSEM,
        });
      }
    }
  }
  return out;
}

/**
 * Whether the bank's conditional SEM ever reaches the Assembly target.
 * Exit-check criterion: never-meets must be obvious without hand arithmetic.
 */
export function evaluateSemTarget(points, requiredSEM) {
  if (typeof requiredSEM !== "number" || !Number.isFinite(requiredSEM) || requiredSEM <= 0) {
    return {
      status: "no-target",
      meetsAnywhere: null,
      minSem: null,
      requiredSEM: null,
      message: "Select an Assembly Model continuous target to overlay requiredSEM.",
    };
  }

  const finite = (points || []).filter(
    (p) => typeof p.conditionalSEM === "number" && Number.isFinite(p.conditionalSEM)
  );
  if (!finite.length) {
    return {
      status: "no-curve",
      meetsAnywhere: null,
      minSem: null,
      requiredSEM,
      message: "This artefact has no finite conditional SEM values to compare.",
    };
  }

  const minSem = Math.min(...finite.map((p) => p.conditionalSEM));
  const meetsAnywhere = finite.some((p) => p.conditionalSEM <= requiredSEM);

  if (meetsAnywhere) {
    return {
      status: "meets-somewhere",
      meetsAnywhere: true,
      minSem,
      requiredSEM,
      message: `Conditional SEM reaches ≤ ${requiredSEM} somewhere on the plotted θ range (lowest SEM ≈ ${minSem.toFixed(3)}). Where the SEM curve sits at or below the dashed target, the bank can support accuracy stopping.`,
    };
  }

  return {
    status: "never-meets",
    meetsAnywhere: false,
    minSem,
    requiredSEM,
    message: `This bank never reaches SEM ≤ ${requiredSEM} across the plotted θ range (lowest SEM ≈ ${minSem.toFixed(3)}, entirely above the dashed target). Sessions will tend to stop on length, not accuracy — write items where I(θ) is thin.`,
  };
}

export function reliabilityFromArtefact(artefact) {
  const fit = artefact?.payload?.fitStatistics || {};
  const diagnostics = artefact?.payload?.diagnostics || {};
  return {
    kr20: typeof fit.kr20 === "number" ? fit.kr20 : null,
    marginalReliability:
      typeof fit.marginalReliability === "number" ? fit.marginalReliability : null,
    reliabilityNote: diagnostics.reliabilityNote || null,
    authority: diagnostics.authority || null,
  };
}
