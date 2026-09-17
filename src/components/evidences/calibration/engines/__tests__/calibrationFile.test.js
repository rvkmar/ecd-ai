// Calibration intake — parser, validator, classical engine, overlay.
// The sample files in samples/ are read from disk on purpose: they are
// shipped as the "does this feature work?" fixture, so a change that
// breaks them should break this suite too.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
    buildRecalibrationPayload,
    detectFormat,
    observableParameterEntries,
    parseCalibrationJson,
    validateAgainstModel,
} from "../calibrationFile.js";

import {
    calibrateFromResponseMatrix,
    parseResponseMatrix,
    responseMatrixToPackage,
} from "../classicalCalibration.js";

import {
    buildEffectiveStatisticalModel,
    computeReadiness,
    resolveCalibrationWindow,
    resolveLifecycleStage,
} from "../effectiveModel.js";

const samplesDir = path.resolve(process.cwd(), "samples");
const readSample = (name) => fs.readFileSync(path.join(samplesDir, name), "utf8");

const OBSERVABLES = [
    { id: "o1", statement: "Computes the correct final numeric answer." },
    { id: "o2", statement: "Shows correct sequential working steps." },
    { id: "o3", statement: "Selects the correct proportional relationship." },
];

const irtModel = () => ({
    id: "sm1",
    type: "irt",
    subtype: "2pl",
    active: true,
    structureConfig: { observableIds: ["o1", "o2", "o3"] },
    parameterSets: [],
    activeParameterSetId: null,
});

const bnModel = () => ({
    id: "sm2",
    type: "bayesian_network",
    subtype: "discrete",
    active: true,
    structureConfig: { observableIds: ["o1", "o2", "o3"] },
    parameterSets: [],
    activeParameterSetId: null,
});

const ordinalCompetency = () => ({
    variableType: "ordinal",
    states: [
        { value: "L1", order: 1 },
        { value: "L2", order: 2 },
        { value: "L3", order: 3 },
    ],
});

/* =====================================================
   FORMAT DETECTION
===================================================== */

describe("detectFormat", () => {

    it("uses the extension when there is one", () => {
        expect(detectFormat("cal.json", "")).toBe("json");
        expect(detectFormat("responses.csv", "")).toBe("csv");
    });

    it("sniffs the payload when there is not", () => {
        expect(detectFormat("blob", '{"kind":"irt-parameters"}')).toBe("json");
        expect(detectFormat("blob", "o1,o2\n1,0")).toBe("csv");
    });

});

/* =====================================================
   SHIPPED SAMPLES
===================================================== */

describe("shipped sample calibration files", () => {

    it("parses the IRT sample with no errors or warnings", () => {
        const result = parseCalibrationJson(readSample("sample-calibration-irt-2pl.json"));
        expect(result.errors).toEqual([]);
        expect(result.warnings).toEqual([]);
        expect(result.ok).toBe(true);
        expect(Object.keys(result.pkg.parameters)).toEqual(["o1", "o2", "o3"]);
    });

    it("parses the Bayesian sample with no errors or warnings", () => {
        const result = parseCalibrationJson(readSample("sample-calibration-bayesian-cpt.json"));
        expect(result.errors).toEqual([]);
        expect(result.warnings).toEqual([]);
        expect(result.pkg.prior).toEqual({ L1: 0.3, L2: 0.45, L3: 0.25 });
    });

    it("accepts the IRT sample against a matching statistical model", () => {
        const { pkg } = parseCalibrationJson(readSample("sample-calibration-irt-2pl.json"));

        const check = validateAgainstModel({
            pkg,
            statisticalModel: irtModel(),
            observables: OBSERVABLES,
            competency: { variableType: "continuous", scale: { min: -3, max: 3 } },
        });

        expect(check.errors).toEqual([]);
        expect(check.coverage).toMatchObject({ scoped: 3, supplied: 3 });
    });

    it("accepts the Bayesian sample against a matching statistical model", () => {
        const { pkg } = parseCalibrationJson(readSample("sample-calibration-bayesian-cpt.json"));

        const check = validateAgainstModel({
            pkg,
            statisticalModel: bnModel(),
            observables: OBSERVABLES,
            competency: ordinalCompetency(),
        });

        expect(check.errors).toEqual([]);
    });

    it("parses the sample response matrix", () => {
        const parsed = parseResponseMatrix(
            readSample("sample-calibration-responses.csv"),
            { fileName: "sample-calibration-responses.csv" }
        );

        expect(parsed.ok).toBe(true);
        expect(parsed.matrix.idColumn).toBe("studentId");
        expect(parsed.matrix.observableIds).toEqual(["o1", "o2", "o3"]);
        expect(parsed.matrix.rows).toHaveLength(120);
    });

});

