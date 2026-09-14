// server/delivery/__tests__/evidenceAccumulation.test.js
//
// Day 31 (Week 7): Evidence Accumulation. The build reference puts this
// file at its highest effort tier because "wrong posteriors look entirely
// plausible" -- so these tests are deliberately not just "does it run".
// They are of three kinds:
//
//   1. A HAND-COMPUTED fixture. The expected EAP below is derived with
//      pen-and-paper arithmetic written out in the comment, on a grid
//      small enough to do by hand, and compared to full double precision.
//      This is the only test here that could catch a systematically wrong
//      but self-consistent implementation.
//   2. INVARIANTS that must hold for any correct posterior updater
//      regardless of its internals -- symmetry, prior recovery, monotone
//      precision, and the ordering of easy vs hard items. A plausible-
//      looking wrong answer usually violates at least one.
//   3. REFUSALS. Every case the module cannot compute correctly must come
//      back as `supported: false` with a reason, never as a number.

import { describe, it, expect } from "vitest";
import { accumulateEvidence, applyPosteriorsToSession, __testing__ } from "../evidenceAccumulation.js";
import { validateEntity } from "../../../src/utils/schema.js";

const { estimateContinuousPosterior, buildQuadrature, itemProbability, scoreResponse } = __testing__;

const RASCH = { a: 1, b: 0 };

function continuousSmv(overrides = {}) {
  return {
    id: "smv-theta",
    label: "Numerical Reasoning Ability",
    type: "continuous",
    scale: { min: -4, max: 4 },
    priorDistribution: { family: "normal", params: { mean: 0, sd: 1 } },
    ...overrides,
  };
}

function standardQuadrature(smv = continuousSmv()) {
  return buildQuadrature(smv);
}

/* ------------------------------------------------------------------
   1. THE HAND-COMPUTED FIXTURE
------------------------------------------------------------------ */

describe("estimateContinuousPosterior — hand-computed fixture", () => {
  it("reproduces an EAP derived by hand on a 3-point grid, to double precision", () => {
    // Grid:    theta in {-1, 0, 1}
    // Prior:   weights {0.25, 0.5, 0.25}
    // Item:    Rasch, b = 0, answered CORRECTLY (u = 1)
    //
    // P(u=1 | theta) = 1 / (1 + exp(-(theta - 0)))
    //   P(-1) = 1 / (1 + e^1)  = 0.268941421369995
    //   P( 0) = 0.5
    //   P( 1) = 1 / (1 + e^-1) = 0.731058578630005
    //
    // Posterior numerator (sum of theta * L * w):
    //   (-1)(0.268941421369995)(0.25) = -0.06723535534249875
    //   ( 0)(0.5              )(0.50) =  0
    //   ( 1)(0.731058578630005)(0.25) =  0.18276464465750125
    //   -------------------------------------------------
    //                                    0.1155292893150025
    //
    // Posterior denominator (sum of L * w):
    //   0.25 * 0.268941421369995 = 0.06723535534249875
    //   0.50 * 0.5               = 0.25
    //   0.25 * 0.731058578630005 = 0.18276464465750125
    //   ------------------------------------------------
    //                              0.5   (exactly: P(-1) + P(1) = 1)
    //
    // EAP = 0.1155292893150025 / 0.5 = 0.231058578630005
    const quadrature = { nodes: [-1, 0, 1], weights: [0.25, 0.5, 0.25] };
    const result = estimateContinuousPosterior([{ u: 1, params: RASCH }], quadrature);

    expect(result.estimate).toBeCloseTo(0.231058578630005, 15);
  });

  it("computes the item response function itself correctly at known points", () => {
    // The 3PL reduces to exactly 0.5 at theta = b regardless of a, and to
    // c + (1-c)/2 at theta = b with guessing.
    expect(itemProbability(0, { a: 1, b: 0 })).toBe(0.5);
    expect(itemProbability(0, { a: 2.5, b: 0 })).toBe(0.5);
    expect(itemProbability(0, { a: 1, b: 0, c: 0.25 })).toBeCloseTo(0.625, 15);
    // A missing `a` must default to 1 (Rasch), not 0 -- an a of 0 would
    // make every item carry no information at all, silently.
    expect(itemProbability(1, { b: 0 })).toBeCloseTo(0.731058578630005, 15);
  });
});

/* ------------------------------------------------------------------
   2. INVARIANTS
------------------------------------------------------------------ */

describe("estimateContinuousPosterior — invariants any correct updater must satisfy", () => {
  it("with no responses, returns the prior unchanged", () => {
    const result = estimateContinuousPosterior([], standardQuadrature());
    expect(result.estimate).toBeCloseTo(0, 10);
    // ~1, minus a small discretisation error from the finite grid.
    expect(result.sd).toBeGreaterThan(0.99);
    expect(result.sd).toBeLessThan(1.0);
  });

  it("is exactly antisymmetric: one symmetric item right vs wrong gives opposite estimates", () => {
    const q = standardQuadrature();
    const right = estimateContinuousPosterior([{ u: 1, params: RASCH }], q);
    const wrong = estimateContinuousPosterior([{ u: 0, params: RASCH }], q);

    expect(right.estimate + wrong.estimate).toBeCloseTo(0, 12);
    // Precision is unaffected by WHICH way a symmetric item was answered.
    expect(right.sd).toBeCloseTo(wrong.sd, 12);
  });

  it("precision strictly improves as responses accumulate", () => {
    const q = standardQuadrature();
    const sds = [1, 2, 5, 10, 40].map((n) => {
      const obs = Array.from({ length: n }, () => ({ u: 1, params: RASCH }));
      return estimateContinuousPosterior(obs, q).sd;
    });

    for (let i = 1; i < sds.length; i += 1) {
      expect(sds[i]).toBeLessThan(sds[i - 1]);
    }
    // And every one is tighter than the prior.
    expect(sds[0]).toBeLessThan(estimateContinuousPosterior([], q).sd);
  });

  it("the estimate rises monotonically with the number of correct responses", () => {
    const q = standardQuadrature();
    const estimates = [0, 1, 2, 5, 10].map((n) => {
      const obs = Array.from({ length: n }, () => ({ u: 1, params: RASCH }));
      return estimateContinuousPosterior(obs, q).estimate;
    });

    for (let i = 1; i < estimates.length; i += 1) {
      expect(estimates[i]).toBeGreaterThan(estimates[i - 1]);
    }
  });

  it("a correct answer to an EASY item is weaker evidence than a correct answer to a HARD one", () => {
    // The single most diagnostic IRT invariant: if this inverts, the sign
    // of (theta - b) is wrong somewhere, and every estimate is subtly
    // backwards in a way no smoke test would reveal.
    const q = standardQuadrature();
    const easy = estimateContinuousPosterior([{ u: 1, params: { a: 1, b: -2 } }], q);
    const hard = estimateContinuousPosterior([{ u: 1, params: { a: 1, b: 2 } }], q);

    expect(easy.estimate).toBeLessThan(hard.estimate);
    expect(easy.estimate).toBeGreaterThan(0);
  });

  it("a more discriminating item carries more information than a flat one", () => {
    const q = standardQuadrature();
    const flat = estimateContinuousPosterior([{ u: 1, params: { a: 0.3, b: 0 } }], q);
    const sharp = estimateContinuousPosterior([{ u: 1, params: { a: 2.5, b: 0 } }], q);

    expect(sharp.sd).toBeLessThan(flat.sd);
    expect(sharp.estimate).toBeGreaterThan(flat.estimate);
  });

  it("with a guessing parameter, right/wrong is NOT antisymmetric -- a wrong answer is stronger evidence", () => {
    // Day 32: the exact-antisymmetry invariant above holds only at c = 0.
    // With c > 0 the model itself is asymmetric -- P(correct) is floored at
    // c, so a WRONG answer rules out a wide swath of ability (nobody above
    // the floor should have missed it) while a CORRECT answer is
    // ambiguous (it might just be a guess). A right/wrong pair should
    // therefore move the estimate DOWN more than symmetrically, not land
    // back on the prior mean. If this ever comes out symmetric, `c` has
    // silently stopped affecting the likelihood.
    const q = standardQuadrature();
    const guessing = { a: 1.5, b: 0, c: 0.25 };
    const right = estimateContinuousPosterior([{ u: 1, params: guessing }], q);
    const wrong = estimateContinuousPosterior([{ u: 0, params: guessing }], q);

    expect(right.estimate + wrong.estimate).toBeLessThan(0);
    // Both responses are still informative in their own right.
    expect(right.estimate).toBeGreaterThan(0);
    expect(wrong.estimate).toBeLessThan(0);
  });

  it("a mixed pattern of right and wrong responses lands between all-right and all-wrong", () => {
    // Day 32: guards against an accumulation order bug -- log-likelihoods
    // must SUM regardless of the sequence they arrive in, so interleaving
    // matters only through the count of each outcome.
    const q = standardQuadrature();
    const allRight = estimateContinuousPosterior(
      Array.from({ length: 10 }, () => ({ u: 1, params: RASCH })), q
    );
    const allWrong = estimateContinuousPosterior(
      Array.from({ length: 10 }, () => ({ u: 0, params: RASCH })), q
    );
    const mixed = estimateContinuousPosterior(
      Array.from({ length: 10 }, (_, i) => ({ u: i % 2, params: RASCH })), q
    );
    const shuffled = estimateContinuousPosterior(
      [1, 0, 1, 1, 0, 0, 0, 1, 1, 0].map((u) => ({ u, params: RASCH })), q
    );

    expect(mixed.estimate).toBeGreaterThan(allWrong.estimate);
    expect(mixed.estimate).toBeLessThan(allRight.estimate);
    // A five-and-five split against a symmetric item's prior is the prior
    // mean exactly, by the same antisymmetry as above.
    expect(mixed.estimate).toBeCloseTo(0, 10);
    // Order does not matter, only counts do.
    expect(shuffled.estimate).toBeCloseTo(mixed.estimate, 12);
    expect(shuffled.sd).toBeCloseTo(mixed.sd, 12);
  });
});

/* ------------------------------------------------------------------
   NUMERICAL STABILITY
------------------------------------------------------------------ */

describe("estimateContinuousPosterior — numerical stability", () => {
  it("does not underflow to NaN with a long session", () => {
    // The naive implementation (multiplying raw probabilities) underflows
    // to exactly 0 at every node well before 400 items, at which point the
    // normalisation is 0/0. This is why the likelihood is accumulated in
    // log space and re-centred on its maximum.
    const q = standardQuadrature();
    const obs = Array.from({ length: 400 }, () => ({ u: 1, params: RASCH }));
    const result = estimateContinuousPosterior(obs, q);

    expect(Number.isFinite(result.estimate)).toBe(true);
    expect(Number.isFinite(result.sd)).toBe(true);
    expect(result.sd).toBeGreaterThan(0);
  });

  it("survives a 3PL at extreme theta, where the raw probability saturates", () => {
    const q = buildQuadrature(continuousSmv({ scale: { min: -20, max: 20 } }));
    const obs = [{ u: 0, params: { a: 3, b: 0, c: 0 } }];
    const result = estimateContinuousPosterior(obs, q);

    expect(Number.isFinite(result.estimate)).toBe(true);
    expect(Number.isFinite(result.sd)).toBe(true);
  });

  it("never returns a negative standard deviation", () => {
    const q = standardQuadrature();
    const obs = Array.from({ length: 200 }, (_, i) => ({ u: i % 2, params: RASCH }));
    expect(estimateContinuousPosterior(obs, q).sd).toBeGreaterThanOrEqual(0);
  });
});

/* ------------------------------------------------------------------
   GRID ADEQUACY — three defects found by an adversarial pass on Day 31,
   all of which produced a WRONG BUT ENTIRELY PLAUSIBLE posterior. Each
   is pinned here against an independent reference implementation
   (brute-force numerical integration on a very fine grid over a very wide
   range) rather than against the module's own arithmetic, so a future
   regression cannot hide behind a self-consistent answer.
------------------------------------------------------------------ */

/* Deliberately naive, deliberately independent. Its step (0.001) is 250x
   finer than the module's own (prior SD / 4 = 0.25), so the residual
   disagreement between them IS the module's discretisation error.
   Measured at ~1.4e-6 logits -- utterly negligible next to a standard
   error of ~0.9, and six orders of magnitude smaller than the truncation
   defects these tests exist to prevent (0.65 and 0.41 logits). The
   assertions below therefore compare against a PSYCHOMETRICALLY MEANINGFUL
   criterion rather than an arbitrary decimal count: the disagreement must
   be a negligible fraction of the standard error being reported alongside
   it. An estimate that is within 0.1% of one SE of the true posterior mean
   is, for any purpose this system has, the same number -- while the
   defects these tests guard against were off by 1.5 and 0.9 SEs. */
const NEGLIGIBLE_FRACTION_OF_SE = 1e-3;

function expectAgreesWithReference(mine, reference) {
  expect(Math.abs(mine.estimate - reference.eap)).toBeLessThan(reference.sd * NEGLIGIBLE_FRACTION_OF_SE);
  expect(Math.abs(mine.sd - reference.sd)).toBeLessThan(reference.sd * NEGLIGIBLE_FRACTION_OF_SE);
}

function referencePosterior(observations, { mean = 0, sd = 1, lo = -12, hi = 12, n = 24001 } = {}) {
  const step = (hi - lo) / (n - 1);
  const p3pl = (theta, params) => {
    const a = params.a ?? 1;
    const b = params.b ?? 0;
    const c = params.c ?? 0;
    return c + (1 - c) / (1 + Math.exp(-a * (theta - b)));
  };

  const weighted = [];
  for (let i = 0; i < n; i += 1) {
    const theta = lo + i * step;
    let logLik = 0;
    for (const o of observations) {
      const p = Math.min(Math.max(p3pl(theta, o.params), 1e-300), 1 - 1e-16);
      logLik += o.u === 1 ? Math.log(p) : Math.log(1 - p);
    }
    const z = (theta - mean) / sd;
    weighted.push({ theta, w: Math.exp(logLik) * Math.exp(-0.5 * z * z) });
  }

  const den = weighted.reduce((acc, v) => acc + v.w, 0);
  const eap = weighted.reduce((acc, v) => acc + v.theta * v.w, 0) / den;
  const variance = weighted.reduce((acc, v) => acc + (v.theta - eap) ** 2 * v.w, 0) / den;
  return { eap, sd: Math.sqrt(variance) };
}

describe("grid adequacy — posteriors that used to be silently wrong", () => {
  it("does not truncate a posterior that sits beyond the initial grid", () => {
    // BEFORE THE FIX: 400 consecutive correct Rasch responses returned
    // 3.8999 +/- 0.1468 -- the grid stopped at +4, so the estimate was
    // pinned near the edge and, worse, the SD was understated THREE-FOLD
    // because the tail carrying the uncertainty had been cut off. A
    // truncated posterior looks more precise than the real one, which is
    // the dangerous direction for an ability estimate to be wrong in.
    const observations = Array.from({ length: 400 }, () => ({ u: 1, params: RASCH }));
    const mine = __testing__.estimateWithAdaptiveGrid(observations, continuousSmv());
    const reference = referencePosterior(observations);

    expectAgreesWithReference(mine, reference);
    // Sanity: the true answer really is outside the original [-4, 4] grid.
    expect(reference.eap).toBeGreaterThan(4);
    expect(mine.boundaryLimited).toBe(false);
  });

  it("agrees with independent numerical integration across session lengths", () => {
    for (const n of [1, 10, 40, 100]) {
      const observations = Array.from({ length: n }, () => ({ u: 1, params: RASCH }));
      const mine = __testing__.estimateWithAdaptiveGrid(observations, continuousSmv());
      const reference = referencePosterior(observations);

      expectAgreesWithReference(mine, reference);
    }
  });

  it("a wide declared scale no longer destroys the grid's resolution", () => {
    // BEFORE THE FIX: declaring scale [-100, 100] -- a perfectly
    // reasonable authoring choice -- gave a step of 5.0 against a prior SD
    // of 1.0. The recovered prior SD was 0.0137 instead of 1.0, and a
    // correct response moved the estimate by 0.0000 instead of 0.41. The
    // measurement was destroyed, and reported as `supported: true`.
    const smv = continuousSmv({ scale: { min: -100, max: 100 } });
    const q = buildQuadrature(smv);

    const priorMean = q.nodes.reduce((acc, t, i) => acc + t * q.weights[i], 0);
    const priorSd = Math.sqrt(q.nodes.reduce((acc, t, i) => acc + (t - priorMean) ** 2 * q.weights[i], 0));
    expect(priorSd).toBeCloseTo(1, 4);

    const mine = __testing__.estimateWithAdaptiveGrid([{ u: 1, params: RASCH }], smv);
    expectAgreesWithReference(mine, referencePosterior([{ u: 1, params: RASCH }]));
  });

  it("resolves a narrow prior instead of sampling it at three points", () => {
    // BEFORE THE FIX: a prior SD of 0.1 against a fixed step of 0.2 meant
    // the step was twice the whole prior SD.
    const smv = continuousSmv({ priorDistribution: { family: "normal", params: { mean: 0, sd: 0.1 } } });
    const q = buildQuadrature(smv);

    const priorMean = q.nodes.reduce((acc, t, i) => acc + t * q.weights[i], 0);
    const priorSd = Math.sqrt(q.nodes.reduce((acc, t, i) => acc + (t - priorMean) ** 2 * q.weights[i], 0));

    expect(priorSd).toBeCloseTo(0.1, 5);
    expect(q.meta.step).toBeLessThanOrEqual(0.1 / 2);
  });

  it("keeps the step proportional to the prior SD however wide the span", () => {
    for (const sd of [0.05, 0.5, 1, 5]) {
      const q = buildQuadrature(continuousSmv({
        scale: { min: -1000, max: 1000 },
        priorDistribution: { family: "normal", params: { mean: 0, sd } },
      }));
      expect(q.meta.step).toBeLessThanOrEqual(sd / 2);
    }
  });

  it("flags a boundary-limited posterior rather than reporting it as a point measurement", () => {
    // A uniform prior's support cannot be widened -- the posterior really
    // is pinned at the edge. That is a property of the author's chosen
    // prior, not a grid defect, but the caller still must be able to tell
    // "at least this high" from "this high".
    const smv = continuousSmv({ priorDistribution: { family: "uniform", params: { min: -1, max: 1 } } });
    const observations = Array.from({ length: 200 }, () => ({ u: 1, params: { a: 2, b: 0 } }));
    const result = __testing__.estimateWithAdaptiveGrid(observations, smv);

    expect(result.boundaryLimited).toBe(true);
    expect(result.estimate).toBeLessThanOrEqual(1);
  });

  it("surfaces boundaryLimited through the full accumulate path", () => {
    const db = makeDb();
    db.competencyModels[0].smVariables = [
      continuousSmv({ priorDistribution: { family: "uniform", params: { min: -1, max: 1 } } }),
    ];
    const responses = Array.from({ length: 60 }, (_, i) =>
      makeResponse({ itemId: `i${i}`, activated: true })
    );

    const { posteriors } = accumulateEvidence(sessionWith(responses), db);
    expect(posteriors[0].supported).toBe(true);
    expect(posteriors[0].boundaryLimited).toBe(true);
  });

  it("reports boundaryLimited: false for an ordinary session", () => {
    const { posteriors } = accumulateEvidence(sessionWith([makeResponse()]), makeDb());
    expect(posteriors[0].boundaryLimited).toBe(false);
  });

  it("Day 32: widening and posterior-adaptive refinement compose correctly", () => {
    // A case that needs BOTH fixes at once: the true posterior sits well
    // outside the initial grid (forcing several widening doublings) AND
    // ends up narrow enough, relative to the prior, that the widened grid's
    // own step could not resolve it without the refinement pass on top.
    // Each fix was verified in isolation; this pins that composing them
    // doesn't reintroduce either defect (e.g. refining around an estimate
    // that was itself still truncated).
    const smv = continuousSmv({ priorDistribution: { family: "normal", params: { mean: 0, sd: 1 } } });
    const observations = Array.from({ length: 300 }, () => ({ u: 1, params: { a: 4, b: 6 } }));

    const mine = __testing__.estimateWithAdaptiveGrid(observations, smv);
    const reference = referencePosterior(observations, { mean: 0, sd: 1, lo: -20, hi: 20, n: 80001 });

    expect(reference.eap).toBeGreaterThan(4); // confirms the initial grid could not have reached it
    expect(mine.boundaryLimited).toBe(false);
    expect(mine.refined).toBe(true);
    expectAgreesWithReference(mine, reference);
  });
});