/* =====================================================
   PARSER REJECTIONS
===================================================== */

describe("parseCalibrationJson rejections", () => {

    const base = {
        calibrationFileVersion: "1.0",
        kind: "irt-parameters",
        provenance: {
            calibratedBy: "x@y.z",
            calibrationMethod: "mirt 2PL",
            sampleSize: 500,
            software: "R mirt 1.42",
        },
        parameters: { o1: { a: 1.2, b: 0.1 } },
    };

    it("rejects malformed JSON", () => {
        const r = parseCalibrationJson("{ nope");
        expect(r.ok).toBe(false);
        expect(r.errors[0]).toMatch(/not valid JSON/);
    });

    it("rejects an unknown kind", () => {
        const r = parseCalibrationJson(JSON.stringify({ ...base, kind: "voodoo" }));
        expect(r.ok).toBe(false);
        expect(r.errors[0]).toMatch(/kind must be one of/);
    });

    it("rejects a major version it cannot read", () => {
        const r = parseCalibrationJson(JSON.stringify({ ...base, calibrationFileVersion: "9.0" }));
        expect(r.ok).toBe(false);
        expect(r.errors[0]).toMatch(/Unsupported calibrationFileVersion/);
    });

    it("requires attributable provenance", () => {
        const r = parseCalibrationJson(JSON.stringify({ ...base, provenance: {} }));
        expect(r.ok).toBe(false);
        expect(r.errors).toEqual(expect.arrayContaining([
            expect.stringMatching(/calibratedBy/),
            expect.stringMatching(/calibrationMethod/),
            expect.stringMatching(/sampleSize/),
            expect.stringMatching(/software|packageVersion/),
        ]));
    });

    it("requires software or packageVersion for packageVersion provenance", () => {
        const r = parseCalibrationJson(JSON.stringify({
            ...base,
            provenance: {
                calibratedBy: "x@y.z",
                calibrationMethod: "mirt 2PL",
                sampleSize: 500,
            },
        }));
        expect(r.ok).toBe(false);
        expect(r.errors.some((e) => /software|packageVersion/.test(e))).toBe(true);
    });

    it("requires a numeric difficulty per observable", () => {
        const r = parseCalibrationJson(JSON.stringify({
            ...base,
            parameters: { o1: { a: 1.2 } },
        }));
        expect(r.ok).toBe(false);
        expect(r.errors[0]).toMatch(/b \(difficulty\) must be numeric/);
    });

    it("rejects reserved keys used as observable ids", () => {
        const r = parseCalibrationJson(JSON.stringify({
            ...base,
            parameters: { _scale: { a: 1, b: 0 } },
        }));
        expect(r.ok).toBe(false);
        expect(r.errors[0]).toMatch(/reserved key/);
    });

    it("warns on a small calibration sample", () => {
        const r = parseCalibrationJson(JSON.stringify({
            ...base,
            provenance: { ...base.provenance, sampleSize: 40 },
        }));
        expect(r.ok).toBe(true);
        expect(r.warnings.join(" ")).toMatch(/small for stable item parameter estimation/);
    });

    it("requires a prior that sums to one for Bayesian packages", () => {
        const r = parseCalibrationJson(JSON.stringify({
            calibrationFileVersion: "1.0",
            kind: "bayesian-cpt",
            provenance: base.provenance,
            prior: { L1: 0.5, L2: 0.9 },
            cpt: { o1: { levels: { L1: 0.2, L2: 0.8 } } },
        }));
        expect(r.ok).toBe(false);
        expect(r.errors[0]).toMatch(/must sum to 1/);
    });

    it("warns when a CPT is non-monotonic across ordered states", () => {
        const r = parseCalibrationJson(JSON.stringify({
            calibrationFileVersion: "1.0",
            kind: "bayesian-cpt",
            provenance: base.provenance,
            prior: { L1: 0.5, L2: 0.5 },
            cpt: { o1: { levels: { L1: 0.8, L2: 0.2 } } },
        }));
        expect(r.ok).toBe(true);
        expect(r.warnings.join(" ")).toMatch(/non-monotonic/);
    });

    it("ignores a decision rule block that would fail schema validation", () => {
        const r = parseCalibrationJson(JSON.stringify({
            ...base,
            decisionRule: { type: "mastery", threshold: 0.5, direction: "above", justification: "short" },
        }));
        expect(r.pkg.decisionRule).toBeNull();
        expect(r.warnings.join(" ")).toMatch(/justification is too short/);
    });

});

/* =====================================================
   VALIDATION AGAINST THE TARGET MODEL
===================================================== */

describe("validateAgainstModel", () => {

    const pkg = () => parseCalibrationJson(readSample("sample-calibration-irt-2pl.json")).pkg;

    it("blocks an IRT package aimed at a Bayesian model", () => {
        const check = validateAgainstModel({
            pkg: pkg(),
            statisticalModel: bnModel(),
            observables: OBSERVABLES,
        });
        expect(check.errors.join(" ")).toMatch(/selected statistical model is "bayesian_network"/);
    });

    it("blocks parameters for observables that do not exist", () => {
        const check = validateAgainstModel({
            pkg: pkg(),
            statisticalModel: irtModel(),
            observables: OBSERVABLES.slice(0, 2),
        });
        expect(check.errors.join(" ")).toMatch(/do not exist on this evidence model: o3/);
    });

    it("blocks a mapped observable with no parameters", () => {
        const model = irtModel();
        model.structureConfig.observableIds = ["o1", "o2", "o3", "o4"];

        const check = validateAgainstModel({
            pkg: pkg(),
            statisticalModel: model,
            observables: [...OBSERVABLES, { id: "o4", statement: "Extra" }],
        });
        expect(check.errors.join(" ")).toMatch(/No parameters supplied for mapped observable\(s\): o4/);
    });

    it("warns that discrimination is ignored under a Rasch subtype", () => {
        const model = irtModel();
        model.subtype = "rasch";

        const check = validateAgainstModel({
            pkg: pkg(),
            statisticalModel: model,
            observables: OBSERVABLES,
        });
        expect(check.errors).toEqual([]);
        expect(check.warnings.join(" ")).toMatch(/fixes discrimination at 1\.0/);
    });

    it("blocks CPT states the competency does not declare", () => {
        const { pkg: bnPkg } = parseCalibrationJson(readSample("sample-calibration-bayesian-cpt.json"));

        const check = validateAgainstModel({
            pkg: bnPkg,
            statisticalModel: bnModel(),
            observables: OBSERVABLES,
            competency: {
                variableType: "binary",
                states: [{ value: "novice", order: 1 }, { value: "master", order: 2 }],
            },
        });
        expect(check.errors.join(" ")).toMatch(/states that do not exist/);
    });

});

/* =====================================================
   RECALIBRATION PAYLOAD
===================================================== */