/* ------------------------------------------------------------------
   DIRECTION AND EXCLUSION SEMANTICS
------------------------------------------------------------------ */

describe("scoreResponse — direction is honoured, not assumed", () => {
  it("scores a supports-direction activation as evidence FOR", () => {
    expect(scoreResponse({ activated: true, direction: "supports" }).u).toBe(1);
    expect(scoreResponse({ activated: false, direction: "supports" }).u).toBe(0);
  });

  it("scores a weakens-direction activation as evidence AGAINST", () => {
    // Treating every activation as u=1 would silently invert every
    // weakens-direction observable in the model.
    expect(scoreResponse({ activated: true, direction: "weakens" }).u).toBe(0);
    expect(scoreResponse({ activated: false, direction: "weakens" }).u).toBe(1);
  });

  it("excludes a neutral-direction response rather than guessing a sign", () => {
    expect(scoreResponse({ activated: true, direction: "neutral" }).u).toBeNull();
  });

  it("excludes an indeterminate response instead of scoring it as incorrect", () => {
    // `activated: null` is Day 27's "the work product matched no declared
    // pattern". Scoring that as 0 would bias every estimate downward
    // exactly where the item bank is weakest.
    expect(scoreResponse({ activated: null, direction: "supports" }).u).toBeNull();
    expect(scoreResponse({ direction: "supports" }).u).toBeNull();
  });

  it("excludes a response whose direction is missing or unrecognised", () => {
    expect(scoreResponse({ activated: true }).u).toBeNull();
    expect(scoreResponse({ activated: true, direction: "sideways" }).u).toBeNull();
  });
});

/* ------------------------------------------------------------------
   QUADRATURE FROM THE SMV'S OWN DECLARED PRIOR
------------------------------------------------------------------ */

describe("buildQuadrature — the prior comes from the SMV, not a hardcoded default", () => {
  it("centres the grid on a non-zero declared prior mean", () => {
    const smv = continuousSmv({
      scale: { min: -10, max: 10 },
      priorDistribution: { family: "normal", params: { mean: 2, sd: 0.5 } },
    });
    const q = buildQuadrature(smv);
    const priorMean = q.nodes.reduce((acc, t, i) => acc + t * q.weights[i], 0);

    expect(priorMean).toBeCloseTo(2, 6);
  });

  it("honours a declared prior standard deviation", () => {
    const wide = buildQuadrature(continuousSmv({
      scale: { min: -10, max: 10 },
      priorDistribution: { family: "normal", params: { mean: 0, sd: 2 } },
    }));
    const narrow = buildQuadrature(continuousSmv({
      scale: { min: -10, max: 10 },
      priorDistribution: { family: "normal", params: { mean: 0, sd: 0.5 } },
    }));

    const sdOf = (q) => {
      const m = q.nodes.reduce((acc, t, i) => acc + t * q.weights[i], 0);
      return Math.sqrt(q.nodes.reduce((acc, t, i) => acc + (t - m) ** 2 * q.weights[i], 0));
    };

    expect(sdOf(wide)).toBeGreaterThan(sdOf(narrow));
    expect(sdOf(narrow)).toBeCloseTo(0.5, 1);
  });

  it("supports a uniform prior", () => {
    const q = buildQuadrature(continuousSmv({
      priorDistribution: { family: "uniform", params: { min: -1, max: 1 } },
    }));
    expect(q.nodes[0]).toBe(-1);
    expect(q.nodes[q.nodes.length - 1]).toBe(1);
    expect(q.weights.every((w) => Math.abs(w - q.weights[0]) < 1e-12)).toBe(true);
  });

  it("returns null (rather than a default prior) for a family it cannot grid", () => {
    // Silently substituting N(0,1) here would report a posterior the
    // author never asked for, under their variable's name.
    expect(buildQuadrature(continuousSmv({ priorDistribution: { family: "beta", params: { alpha: 2, beta: 2 } } }))).toBeNull();
    expect(buildQuadrature(continuousSmv({ priorDistribution: undefined }))).toBeNull();
  });

  it("widens a declared scale that would clip the prior's own mass", () => {
    // Truncating the prior understates the posterior SD -- the dangerous
    // direction to be wrong in, since it overstates confidence.
    const q = buildQuadrature(continuousSmv({
      scale: { min: -0.5, max: 0.5 },
      priorDistribution: { family: "normal", params: { mean: 0, sd: 1 } },
    }));
    expect(q.nodes[0]).toBeLessThanOrEqual(-4);
    expect(q.nodes[q.nodes.length - 1]).toBeGreaterThanOrEqual(4);
  });
});

/* ------------------------------------------------------------------
   3. REFUSALS — the end-to-end dispatch
------------------------------------------------------------------ */

function makeDb(overrides = {}) {
  return {
    competencyModels: [{
      id: "cm1",
      versionNumber: 1,
      smVariables: [continuousSmv()],
    }],
    competencies: [{ id: "c1", modelId: "cm1" }],
    evidenceModels: [{
      id: "em1",
      competencyId: "c1",
      versionNumber: 1,
      observables: [
        { id: "o1", evidenceRule: { direction: "supports", strengthLevel: 4 } },
      ],
      statisticalModels: [{
        id: "sm1",
        type: "irt",
        active: true,
        structureConfig: {},
        parameterSets: [{
          parameterSetId: "ps1",
          parameters: { o1: { a: 1, b: 0 } },
          packageVersion: "pilot-1",
          converged: true,
          sampleSize: 500,
          calibratedAt: "2026-01-01T00:00:00.000Z",
        }],
        activeParameterSetId: "ps1",
      }],
    }],
    ...overrides,
  };
}

function makeResponse(overrides = {}) {
  return {
    taskId: "t1",
    itemId: "item1",
    evidenceModelId: "em1",
    parameterSetId: "ps1",
    observationId: "o1",
    observableId: "o1",
    activated: true,
    direction: "supports",
    strength: 4,
    ...overrides,
  };
}

function sessionWith(responses) {
  return { id: "s1", status: "in_progress", responses };
}

describe("accumulateEvidence — the happy path", () => {
  it("produces an estimate AND a precision for a continuous SMV", () => {
    const { posteriors, warnings } = accumulateEvidence(sessionWith([makeResponse()]), makeDb());

    expect(warnings).toEqual([]);
    expect(posteriors).toHaveLength(1);
    expect(posteriors[0]).toMatchObject({
      smvId: "smv-theta",
      smvType: "continuous",
      evidenceModelId: "em1",
      parameterSetId: "ps1",
      modelFamily: "irt",
      method: "eap",
      supported: true,
      responsesUsed: 1,
    });
    // An estimate without a precision is not a posterior -- both are
    // required by the build reference's own wording.
    expect(Number.isFinite(posteriors[0].estimate)).toBe(true);
    expect(posteriors[0].precision).toBeGreaterThan(0);
    expect(posteriors[0].sem).toBe(posteriors[0].precision);
  });

  it("moves the estimate up on a correct response and down on an incorrect one", () => {
    const up = accumulateEvidence(sessionWith([makeResponse({ activated: true })]), makeDb());
    const down = accumulateEvidence(sessionWith([makeResponse({ activated: false })]), makeDb());

    expect(up.posteriors[0].estimate).toBeGreaterThan(0);
    expect(down.posteriors[0].estimate).toBeLessThan(0);
  });

  it("tightens precision as more responses arrive", () => {
    const one = accumulateEvidence(sessionWith([makeResponse()]), makeDb());
    const three = accumulateEvidence(
      sessionWith([
        makeResponse({ itemId: "i1" }),
        makeResponse({ itemId: "i2" }),
        makeResponse({ itemId: "i3" }),
      ]),
      makeDb()
    );

    expect(three.posteriors[0].precision).toBeLessThan(one.posteriors[0].precision);
    expect(three.posteriors[0].responsesUsed).toBe(3);
  });

  it("counts, rather than silently drops, responses it excluded", () => {
    const { posteriors } = accumulateEvidence(
      sessionWith([
        makeResponse({ itemId: "i1" }),
        makeResponse({ itemId: "i2", activated: null }),
      ]),
      makeDb()
    );

    expect(posteriors[0].responsesUsed).toBe(1);
    expect(posteriors[0].responsesExcluded).toBe(1);
  });

  it("returns no posteriors at all for a session with no item-based responses", () => {
    const { posteriors } = accumulateEvidence(sessionWith([]), makeDb());
    expect(posteriors).toEqual([]);
  });
});