describe("buildRecalibrationPayload", () => {

    it("keeps observable parameters flat and metadata under reserved keys", () => {
        const { pkg } = parseCalibrationJson(readSample("sample-calibration-irt-2pl.json"));

        const payload = buildRecalibrationPayload({
            pkg,
            statisticalModelId: "sm1",
            fileName: "sample-calibration-irt-2pl.json",
        });

        expect(payload.statisticalModelId).toBe("sm1");
        expect(payload.sampleSize).toBe(4821);
        expect(payload.calibratedBy).toBe("psychometrics.unit@example.org");
        expect(payload.packageVersion).toMatch(/mirt/);
        expect(payload.converged).toBe(true);

        expect(observableParameterEntries(payload.parameters).map(([id]) => id))
            .toEqual(["o1", "o2", "o3"]);

        expect(payload.parameters._kind).toBe("irt-parameters");
        expect(payload.parameters._scale.metric).toBe("theta");
        expect(payload.parameters._source.fileName).toBe("sample-calibration-irt-2pl.json");
        expect(payload.notes).toMatch(/Population:/);
    });

});

/* =====================================================
   CLASSICAL CALIBRATION FROM A RESPONSE MATRIX
===================================================== */

describe("classical calibration", () => {

    it("treats blanks and NA as omitted rather than incorrect", () => {
        const parsed = parseResponseMatrix("studentId,o1,o2\nS1,1,\nS2,0,NA\nS3,1,1\n");
        expect(parsed.ok).toBe(true);
        expect(parsed.matrix.rows[0].responses.o2).toBeNull();
        expect(parsed.matrix.rows[1].responses.o2).toBeNull();
        expect(parsed.matrix.rows[2].responses.o2).toBe(1);
    });

    it("rejects a row whose width does not match the header", () => {
        const parsed = parseResponseMatrix("o1,o2,o3\n1,0\n");
        expect(parsed.ok).toBe(false);
        expect(parsed.errors[0]).toMatch(/Row 2 has 2 response cell\(s\)/);
    });

    it("recovers the difficulty ordering of the simulated sample", () => {
        const parsed = parseResponseMatrix(
            readSample("sample-calibration-responses.csv"),
            { fileName: "sample-calibration-responses.csv" }
        );

        const { parameters, fit } = calibrateFromResponseMatrix({
            matrix: parsed.matrix,
            subtype: "2pl",
        });

        // o1 was simulated as the hardest and o3 as the easiest.
        expect(parameters.o1.b).toBeGreaterThan(parameters.o2.b);
        expect(parameters.o2.b).toBeGreaterThan(parameters.o3.b);

        expect(parameters.o1.pValue).toBeLessThan(parameters.o3.pValue);
        expect(fit.nPersons).toBe(120);
        expect(fit.difficultyCentred).toBe(true);
    });

    it("fixes discrimination at 1 for a Rasch calibration", () => {
        const parsed = parseResponseMatrix(readSample("sample-calibration-responses.csv"));

        const { parameters } = calibrateFromResponseMatrix({
            matrix: parsed.matrix,
            subtype: "rasch",
        });

        Object.values(parameters).forEach(p => expect(p.a).toBe(1));
    });

    it("Winsorises a degenerate item instead of producing an infinite difficulty", () => {
        const parsed = parseResponseMatrix("o1,o2\n1,1\n1,0\n1,1\n1,0\n");

        const { parameters, warnings } = calibrateFromResponseMatrix({
            matrix: parsed.matrix,
            subtype: "2pl",
        });

        expect(Number.isFinite(parameters.o1.b)).toBe(true);
        expect(warnings.join(" ")).toMatch(/every response was correct/i);
    });

    it("stamps the package so it can never pass as a real calibration", () => {
        const parsed = parseResponseMatrix(readSample("sample-calibration-responses.csv"));

        const { pkg } = responseMatrixToPackage({
            matrix: parsed.matrix,
            subtype: "2pl",
            calibratedBy: "qa@example.org",
        });

        expect(pkg.provenance.calibrationMethod).toMatch(/^classical-approximation/);
        expect(pkg.kind).toBe("irt-parameters");
    });

});

/* =====================================================
   EFFECTIVE MODEL OVERLAY
===================================================== */

describe("buildEffectiveStatisticalModel", () => {

    it("reports an uncalibrated model as such and leaves structure alone", () => {
        const eff = buildEffectiveStatisticalModel(irtModel());
        expect(eff.__calibrated).toBe(false);
        expect(eff.__activeParameterSet).toBeNull();
    });

    it("overlays the Bayesian CPT and prior from the active parameter set", () => {
        const { pkg } = parseCalibrationJson(readSample("sample-calibration-bayesian-cpt.json"));
        const payload = buildRecalibrationPayload({ pkg, statisticalModelId: "sm2" });

        const eff = buildEffectiveStatisticalModel({
            ...bnModel(),
            parameterSets: [{ parameterSetId: "ps_b", parameters: payload.parameters }],
            activeParameterSetId: "ps_b",
        });

        expect(eff.__calibrated).toBe(true);
        expect(eff.structureConfig.prior).toEqual({ L1: 0.3, L2: 0.45, L3: 0.25 });
        expect(eff.structureConfig.cpt.o1.levels.L3).toBe(0.88);
    });

    it("reads the ACTIVE set, not the first one", () => {
        const eff = buildEffectiveStatisticalModel({
            ...bnModel(),
            parameterSets: [
                { parameterSetId: "ps_old", parameters: { _kind: "bayesian-cpt", _prior: { L1: 1 } } },
                { parameterSetId: "ps_new", parameters: { _kind: "bayesian-cpt", _prior: { L1: 0.2, L2: 0.8 } } },
            ],
            activeParameterSetId: "ps_new",
        });

        expect(eff.structureConfig.prior).toEqual({ L1: 0.2, L2: 0.8 });
    });

    it("does not overwrite an empirical norm with the file's summary scale", () => {
        const distribution = Array.from({ length: 40 }, (_, i) => i / 10 - 2);

        const model = irtModel();
        model.structureConfig.norm = { type: "empirical", mean: 0.4, sd: 1.3, distribution };

        const eff = buildEffectiveStatisticalModel({
            ...model,
            parameterSets: [{
                parameterSetId: "ps_1",
                parameters: { _kind: "irt-parameters", _scale: { mean: 0, sd: 1 } },
            }],
            activeParameterSetId: "ps_1",
        });

        expect(eff.structureConfig.norm.type).toBe("empirical");
        expect(eff.structureConfig.norm.mean).toBe(0.4);
    });

});

/* =====================================================
   READINESS + LIFECYCLE
===================================================== */