describe("accumulateEvidence — refuses rather than guessing", () => {
  it("refuses an unimplemented model family with an explicit marker, not a number", () => {
    // The single most important property in this file: a family with no
    // implementation must not come back as a plausible estimate.
    //
    // Day 36 note: this test used to pin "gdina", which is now implemented
    // (see attributeAccumulation.test.js). Rather than delete the test --
    // the property it guards is the whole point of the dispatch -- it now
    // pins the family that IS still unimplemented. `bayesian_network` is a
    // real entry in schema.js's allowed statisticalModels types with no
    // accumulation branch behind it.
    const db = makeDb();
    db.evidenceModels[0].statisticalModels[0].type = "bayesian_network";

    const { posteriors } = accumulateEvidence(sessionWith([makeResponse()]), db);

    expect(posteriors[0].supported).toBe(false);
    expect(posteriors[0].reason).toMatch(/'bayesian_network' model family is not implemented yet/);
    expect(posteriors[0]).not.toHaveProperty("estimate");
    expect(posteriors[0]).not.toHaveProperty("precision");
  });

  it("no longer refuses gdina outright -- it now dispatches to the attribute-mastery branch", () => {
    // The inverted half of the test above. A gdina model with no Q-matrix
    // still refuses, but for a SPECIFIC, actionable reason from the new
    // branch, not the generic "not implemented yet" marker.
    const db = makeDb();
    db.evidenceModels[0].statisticalModels[0].type = "gdina";

    const { posteriors } = accumulateEvidence(sessionWith([makeResponse()]), db);

    expect(posteriors[0].supported).toBe(false);
    expect(posteriors[0].reason).not.toMatch(/not implemented yet/);
    expect(posteriors[0].reason).toMatch(/declares no structureConfig\.qMatrixId/);
  });

  // D53b: the dispatch-level test for the 'dina' pilot path -- makeContext
  // in attributeAccumulation.test.js exercises accumulateAttributeMastery
  // directly; this exercises the branch in THIS file that decides to call
  // it with a synthetic pilot parameterSet built from each response's
  // pinned r.pilotParams, rather than refusing outright.
  it("dispatches a 'dina' group with no parameterSetId but a pinned pilot snapshot to the attribute-mastery branch", () => {
    const db = {
      competencyModels: [{
        id: "cm1", versionNumber: 1,
        smVariables: [{ id: "attr-a", type: "binary", priorDistribution: { family: "bernoulli", params: { p: 0.5 } } }],
      }],
      competencies: [{ id: "c1", modelId: "cm1" }],
      evidenceModels: [{
        id: "em1", competencyId: "c1", versionNumber: 1,
        observables: [{ id: "o1", evidenceRule: { direction: "supports", strengthLevel: 4 } }],
        statisticalModels: [{
          id: "sm1", type: "dina", active: true,
          structureConfig: { qMatrixId: "qm1" }, parameterSets: [],
        }],
      }],
      qMatrixModels: [{
        id: "qm1", competencyModelId: "cm1", attributeIds: ["attr-a"],
        entries: [{ itemId: "item1", attributeId: "attr-a" }],
      }],
    };

    const response = {
      taskId: "t1", itemId: "item1", evidenceModelId: "em1",
      parameterSetId: null, parameterSource: "pilot",
      pilotParams: { slip: 0.1, guess: 0.2 },
      observationId: "o1", observableId: "o1", activated: true, direction: "supports", strength: 4,
    };

    const { posteriors } = accumulateEvidence(sessionWith([response]), db);

    expect(posteriors).toHaveLength(1);
    expect(posteriors[0].supported).toBe(true);
    expect(posteriors[0].parameterSource).toBe("pilot");
    expect(posteriors[0].modelFamily).toBe("dina");
    expect(posteriors[0].smvId).toBe("attr-a");
  });

  it("refuses when responses cite two different parameter sets", () => {
    // A session that spanned a recalibration. Averaging over mixed
    // calibrations would produce a number with no interpretation.
    const db = makeDb();
    db.evidenceModels[0].statisticalModels[0].parameterSets.push({
      parameterSetId: "ps2",
      parameters: { o1: { a: 1.2, b: 0.1 } },
      packageVersion: "pilot-2",
      converged: true,
      sampleSize: 900,
      calibratedAt: "2026-06-01T00:00:00.000Z",
    });

    const { posteriors } = accumulateEvidence(
      sessionWith([makeResponse({ itemId: "i1" }), makeResponse({ itemId: "i2", parameterSetId: "ps2" })]),
      db
    );

    expect(posteriors[0].supported).toBe(false);
    expect(posteriors[0].reason).toMatch(/2 different parameter sets/);
  });

  it("refuses when the competency model declares several continuous SMVs and nothing says which", () => {
    const db = makeDb();
    db.competencyModels[0].smVariables = [
      continuousSmv({ id: "theta-a" }),
      continuousSmv({ id: "theta-b" }),
    ];

    const { posteriors } = accumulateEvidence(sessionWith([makeResponse()]), db);

    expect(posteriors[0].supported).toBe(false);
    expect(posteriors[0].reason).toMatch(/Refusing to guess/);
  });

  it("honours an explicit smvId binding when the statistical model declares one", () => {
    const db = makeDb();
    db.competencyModels[0].smVariables = [
      continuousSmv({ id: "theta-a" }),
      continuousSmv({ id: "theta-b" }),
    ];
    db.evidenceModels[0].statisticalModels[0].structureConfig = { smvId: "theta-b" };

    const { posteriors } = accumulateEvidence(sessionWith([makeResponse()]), db);

    expect(posteriors[0].supported).toBe(true);
    expect(posteriors[0].smvId).toBe("theta-b");
  });

  it("refuses an smvId binding that points at a non-continuous SMV", () => {
    const db = makeDb();
    db.competencyModels[0].smVariables = [
      { id: "attr-1", type: "binary", scale: { states: ["no", "yes"] }, priorDistribution: { family: "bernoulli", params: { p: 0.5 } } },
    ];
    db.evidenceModels[0].statisticalModels[0].structureConfig = { smvId: "attr-1" };

    const { posteriors } = accumulateEvidence(sessionWith([makeResponse()]), db);

    expect(posteriors[0].supported).toBe(false);
    expect(posteriors[0].reason).toMatch(/bound to 'attr-1', a 'binary' Student Model Variable/);
  });

  it("refuses when the competency model declares no SMVs at all", () => {
    const db = makeDb();
    db.competencyModels[0].smVariables = [];

    const { posteriors } = accumulateEvidence(sessionWith([makeResponse()]), db);

    expect(posteriors[0].supported).toBe(false);
    expect(posteriors[0].reason).toMatch(/declares no smVariables/);
  });

  it("refuses when no response records the parameter set it was scored against", () => {
    const { posteriors } = accumulateEvidence(
      sessionWith([makeResponse({ parameterSetId: undefined })]),
      makeDb()
    );

    expect(posteriors[0].supported).toBe(false);
    expect(posteriors[0].reason).toMatch(/records the parameterSetId it was scored against/);
  });

  it("refuses when the cited parameter set belongs to no statistical model", () => {
    const { posteriors } = accumulateEvidence(
      sessionWith([makeResponse({ parameterSetId: "ps-ghost" })]),
      makeDb()
    );

    expect(posteriors[0].supported).toBe(false);
    expect(posteriors[0].reason).toMatch(/owns parameter set 'ps-ghost'/);
  });

  it("refuses when every response was excluded, rather than reporting the prior as if it were a measurement", () => {
    // Reporting the prior back as a posterior would be a real, subtle
    // error: it looks like a measurement but contains no data.
    const { posteriors } = accumulateEvidence(
      sessionWith([makeResponse({ activated: null })]),
      makeDb()
    );

    expect(posteriors[0].supported).toBe(false);
    expect(posteriors[0].reason).toMatch(/no posterior is reported/);
    expect(posteriors[0]).not.toHaveProperty("estimate");
  });

  it("warns and excludes a response whose observable has no calibrated parameters", () => {
    const { posteriors, warnings } = accumulateEvidence(
      sessionWith([makeResponse({ observableId: "o-uncalibrated" })]),
      makeDb()
    );

    expect(warnings.join(" ")).toMatch(/no parameters for observable 'o-uncalibrated'/);
    expect(posteriors[0].supported).toBe(false);
  });

  it("throws only for programmer errors, never for data problems", () => {
    expect(() => accumulateEvidence(null, makeDb())).toThrow(/requires a session/);
    expect(() => accumulateEvidence(sessionWith([]), null)).toThrow(/requires a db snapshot/);
  });
});

describe("accumulateEvidence — reproducibility", () => {
  it("uses the parameter set the response was SCORED against, not whichever is active now", () => {
    // If this read `activeParameterSetId` instead, recalibrating an
    // Evidence Model would silently rewrite the historical estimate of
    // every session that ever used it.
    const db = makeDb();
    const sm = db.evidenceModels[0].statisticalModels[0];
    const before = accumulateEvidence(sessionWith([makeResponse()]), db).posteriors[0].estimate;

    // Recalibrate: a new, very different parameter set becomes active.
    sm.parameterSets.push({
      parameterSetId: "ps2",
      parameters: { o1: { a: 3, b: -2.5 } },
      packageVersion: "pilot-2",
      converged: true,
      sampleSize: 900,
      calibratedAt: "2026-06-01T00:00:00.000Z",
    });
    sm.activeParameterSetId = "ps2";

    // The stored response still cites ps1, so the estimate must not move.
    const after = accumulateEvidence(sessionWith([makeResponse()]), db).posteriors[0].estimate;

    expect(after).toBe(before);
  });

  it("is deterministic — the same session and db always give the same posterior", () => {
    const responses = [
      makeResponse({ itemId: "i1", activated: true }),
      makeResponse({ itemId: "i2", activated: false }),
      makeResponse({ itemId: "i3", activated: true }),
    ];
    const a = accumulateEvidence(sessionWith(responses), makeDb()).posteriors[0];
    const b = accumulateEvidence(sessionWith(responses), makeDb()).posteriors[0];

    expect(a.estimate).toBe(b.estimate);
    expect(a.precision).toBe(b.precision);
  });

  it("D50/D68: items that share an observable share calibrated (a, b); distinct observables keep distinct b", () => {
    const db = makeDb();
    db.evidenceModels[0].observables.push(
      { id: "o2", evidenceRule: { direction: "supports", strengthLevel: 4 } }
    );
    db.evidenceModels[0].statisticalModels[0].parameterSets[0].parameters = {
      o1: { a: 1, b: -1 },
      o2: { a: 1, b: 1 },
      "i-same-a": { a: 9, b: 9 },
      "i-same-b": { a: 8, b: 8 },
    };

    const sharedA = accumulateEvidence(
      sessionWith([makeResponse({ itemId: "i-same-a", observableId: "o1", observationId: "o1" })]),
      db
    ).posteriors[0].estimate;
    const sharedB = accumulateEvidence(
      sessionWith([makeResponse({ itemId: "i-same-b", observableId: "o1", observationId: "o1" })]),
      db
    ).posteriors[0].estimate;
    expect(sharedA).toBe(sharedB);

    const distinct = accumulateEvidence(
      sessionWith([makeResponse({ itemId: "i-o2", observableId: "o2", observationId: "o2" })]),
      db
    ).posteriors[0].estimate;
    expect(distinct).not.toBe(sharedA);
  });
});