describe("computeReadiness", () => {

    const validRule = {
        type: "posterior_threshold",
        threshold: 0.35,
        direction: "above",
        justification: "Cut from the June 2026 standard setting on this calibration scale.",
    };

    const calibrated = () => ({
        ...irtModel(),
        parameterSets: [{ parameterSetId: "ps_1", parameters: {} }],
        activeParameterSetId: "ps_1",
    });

    const BOUND = [{ id: "tm1", name: "Fractions Task", status: "confirmed", evidenceModelIds: ["em1"] }];

    it("passes when every gate is satisfied", () => {
        const readiness = computeReadiness({
            id: "em1",
            status: "confirmed",
            statisticalModels: [calibrated()],
            decisionRule: validRule,
        }, BOUND);
        expect(readiness.ready).toBe(true);
    });

    it("does NOT treat an empty decision rule object as defined", () => {
        // The previous panel used `!!model.decisionRule || {}`, which is
        // truthy no matter what -- this is the regression guard for it.
        const readiness = computeReadiness({
            id: "em1",
            status: "confirmed",
            statisticalModels: [calibrated()],
            decisionRule: {},
        }, BOUND);

        expect(readiness.ready).toBe(false);
        expect(readiness.checks.find(c => c.id === "decisionRule").ok).toBe(false);
    });

    it("fails when no parameter set is active", () => {
        const readiness = computeReadiness({
            id: "em1",
            status: "confirmed",
            statisticalModels: [{ ...irtModel(), parameterSets: [{ parameterSetId: "ps_1" }] }],
            decisionRule: validRule,
        }, BOUND);

        expect(readiness.checks.find(c => c.id === "activeParameterSet").ok).toBe(false);
        expect(readiness.ready).toBe(false);
    });

    /* ---------- delivery binding ---------- */

    const readyModel = () => ({
        id: "em1",
        status: "confirmed",
        statisticalModels: [calibrated()],
        decisionRule: validRule,
    });

    const binding = (r) => r.checks.find(c => c.id === "taskModelBinding");

    it("fails when no task model references the evidence model", () => {
        const r = computeReadiness(readyModel(), []);
        expect(binding(r).ok).toBe(false);
        expect(r.ready).toBe(false);
        expect(binding(r).remedy).toMatch(/task model/i);
    });

    it("does not accept a DRAFT task model as a binding", () => {
        const r = computeReadiness(readyModel(), [
            { id: "tm1", status: "draft", evidenceModelIds: ["em1"] },
        ]);
        expect(binding(r).ok).toBe(false);
        expect(binding(r).remedy).toMatch(/none is confirmed/);
    });

    it("accepts a confirmed, operational or suspended task model", () => {
        ["confirmed", "operational", "suspended"].forEach(status => {
            const r = computeReadiness(readyModel(), [
                { id: "tm1", name: "T", status, evidenceModelIds: ["em1"] },
            ]);
            expect(binding(r).ok, `status ${status}`).toBe(true);
            expect(r.ready).toBe(true);
        });
    });

    it("ignores a task model bound to a different evidence model", () => {
        const r = computeReadiness(readyModel(), [
            { id: "tm2", status: "confirmed", evidenceModelIds: ["em-other"] },
        ]);
        expect(binding(r).ok).toBe(false);
    });

    it("names the bound task models once the check passes", () => {
        const r = computeReadiness(readyModel(), [
            { id: "tm1", name: "Fractions Task", status: "confirmed", evidenceModelIds: ["em1"] },
        ]);
        expect(binding(r).detail).toBe("Fractions Task");
    });

    it("reports PENDING, not failed, while the task model list is loading", () => {
        // A slow query must never make a ready model look broken -- but a
        // pending check is still not a pass.
        const r = computeReadiness(readyModel(), null);
        expect(binding(r).pending).toBe(true);
        expect(binding(r).ok).toBe(false);
        expect(r.ready).toBe(false);
        expect(binding(r).remedy).toMatch(/Checking/);
    });

});

/* =====================================================
   CALIBRATION WINDOW
   The client mirror of calibrationGate() in
   server/routes/evidenceModels.js. If these two drift, the UI starts
   offering actions the server refuses -- which is exactly the bug
   this function was added to kill.
===================================================== */

describe("resolveCalibrationWindow", () => {

    it("is open for a confirmed model", () => {
        const w = resolveCalibrationWindow({ status: "confirmed", locked: true });
        expect(w.open).toBe(true);
        expect(w.reason).toBeNull();
    });

    it("is open for a suspended model — that is the point of suspending", () => {
        const w = resolveCalibrationWindow({ status: "suspended", locked: true });
        expect(w.open).toBe(true);
    });

    it("is closed while operational, and names the remedy", () => {
        const w = resolveCalibrationWindow({ status: "operational", locked: true });
        expect(w.open).toBe(false);
        expect(w.reason).toMatch(/live/i);
        expect(w.remedy).toMatch(/[Dd]eactivate/);
    });

    it("is closed under review, and says so rather than calling it a draft", () => {
        const w = resolveCalibrationWindow({ status: "reviewed", locked: false });
        expect(w.open).toBe(false);
        expect(w.status).toBe("reviewed");
        expect(w.reason).toMatch(/review/i);
        expect(w.reason).not.toMatch(/still a draft/);
    });

    it("is closed under review even if something set locked", () => {
        // Review is deliberately an unlocked state; a stray lock flag must
        // not be enough to open calibration.
        expect(resolveCalibrationWindow({ status: "reviewed", locked: true }).open).toBe(false);
    });

    it("is closed for a draft, whatever the lock says", () => {
        expect(resolveCalibrationWindow({ status: "draft", locked: false }).open).toBe(false);
        expect(resolveCalibrationWindow({ status: "draft", locked: true }).open).toBe(false);
        expect(resolveCalibrationWindow({ status: "confirmed", locked: false }).open).toBe(false);
    });

    it("is closed and read-only once archived", () => {
        const w = resolveCalibrationWindow({ status: "archived", locked: true });
        expect(w.open).toBe(false);
        expect(w.remedy).toMatch(/[Cc]lone/);
    });

    it("handles a missing model without throwing", () => {
        expect(resolveCalibrationWindow(undefined).open).toBe(false);
        expect(resolveCalibrationWindow(null).status).toBe("draft");
    });

});

describe("resolveLifecycleStage", () => {

    const calibrated = {
        ...irtModel(),
        parameterSets: [{ parameterSetId: "ps_1" }],
        activeParameterSetId: "ps_1",
    };

    const BOUND_TM = [{ id: "tm1", status: "confirmed", evidenceModelIds: ["em1"] }];

    it("resolves to 'bound' only once a confirmed task model delivers it", () => {
        const model = { id: "em1", status: "confirmed", statisticalModels: [calibrated] };

        expect(resolveLifecycleStage(model, BOUND_TM)).toBe("bound");
        expect(resolveLifecycleStage(model, [])).toBe("calibrated");
        expect(resolveLifecycleStage(model, [
            { id: "tm1", status: "draft", evidenceModelIds: ["em1"] },
        ])).toBe("calibrated");
        expect(resolveLifecycleStage(model, [
            { id: "tm2", status: "confirmed", evidenceModelIds: ["em-other"] },
        ])).toBe("calibrated");
    });

    it("never optimistically reports 'bound' while task models are unknown", () => {
        const model = { id: "em1", status: "confirmed", statisticalModels: [calibrated] };
        expect(resolveLifecycleStage(model)).toBe("calibrated");
        expect(resolveLifecycleStage(model, null)).toBe("calibrated");
    });

    it("does not reach 'bound' from an uncalibrated model, however well bound", () => {
        const model = {
            id: "em1",
            status: "confirmed",
            statisticalModels: [{ ...irtModel(), parameterSets: [], activeParameterSetId: null }],
        };
        expect(resolveLifecycleStage(model, BOUND_TM)).toBe("confirmed");
    });

    it("distinguishes confirmed-but-uncalibrated from calibrated", () => {
        expect(resolveLifecycleStage({ status: "confirmed", statisticalModels: [irtModel()] }))
            .toBe("confirmed");

        expect(resolveLifecycleStage({ status: "confirmed", statisticalModels: [calibrated] }))
            .toBe("calibrated");
    });

    it("reports operational and suspended as their own stages", () => {
        expect(resolveLifecycleStage({ status: "operational", statisticalModels: [calibrated] }))
            .toBe("operational");

        expect(resolveLifecycleStage({ status: "suspended", statisticalModels: [calibrated] }))
            .toBe("suspended");
    });

    it("reports reviewed as its own stage, not as draft", () => {
        expect(resolveLifecycleStage({ status: "reviewed", statisticalModels: [] }))
            .toBe("reviewed");
    });

    it("covers all six stored statuses", () => {
        const seen = ["draft", "reviewed", "confirmed", "operational", "suspended", "archived"]
            .map(status => resolveLifecycleStage({ status, statisticalModels: [] }));

        // confirmed-without-parameters resolves to "confirmed"; the rest map 1:1.
        expect(seen).toEqual([
            "draft", "reviewed", "confirmed", "operational", "suspended", "archived",
        ]);
    });

    it("reports archived, which outranks every other state", () => {
        expect(resolveLifecycleStage({ status: "archived", statisticalModels: [calibrated] }))
            .toBe("archived");
    });

    it("falls back to draft", () => {
        expect(resolveLifecycleStage({ status: "draft", statisticalModels: [] })).toBe("draft");
        expect(resolveLifecycleStage({})).toBe("draft");
    });

});