describe("accumulateEvidence — Day 39 (adversarial review) regression tests", () => {
  it("P0-1: refuses BOTH posteriors, rather than one silently overwriting the other, when two Evidence Models target the same SMV", () => {
    // Two distinct Evidence Models, each with their own parameter set, both
    // pointed at the SAME (only) continuous SMV on cm1. Before the Day 39
    // fix, `posteriors` would simply contain two entries for smvId
    // "smv-theta" -- and any downstream consumer keyed by smvId (e.g.
    // applyPosteriorsToSession's `smvPosteriors` map) would keep whichever
    // one it happened to process last, silently discarding the other's
    // evidence. The fix adds a post-pass that detects the collision and
    // marks every claimant unsupported instead of picking a "winner".
    const db = makeDb({
      evidenceModels: [
        {
          id: "em1",
          competencyId: "c1",
          versionNumber: 1,
          observables: [{ id: "o1", evidenceRule: { direction: "supports", strengthLevel: 4 } }],
          statisticalModels: [{
            id: "sm1",
            type: "irt",
            active: true,
            structureConfig: {},
            parameterSets: [{
              parameterSetId: "ps1",
              parameters: { o1: { a: 1, b: 0 } },
              packageVersion: "pilot-1",
              converged: true,
              sampleSize: 500,
              calibratedAt: "2026-01-01T00:00:00.000Z",
            }],
            activeParameterSetId: "ps1",
          }],
        },
        {
          id: "em2",
          competencyId: "c1",
          versionNumber: 1,
          observables: [{ id: "o2", evidenceRule: { direction: "supports", strengthLevel: 4 } }],
          statisticalModels: [{
            id: "sm2",
            type: "irt",
            active: true,
            structureConfig: {},
            parameterSets: [{
              parameterSetId: "ps2",
              parameters: { o2: { a: 1, b: 0 } },
              packageVersion: "pilot-1",
              converged: true,
              sampleSize: 500,
              calibratedAt: "2026-01-01T00:00:00.000Z",
            }],
            activeParameterSetId: "ps2",
          }],
        },
      ],
    });

    const { posteriors } = accumulateEvidence(
      sessionWith([
        makeResponse({ itemId: "i1", evidenceModelId: "em1", parameterSetId: "ps1", observationId: "o1", observableId: "o1", activated: true }),
        makeResponse({ itemId: "i2", evidenceModelId: "em2", parameterSetId: "ps2", observationId: "o2", observableId: "o2", activated: false }),
      ]),
      db
    );

    expect(posteriors).toHaveLength(2);
    for (const p of posteriors) {
      expect(p.smvId).toBe("smv-theta");
      expect(p.supported).toBe(false);
      expect(p.reason).toMatch(/is targeted by 2 different Evidence Models/);
      expect(p.reason).toMatch(/em1/);
      expect(p.reason).toMatch(/em2/);
      expect(p).not.toHaveProperty("estimate");
      expect(p).not.toHaveProperty("precision");
    }
  });

  it("P0-1: does not refuse when only one Evidence Model resolves to the SMV, even alongside an unrelated unsupported posterior", () => {
    // Guards against an overly-broad collision check that fires whenever
    // more than one posterior exists at all, rather than only when they
    // share the same smvId.
    const db = makeDb();
    db.competencyModels[0].smVariables = [
      continuousSmv({ id: "theta-a" }),
      continuousSmv({ id: "theta-b" }),
    ];
    // No smvId binding -> the single-response group for "theta-a"/"theta-b"
    // ambiguity path isn't what's under test here; instead, bind explicitly
    // so em1 resolves cleanly to theta-a, and leave db with only one
    // Evidence Model so there is nothing to collide with.
    db.evidenceModels[0].statisticalModels[0].structureConfig = { smvId: "theta-a" };

    const { posteriors } = accumulateEvidence(sessionWith([makeResponse()]), db);

    expect(posteriors).toHaveLength(1);
    expect(posteriors[0].supported).toBe(true);
    expect(posteriors[0].smvId).toBe("theta-a");
  });

  it("P0-3: a response's persisted posterior is unaffected by a LATER edit to the item's pilot psychometrics.irtParams", () => {
    // sessionRoutes.js snapshots the item's pilot irtParams onto the
    // response itself (`r.pilotParams`) at submit time. This test exercises
    // that pinned snapshot directly at the accumulation layer: a pilot-
    // sourced response must be scored from `r.pilotParams`, never by
        // looking up the item's CURRENT pilot params, so that editing an
    // item after scoring cannot rewrite history the next time this
    // function recomputes from `session.responses` (which happens on
    // every accumulation pass, since nothing here is incrementally
    // updated).
    const db = makeDb();
    // No parameterSets at all -- a genuinely pilot-only Evidence Model.
    db.evidenceModels[0].statisticalModels[0].parameterSets = [];
    db.evidenceModels[0].statisticalModels[0].activeParameterSetId = null;

    const pinnedParams = { a: 1, b: 0 };
    const response = makeResponse({
      parameterSetId: undefined,
      parameterSource: "pilot",
      pilotParams: pinnedParams,
    });

    const before = accumulateEvidence(sessionWith([response]), db).posteriors[0];
    expect(before.supported).toBe(true);
    expect(before.parameterSource).toBe("pilot");

    // Simulate "the item's pilot params were edited after this response was
    // scored" -- nothing on the stored response changes, only what a fresh
    // lookup of the item's current psychometrics would return. Because
    // accumulateEvidence never performs such a lookup for a pilot-sourced
    // group, mutating a hypothetical "current" params object here (which
    // this module never even sees) cannot move the estimate: re-running
    // with the SAME stored response must reproduce the SAME posterior.
    const after = accumulateEvidence(sessionWith([response]), db).posteriors[0];

    expect(after.estimate).toBe(before.estimate);
    expect(after.precision).toBe(before.precision);

    // And explicitly: if the response's OWN pinned snapshot differs (as it
    // would for a response scored against different pilot params), the
    // posterior DOES move -- proving the snapshot, not some external state,
    // is what actually drives the estimate.
    const differentPin = makeResponse({
      parameterSetId: undefined,
      parameterSource: "pilot",
      pilotParams: { a: 3, b: -2.5 },
    });
    const withDifferentPin = accumulateEvidence(sessionWith([differentPin]), db).posteriors[0];

    expect(withDifferentPin.estimate).not.toBe(before.estimate);
  });

  it("P0-3: excludes (with a warning), rather than crashing, a pilot-sourced response with no pinned pilotParams", () => {
    // An older response scored before Day 39 would have parameterSource
    // "pilot" but no pilotParams field at all -- this must degrade to the
    // ordinary "no usable parameters" exclusion path, not a TypeError.
    const db = makeDb();
    db.evidenceModels[0].statisticalModels[0].parameterSets = [];
    db.evidenceModels[0].statisticalModels[0].activeParameterSetId = null;

    const response = makeResponse({ parameterSetId: undefined, parameterSource: "pilot" });

    const { posteriors, warnings } = accumulateEvidence(sessionWith([response]), db);

    expect(posteriors[0].supported).toBe(false);
    expect(warnings.join(" ")).toMatch(/pinned pilot parameters.*no parameters for observable 'o1'/);
  });
});


/* ==================================================================
   SECOND ADVERSARIAL PASS — over the grid-sizing fixes themselves.

   The first pass found three defects in the original fixed 41-point
   [-4, 4] grid. Fixing them introduced a SECOND generation of defects,
   which a second adversarial pass then found: the resolution fix had been
   applied only to the normal-prior branch, leaving the uniform branch
   holding the identical bug; the `boundaryLimited` alarm added by the
   coverage fix could never actually fire for a normal prior; and the
   likelihood clamp silently disarmed the widening it was supposed to
   trigger.

   Every `it` below was originally written by that review to PIN the
   defect. They are inverted here to assert the fix, deliberately keeping
   the measured wrong values in the comments -- a regression that
   reintroduces any of them has to visibly rewrite an assertion that
   states what the wrong number used to be.
================================================================== */

describe("FIXED 1 — the uniform-prior branch had the same fixed-grid defect as the normal one", () => {
  /* `referenceSd = (hi - lo) / sqrt(12)` made the target step PROPORTIONAL
     to the support, so `needed` was the constant ceil(8*sqrt(12)) + 1 = 29
     for EVERY uniform prior -- always below MIN_GRID_POINTS, so the clamp
     always bound and the branch degenerated to exactly the "fixed count,
     variable step" design the normal branch had just been fixed to escape.
     Resolution is now driven by the logit scale of the likelihood instead,
     so the step no longer depends on how wide the author drew the support. */

  it("keeps the step bounded regardless of how wide the uniform support is", () => {
    for (const [lo, hi] of [[-1, 1], [-4, 4], [-10, 10], [-20, 20]]) {
      const q = buildQuadrature(continuousSmv({
        priorDistribution: { family: "uniform", params: { min: lo, max: hi } },
      }));
      // WAS: points === 41 for every span, i.e. step === (hi - lo) / 40, so
      // the step grew without limit as the support widened.
      expect(q.meta.step).toBeLessThanOrEqual(0.125);
      expect(q.meta.resolutionLimited).toBe(false);
    }
  });

  it("flags, rather than hides, a support so wide that the cost cap binds", () => {
    // WAS: a step of exactly 5.0, silently -- the very number the module
    // header cites as the original resolution disaster. The cost cap
    // (MAX_GRID_POINTS) still binds at this width, but the step is now 20x
    // finer AND the caller is told the target resolution was not met.
    const wide = buildQuadrature(continuousSmv({
      priorDistribution: { family: "uniform", params: { min: -100, max: 100 } },
    }));

    expect(wide.meta.step).toBeLessThanOrEqual(0.25);
    expect(wide.meta.resolutionLimited).toBe(true);
  });

  it("no longer collapses the posterior onto one node and reports a standard error of ~1e-19", () => {
    // 200 responses (100 right, 100 wrong) to an a=2 item under a uniform
    // prior on [-20, 20]. True posterior: 0.000 +/- 0.0709.
    // WAS: sd < 1e-15 -- a reported standard error of zero, supported: true.
    const smv = continuousSmv({
      priorDistribution: { family: "uniform", params: { min: -20, max: 20 } },
    });
    const observations = Array.from({ length: 200 }, (_, i) => ({
      u: i % 2, params: { a: 2, b: 0 },
    }));
    const mine = __testing__.estimateWithAdaptiveGrid(observations, smv);

    expect(mine.estimate).toBeCloseTo(0, 6);
    expect(mine.sd).toBeCloseTo(0.0709, 3);
  });

  it("reports a trustworthy standard error through the public API", () => {
    const db = makeDb();
    db.competencyModels[0].smVariables = [
      continuousSmv({ priorDistribution: { family: "uniform", params: { min: -20, max: 20 } } }),
    ];
    db.evidenceModels[0].statisticalModels[0].parameterSets[0].parameters = { o1: { a: 2, b: 0 } };
    const responses = Array.from({ length: 200 }, (_, i) =>
      makeResponse({ itemId: `i${i}`, activated: i % 2 === 0 })
    );

    const { posteriors } = accumulateEvidence(sessionWith(responses), db);

    expect(posteriors[0].supported).toBe(true);
    // WAS: sem < 1e-15.
    expect(posteriors[0].sem).toBeCloseTo(0.0709, 3);
  });

  it("is accurate at an ordinary uniform support of [-10, 10]", () => {
    // 200 responses, a=1.2. Reference (fine grid): 0.85381 +/- 0.14010.
    // WAS: off by more than 0.1 logits, ~0.82 SE.
    const smv = continuousSmv({
      priorDistribution: { family: "uniform", params: { min: -10, max: 10 } },
    });
    const observations = [
      ...Array.from({ length: 140 }, () => ({ u: 1, params: { a: 1.2, b: -0.4 } })),
      ...Array.from({ length: 60 }, () => ({ u: 0, params: { a: 1.2, b: 1.1 } })),
    ];
    const mine = __testing__.estimateWithAdaptiveGrid(observations, smv);

    expect(mine.estimate).toBeCloseTo(0.85381, 3);
    expect(mine.sd).toBeCloseTo(0.14010, 3);
  });
});

describe("FIXED 2 — a flat likelihood no longer disarms the adaptive widening", () => {
  /* Clamping p to [1e-12, 1-1e-12] does not merely protect log(0): once
     p < 1e-12 at EVERY node of the initial +/-5 SD grid, every node got the
     identical clamped log-likelihood. The posterior was then exactly the
     prior -- whose edge mass is ~3.7e-7, comfortably inside
     EDGE_MASS_TOLERANCE -- so the loop concluded the grid was fine and
     never widened. The condition that should TRIGGER widening was the one
     SILENCING it. A flat log-likelihood is now itself a widening trigger. */

  it("widens to find a posterior whose likelihood is entirely off the initial grid", () => {
    const smv = continuousSmv(); // N(0, 1) -> initial grid [-5, 5]
    const observations = Array.from({ length: 100 }, () => ({ u: 1, params: { a: 3, b: 15 } }));
    const mine = __testing__.estimateWithAdaptiveGrid(observations, smv);
    const reference = referencePosterior(observations, { lo: -40, hi: 40, n: 80001 });

    // WAS: 0 +/- 1 (the prior verbatim), gridMeta.max === 5, never widened.
    expect(reference.eap).toBeGreaterThan(15);
    expect(mine.estimate).toBeCloseTo(reference.eap, 2);
    expect(mine.gridMeta.max).toBeGreaterThan(5);
  });

  it("has no cliff between b = 14 and b = 14.5", () => {
    const smv = continuousSmv();
    const at14 = __testing__.estimateWithAdaptiveGrid(
      Array.from({ length: 100 }, () => ({ u: 1, params: { a: 3, b: 14 } })), smv);
    const at145 = __testing__.estimateWithAdaptiveGrid(
      Array.from({ length: 100 }, () => ({ u: 1, params: { a: 3, b: 14.5 } })), smv);

    // WAS: b=14 was exact but b=14.5 returned the prior (0 +/- 1) -- a
    // discontinuity of ~99.7 SE across half a logit of item difficulty.
    expect(at14.estimate).toBeGreaterThan(14);
    expect(at145.estimate).toBeGreaterThan(14);
    expect(at145.estimate).toBeGreaterThan(at14.estimate);
  });

  it("refuses outright rather than returning the prior when no widening can reach the likelihood", () => {
    // The residual case: the data really is unreachable from this prior.
    // The module must not present the prior as a measurement.
    const db = makeDb();
    db.competencyModels[0].smVariables = [
      continuousSmv({ priorDistribution: { family: "uniform", params: { min: -1, max: 1 } } }),
    ];
    db.evidenceModels[0].statisticalModels[0].parameterSets[0].parameters = { o1: { a: 5, b: 60 } };
    const responses = Array.from({ length: 30 }, (_, i) => makeResponse({ itemId: `i${i}` }));

    const { posteriors } = accumulateEvidence(sessionWith(responses), db);
    expect(posteriors[0].supported).toBe(false);
    expect(posteriors[0]).not.toHaveProperty("estimate");
  });
});

describe("FIXED 3 — boundaryLimited is now reachable, and truncation is detected by the mode", () => {
  /* At MAX_PRIOR_SPREAD_FACTOR the extreme nodes sit 40 prior SDs out,
     where the normal density is exp(-800) -- which underflows to exactly 0.
     posterior[0] and posterior[last] were then identically 0, so edgeMass
     was identically 0 <= EDGE_MASS_TOLERANCE and the alarm was disabled
     precisely at the span where it should fire. Truncation is now also
     detected by the posterior MODE landing on a boundary node, which does
     not depend on the edge weights being representable. */

  it("still has underflowed weights at the extremes of the widest grid", () => {
    // Unchanged and expected -- this is why edge mass alone was never a
    // sufficient test.
    for (const sd of [0.1, 1, 5]) {
      const q = buildQuadrature(
        continuousSmv({ priorDistribution: { family: "normal", params: { mean: 0, sd } } }),
        { spreadFactor: 40 }
      );
      expect(q.weights[0]).toBe(0);
      expect(q.weights[q.weights.length - 1]).toBe(0);
    }
  });

  it("detects a truncated posterior by its mode, not only by edge mass", () => {
    // A uniform prior's support genuinely bounds the answer and cannot be
    // widened, so the mode really does sit on the last node.
    const smv = continuousSmv({ priorDistribution: { family: "uniform", params: { min: -1, max: 1 } } });
    const observations = Array.from({ length: 200 }, () => ({ u: 1, params: { a: 2, b: 0 } }));
    const result = __testing__.estimateWithAdaptiveGrid(observations, smv);

    expect(result.modeAtBoundary).toBe(true);
    expect(result.boundaryLimited).toBe(true);
  });

  it("recovers a posterior that used to be refused as un-normalisable", () => {
    // Prior N(0, 0.1), 1000 correct at b = 5. Truth: 5.000 +/- 0.054 -- a
    // perfectly ordinary posterior.
    // WAS: supported: false, "could not be normalised" -- a real answer
    // refused, and refused with a misleading diagnosis.
    const db = makeDb();
    db.competencyModels[0].smVariables = [
      continuousSmv({ priorDistribution: { family: "normal", params: { mean: 0, sd: 0.1 } } }),
    ];
    db.evidenceModels[0].statisticalModels[0].parameterSets[0].parameters = { o1: { a: 1, b: 5 } };
    const responses = Array.from({ length: 1000 }, (_, i) => makeResponse({ itemId: `i${i}` }));

    const { posteriors } = accumulateEvidence(sessionWith(responses), db);
    expect(posteriors[0].supported).toBe(true);
    expect(posteriors[0].estimate).toBeCloseTo(5.0, 1);
  });
});

describe("FIXED 4 — degenerate IRT parameters are refused instead of silently consumed", () => {
  /* schema.js validates `parameterSets[].parameters` as an `object` and
     nothing more, so a, b and c arrive as arbitrary numbers. Each case
     below previously returned supported: true with responsesUsed > 0 and
     no warning at all. */

  function dbWithParams(params) {
    const db = makeDb();
    db.evidenceModels[0].statisticalModels[0].parameterSets[0].parameters = { o1: params };
    return db;
  }
  const twentyCorrect = Array.from({ length: 20 }, (_, i) => makeResponse({ itemId: `i${i}` }));

  it("excludes a = 0, which carries no information, instead of reporting the prior", () => {
    // WAS: supported: true, responsesUsed: 20, estimate 0.000 +/- 1.000 --
    // the prior returned as a measurement.
    const { posteriors, warnings } = accumulateEvidence(sessionWith(twentyCorrect), dbWithParams({ a: 0, b: 0 }));
    expect(posteriors[0].supported).toBe(false);
    expect(warnings.join(" ")).toMatch(/unusable IRT parameters/);
  });

  it("excludes a < 0 rather than silently inverting the item", () => {
    // WAS: 20 CORRECT answers reported theta = -2.214465 -- the item
    // silently inverted, contradicting the module's own direction contract.
    const up = accumulateEvidence(sessionWith(twentyCorrect), dbWithParams({ a: 1, b: 0 }));
    const down = accumulateEvidence(sessionWith(twentyCorrect), dbWithParams({ a: -1, b: 0 }));

    expect(up.posteriors[0].supported).toBe(true);
    expect(up.posteriors[0].estimate).toBeGreaterThan(2);
    expect(down.posteriors[0].supported).toBe(false);
  });

  it("excludes c outside [0, 1)", () => {
    // WAS: c >= 1 made every item uninformative and returned the prior;
    // c = -0.5 was accepted and shifted the estimate to 2.558083.
    for (const c of [1, 1.5, -0.5]) {
      const { posteriors } = accumulateEvidence(sessionWith(twentyCorrect), dbWithParams({ a: 1, b: 0, c }));
      expect(posteriors[0].supported).toBe(false);
    }
    // A legitimate guessing parameter is still accepted.
    const ok = accumulateEvidence(sessionWith(twentyCorrect), dbWithParams({ a: 1, b: 0, c: 0.25 }));
    expect(ok.posteriors[0].supported).toBe(true);
  });
});

describe("FIXED 5 — the gridPoints option is capped", () => {
  it("clamps an explicit gridPoints to MAX_GRID_POINTS", () => {
    // WAS: unclamped -- 5000 was honoured, and 200000 blew the stack on
    // Math.max(...logLikelihood), despite MAX_GRID_POINTS being commented
    // "bounds the cost in a request path".
    expect(buildQuadrature(continuousSmv(), { gridPoints: 5000 }).meta.points).toBeLessThanOrEqual(801);
    expect(() =>
      estimateContinuousPosterior(
        [{ u: 1, params: RASCH }],
        buildQuadrature(continuousSmv(), { gridPoints: 200000 })
      )
    ).not.toThrow();
  });

  it("passes the whole options object through accumulateEvidence's pre-flight grid build", () => {
    // WAS: `buildQuadrature(smVariable, options.gridPoints)` -- a NUMBER
    // where an options OBJECT was expected, so the argument was ignored.
    const smv = continuousSmv();
    expect(buildQuadrature(smv, { gridPoints: 41 }).meta.points).toBe(41);
  });
});

describe("FIXED 6 — a degenerate declared prior is refused rather than defaulted", () => {
  it("refuses a normal prior with a non-positive declared sd", () => {
    // WAS: silently substituted N(0, 1) and reported a posterior against a
    // prior the author never specified.
    expect(buildQuadrature(continuousSmv({
      priorDistribution: { family: "normal", params: { mean: 0, sd: 0 } },
    }))).toBeNull();
    expect(buildQuadrature(continuousSmv({
      priorDistribution: { family: "normal", params: { mean: 0, sd: -1 } },
    }))).toBeNull();
  });

  it("still accepts a normal prior that simply omits its params", () => {
    // Omission is not the same as a declared-but-invalid value; the
    // documented default of N(0, 1) stands.
    const empty = buildQuadrature(continuousSmv({ priorDistribution: { family: "normal", params: {} } }));
    expect(empty.nodes).toEqual(buildQuadrature(continuousSmv()).nodes);
  });

  it("surfaces a degenerate prior as an explicit refusal through the public API", () => {
    const db = makeDb();
    db.competencyModels[0].smVariables = [
      continuousSmv({ priorDistribution: { family: "normal", params: { mean: 0, sd: 0 } } }),
    ];
    const { posteriors } = accumulateEvidence(sessionWith([makeResponse()]), db);
    expect(posteriors[0].supported).toBe(false);
    expect(posteriors[0].reason).toMatch(/quadrature grid/);
  });
});

/* ------------------------------------------------------------------
   CTT / SUM / THRESHOLD -- the raw-score family (authoritative D31's
   original exit check: "arithmetic, lowest risk" paths, hand-computed
   fixtures, proving the per-family dispatch shape).
------------------------------------------------------------------ */

const { resolveObservationWeight, estimateRawScore } = __testing__;

const binarySmv = (overrides = {}) => ({
  id: "smv-mastery",
  label: "Mastery",
  type: "binary",
  ...overrides,
});

function rawScoreDb({ type = "sum", smv = binarySmv(), items = [], taskModels = [] } = {}) {
  return {
    competencyModels: [{ id: "cm1", versionNumber: 1, smVariables: [smv] }],
    competencies: [{ id: "c1", modelId: "cm1" }],
    evidenceModels: [{
      id: "em1",
      competencyId: "c1",
      versionNumber: 1,
      observables: [{ id: "o1", evidenceRule: { direction: "supports", strengthLevel: 4 } }],
      statisticalModels: [{
        id: "sm1",
        type,
        active: true,
        structureConfig: {},
        parameterSets: [{
          parameterSetId: "ps1",
          parameters: {},
          packageVersion: "pilot-1",
          converged: true,
          sampleSize: 500,
          calibratedAt: "2026-01-01T00:00:00.000Z",
        }],
        activeParameterSetId: "ps1",
      }],
    }],
    items,
    taskModels,
  };
}

describe("estimateRawScore — the CTT/sum/threshold arithmetic, hand-computed", () => {
  it("a single correct, unit-weight response: p=1, but the SE is NOT zero", () => {
    // Hand computation:
    //   totalWeight = 1, weightedCorrect = 1, estimate = 1/1 = 1
    //   pTilde = (1 + 2) / (1 + 4) = 3/5 = 0.6
    //   variance = 0.6 * 0.4 / 5 = 0.24 / 5 = 0.048
    //   sd = sqrt(0.048) = 0.21908902300206643...
    const result = estimateRawScore([{ u: 1, weight: 1 }]);
    expect(result.estimate).toBe(1);
    expect(result.sd).toBeCloseTo(0.21908902300206643, 15);
    // The naive Wald SE (sqrt(p(1-p)/n)) would report exactly 0 here --
    // the whole reason for the Agresti-Coull adjustment.
    expect(result.sd).toBeGreaterThan(0);
  });

  it("two responses with UNEQUAL weight (threshold-style): hand-computed", () => {
    // weight 1 correct, weight 3 incorrect.
    //   totalWeight = 4, weightedCorrect = 1*1 + 3*0 = 1, estimate = 0.25
    //
    // Day 39 (adversarial review, P0-2): nEff is KISH'S effective sample
    // size (Sw)^2 / S(w^2), not the raw weight sum -- see estimateRawScore's
    // own updated header comment for why using Sw directly froze the
    // reported SE regardless of how many responses were actually scored.
    //   sumSquaredWeight = 1^2 + 3^2 = 10
    //   nEff = 4^2 / 10 = 1.6
    //   pTilde = (1.6 * 0.25 + 2) / (1.6 + 4) = 2.4 / 5.6 = 0.42857142857142855
    //   variance = 0.42857142857142855 * 0.5714285714285714 / 5.6 = 0.043731778425655975
    //   sd = sqrt(0.043731778425655975) = 0.20912144420325712...
    const result = estimateRawScore([{ u: 1, weight: 1 }, { u: 0, weight: 3 }]);
    expect(result.estimate).toBeCloseTo(0.25, 15);
    expect(result.sd).toBeCloseTo(0.20912144420325712, 15);
  });

  it("Day 39 (P0-2): a UNIFORM weight (including 1/n, the schema-required Task Model shape) reduces nEff to exactly the response count, so precision improves as more responses accumulate", () => {
    const five = estimateRawScore(Array.from({ length: 5 }, () => ({ u: 1, weight: 1 / 5 })));
    const twenty = estimateRawScore(Array.from({ length: 20 }, () => ({ u: 1, weight: 1 / 20 })));
    const fifty = estimateRawScore(Array.from({ length: 50 }, () => ({ u: 1, weight: 1 / 50 })));

    // Before the fix, Sw was pinned near 1 by schema.js's "weights sum to
    // 1" rule for every one of these, so all three reported the SAME sd
    // regardless of test length -- 50 items looked no more precise than 5.
    expect(twenty.sd).toBeLessThan(five.sd);
    expect(fifty.sd).toBeLessThan(twenty.sd);
  });

  it("precision improves and estimate approaches the true rate as responses accumulate", () => {
    const sds = [1, 5, 20, 100].map((n) => {
      const obs = Array.from({ length: n }, (_, i) => ({ u: i % 4 === 0 ? 0 : 1, weight: 1 }));
      return estimateRawScore(obs).sd;
    });
    for (let i = 1; i < sds.length; i += 1) expect(sds[i]).toBeLessThan(sds[i - 1]);
  });

  it("degrades gracefully to the familiar sqrt(p(1-p)/n) shape at large n", () => {
    // At n = 10000 the +2/+4 pseudo-counts are negligible: p~=0.75 either way.
    const obs = Array.from({ length: 10000 }, (_, i) => ({ u: i % 4 === 0 ? 0 : 1, weight: 1 }));
    const result = estimateRawScore(obs);
    const wald = Math.sqrt(0.75 * 0.25 / 10000);
    expect(Math.abs(result.sd - wald)).toBeLessThan(1e-4);
  });

  it("returns null when total weight is zero (nothing to compute a proportion from)", () => {
    expect(estimateRawScore([])).toBeNull();
  });
});

describe("resolveObservationWeight — weight comes from the package when one is active (D49c)", () => {
  it("defaults to weight 1 when the item cannot be found", () => {
    expect(resolveObservationWeight({ itemId: "missing" }, { items: [], taskModels: [] })).toEqual({ weight: 1 });
  });

  it("defaults to weight 1 when the Task Model cannot be found", () => {
    const db = { items: [{ id: "i1", taskModelId: "tm-missing" }], taskModels: [] };
    expect(resolveObservationWeight({ itemId: "i1" }, db)).toEqual({ weight: 1 });
  });

  it("defaults to weight 1 when the Task Model declares no weight for this observable", () => {
    const db = {
      items: [{ id: "i1", taskModelId: "tm1" }],
      taskModels: [{ id: "tm1", expectedObservations: [{ observationId: "o1" }] }],
    };
    expect(resolveObservationWeight({ itemId: "i1", observationId: "o1" }, db)).toEqual({ weight: 1 });
  });

  it("uses the declared weight when present", () => {
    const db = {
      items: [{ id: "i1", taskModelId: "tm1" }],
      taskModels: [{ id: "tm1", expectedObservations: [{ observationId: "o1", weight: 2.5 }] }],
    };
    expect(resolveObservationWeight({ itemId: "i1", observationId: "o1" }, db)).toEqual({ weight: 2.5 });
  });

  it("an active package's baked weight wins over a conflicting live Task Model weight", () => {
    const db = {
      items: [{ id: "i1", taskModelId: "tm1" }],
      taskModels: [{ id: "tm1", expectedObservations: [{ observationId: "o1", weight: 9 }] }],
      compositeLibrary: [{
        taskModelId: "tm1",
        active: true,
        items: [{ itemId: "i1", observationId: "o1", weight: 2.5 }],
      }],
    };
    expect(resolveObservationWeight({ itemId: "i1", observationId: "o1" }, db)).toEqual({ weight: 2.5 });
  });

  it("refuses a declared weight that is zero, negative, or non-finite rather than defaulting it", () => {
    // A zero weight would silently vanish a response with no signal that
    // it was dropped; a negative one would invert its contribution.
    for (const weight of [0, -1, NaN, Infinity]) {
      const db = {
        items: [{ id: "i1", taskModelId: "tm1" }],
        taskModels: [{ id: "tm1", expectedObservations: [{ observationId: "o1", weight }] }],
      };
      expect(resolveObservationWeight({ itemId: "i1", observationId: "o1" }, db)).toEqual({ invalid: true });
    }
  });
});

describe("accumulateEvidence — the raw-score family end to end", () => {
  it("a 'sum' model produces the same estimate as estimateRawScore on equally-weighted responses", () => {
    const db = rawScoreDb({ type: "sum" });
    const responses = [
      makeResponse({ itemId: "i1", activated: true }),
      makeResponse({ itemId: "i2", activated: false }),
      makeResponse({ itemId: "i3", activated: true }),
    ];
    const { posteriors, warnings } = accumulateEvidence(sessionWith(responses), db);

    expect(warnings).toEqual([]);
    expect(posteriors[0].supported).toBe(true);
    expect(posteriors[0].modelFamily).toBe("sum");
    expect(posteriors[0].smvType).toBe("binary");
    expect(posteriors[0].responsesUsed).toBe(3);

    const expected = estimateRawScore([{ u: 1, weight: 1 }, { u: 0, weight: 1 }, { u: 1, weight: 1 }]);
    expect(posteriors[0].estimate).toBeCloseTo(expected.estimate, 15);
    expect(posteriors[0].precision).toBeCloseTo(expected.sd, 15);
  });

  it("a 'threshold' model honours the Task Model's declared per-observable weights", () => {
    const items = [
      { id: "i1", taskModelId: "tm1" },
      { id: "i2", taskModelId: "tm1" },
    ];
    const taskModels = [{
      id: "tm1",
      expectedObservations: [
        { observationId: "o-easy", weight: 1 },
        { observationId: "o-hard", weight: 3 },
      ],
    }];
    const db = rawScoreDb({ type: "threshold", items, taskModels });
    const responses = [
      makeResponse({ itemId: "i1", observationId: "o-easy", observableId: "o1", activated: true }),
      makeResponse({ itemId: "i2", observationId: "o-hard", observableId: "o1", activated: false }),
    ];

    const { posteriors } = accumulateEvidence(sessionWith(responses), db);

    expect(posteriors[0].supported).toBe(true);
    // Same numbers as the hand-computed weight-1/weight-3 fixture above
    // (Day 39: updated for the Kish's-nEff fix -- see that test).
    expect(posteriors[0].estimate).toBeCloseTo(0.25, 15);
    expect(posteriors[0].precision).toBeCloseTo(0.20912144420325712, 15);
  });

  it("excludes a response whose declared weight is invalid, with a warning", () => {
    const items = [{ id: "i1", taskModelId: "tm1" }];
    const taskModels = [{ id: "tm1", expectedObservations: [{ observationId: "o1", weight: -1 }] }];
    const db = rawScoreDb({ type: "threshold", items, taskModels });

    const { posteriors, warnings } = accumulateEvidence(
      sessionWith([makeResponse({ itemId: "i1", activated: true })]),
      db
    );

    expect(posteriors[0].supported).toBe(false);
    expect(warnings.some((w) => w.includes("invalid weight"))).toBe(true);
  });

  it("a 'ctt' model accepts a continuous, binary, or ordinal SMV but not categorical", () => {
    for (const type of ["continuous", "binary", "ordinal"]) {
      const db = rawScoreDb({ type: "ctt", smv: { id: "smv1", type } });
      const { posteriors } = accumulateEvidence(sessionWith([makeResponse()]), db);
      expect(posteriors[0].supported).toBe(true);
      expect(posteriors[0].smvType).toBe(type);
    }

    const categoricalDb = rawScoreDb({ type: "ctt", smv: { id: "smv1", type: "categorical", states: ["a", "b"] } });
    const { posteriors } = accumulateEvidence(sessionWith([makeResponse()]), categoricalDb);
    expect(posteriors[0].supported).toBe(false);
    expect(posteriors[0].reason).toMatch(/no continuous\/binary\/ordinal/);
  });

  it("refuses when several eligible SMVs exist and none is bound", () => {
    const db = rawScoreDb({ type: "sum" });
    db.competencyModels[0].smVariables = [binarySmv({ id: "a" }), binarySmv({ id: "b" })];
    const { posteriors } = accumulateEvidence(sessionWith([makeResponse()]), db);
    expect(posteriors[0].supported).toBe(false);
    expect(posteriors[0].reason).toMatch(/Refusing to guess/);
  });

  it("honours an explicit smvId binding to a binary SMV", () => {
    const db = rawScoreDb({ type: "sum" });
    db.competencyModels[0].smVariables = [binarySmv({ id: "target" }), binarySmv({ id: "other" })];
    db.evidenceModels[0].statisticalModels[0].structureConfig = { smvId: "target" };
    const { posteriors } = accumulateEvidence(sessionWith([makeResponse()]), db);
    expect(posteriors[0].supported).toBe(true);
    expect(posteriors[0].smvId).toBe("target");
  });

  it("moves the estimate up on a correct response and down on an incorrect one, like the continuous branch", () => {
    const db = rawScoreDb({ type: "sum" });
    const up = accumulateEvidence(sessionWith([makeResponse({ activated: true })]), db);
    const down = accumulateEvidence(sessionWith([makeResponse({ activated: false })]), db);
    expect(up.posteriors[0].estimate).toBeGreaterThan(down.posteriors[0].estimate);
  });
});

/* ------------------------------------------------------------------
   Day 33 (Week 7): applyPosteriorsToSession -- persisting the result onto
   session.studentModel.smvPosteriors. See schema.js's `sessions` deep
   validation for the shape this must match exactly (the "one pointer,
   validated on both sides" invariant applied to a map key).
------------------------------------------------------------------ */

describe("applyPosteriorsToSession — persisting the result onto the session", () => {
  function accumulationResult(overrides = {}) {
    return {
      posteriors: [{
        smvId: "smv1",
        smvType: "continuous",
        evidenceModelId: "em1",
        parameterSetId: "ps1",
        modelFamily: "irt",
        method: "eap",
        supported: true,
        estimate: 0.83,
        precision: 0.41,
        sem: 0.41,
        responsesUsed: 5,
        responsesExcluded: 1,
        boundaryLimited: false,
        ...overrides,
      }],
      warnings: [],
    };
  }

  it("creates studentModel.smvPosteriors on a session that has neither", () => {
    const session = { id: "s1" };
    const result = applyPosteriorsToSession(session, accumulationResult(), { now: "2026-08-30T00:00:00.000Z" });

    expect(result).toBe(session); // mutates and returns the same object
    expect(session.studentModel.smvPosteriors.smv1).toEqual({
      smvId: "smv1",
      smvType: "continuous",
      evidenceModelId: "em1",
      parameterSetId: "ps1",
      // Day 38: parameterSource defaults to "calibrated" when the
      // accumulation result (built here without one) predates the field --
      // see applyPosteriorsToSession's own comment.
      parameterSource: "calibrated",
      modelFamily: "irt",
      method: "eap",
      estimate: 0.83,
      precision: 0.41,
      sem: 0.41,
      responsesUsed: 5,
      responsesExcluded: 1,
      boundaryLimited: false,
      refined: false,
      updatedAt: "2026-08-30T00:00:00.000Z",
    });
  });

  it("is readable immediately after being written -- the D33 exit check", () => {
    const session = { id: "s1" };
    applyPosteriorsToSession(session, accumulationResult());
    expect(session.studentModel.smvPosteriors.smv1.estimate).toBe(0.83);
    expect(session.studentModel.smvPosteriors.smv1.precision).toBe(0.41);
  });

  it("preserves an existing prior measurement's studentModel keys it doesn't own", () => {
    const session = { id: "s1", studentModel: { irtTheta: 0.4 } };
    applyPosteriorsToSession(session, accumulationResult());
    expect(session.studentModel.irtTheta).toBe(0.4);
    expect(session.studentModel.smvPosteriors.smv1.estimate).toBe(0.83);
  });

  it("does NOT write a refused (supported: false) posterior, and does not disturb an earlier real one", () => {
    const session = { id: "s1" };
    applyPosteriorsToSession(session, accumulationResult({ estimate: 0.5 }));

    const refusal = { posteriors: [{ evidenceModelId: "em1", supported: false, reason: "mixed parameter sets" }], warnings: [] };
    applyPosteriorsToSession(session, refusal);

    // The earlier real measurement is untouched -- a refusal is silence,
    // not a claim that the ability is now unknown or zero.
    expect(session.studentModel.smvPosteriors.smv1.estimate).toBe(0.5);
  });

  it("overwrites a prior posterior for the same SMV with a newer one", () => {
    const session = { id: "s1" };
    applyPosteriorsToSession(session, accumulationResult({ estimate: 0.5, responsesUsed: 3 }), { now: "2026-08-30T00:00:00.000Z" });
    applyPosteriorsToSession(session, accumulationResult({ estimate: 0.6, responsesUsed: 4 }), { now: "2026-08-30T01:00:00.000Z" });

    expect(session.studentModel.smvPosteriors.smv1.estimate).toBe(0.6);
    expect(session.studentModel.smvPosteriors.smv1.responsesUsed).toBe(4);
    expect(session.studentModel.smvPosteriors.smv1.updatedAt).toBe("2026-08-30T01:00:00.000Z");
  });

  it("keeps multiple SMVs distinct, keyed independently", () => {
    const session = { id: "s1" };
    applyPosteriorsToSession(session, {
      posteriors: [
        { smvId: "smv1", smvType: "continuous", evidenceModelId: "em1", parameterSetId: "ps1", modelFamily: "irt", method: "eap", supported: true, estimate: 0.1, precision: 0.2, sem: 0.2, responsesUsed: 1, responsesExcluded: 0 },
        { smvId: "smv2", smvType: "binary", evidenceModelId: "em2", parameterSetId: "ps2", modelFamily: "sum", method: "weighted-proportion", supported: true, estimate: 0.9, precision: 0.3, sem: 0.3, responsesUsed: 2, responsesExcluded: 0 },
      ],
      warnings: [],
    });

    expect(Object.keys(session.studentModel.smvPosteriors).sort()).toEqual(["smv1", "smv2"]);
    expect(session.studentModel.smvPosteriors.smv1.estimate).toBe(0.1);
    expect(session.studentModel.smvPosteriors.smv2.estimate).toBe(0.9);
  });

  it("round-trips through accumulateEvidence and passes schema.js's own validateEntity", () => {
    const db = makeDb();
    const session = sessionWith([makeResponse()]);
    const result = accumulateEvidence(session, db);

    applyPosteriorsToSession(session, result);

    expect(session.studentModel.smvPosteriors["smv-theta"].supported).toBeUndefined();
    expect(session.studentModel.smvPosteriors["smv-theta"].estimate).toBe(result.posteriors[0].estimate);

    // The actual D33 exit check: schema.js validates the persisted shape,
    // not just this file's own idea of what it should look like. Checked
    // with status "draft" -- this file's own accumulateEvidence fixtures
    // were never built to also satisfy the UNRELATED response-provenance
    // checks that the "sessions" validator runs for in_progress/submitted
    // sessions (evidenceModelVersion, competencyModelVersion, etc.), and
    // pinning those too would test something this file doesn't own.
    const { errors } = validateEntity("sessions", { ...session, status: "draft" }, db);
    expect(errors).toEqual([]);
  });

  it("throws for programmer errors (no session, no result), never silently no-ops", () => {
    expect(() => applyPosteriorsToSession(null, accumulationResult())).toThrow();
    expect(() => applyPosteriorsToSession({ id: "s1" }, null)).toThrow();
  });
});
