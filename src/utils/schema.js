// schema.js
// Evidence-Centered Design schema with adaptive assessment support

// The single list of stored lifecycle statuses. Imported rather than
// re-typed: the competency-model check below used to hardcode
// ["draft", "confirmed"], which rejected every other status the matrix
// declares -- so the wizard's silent auto-save on Next threw
// "status must be draft or confirmed" the moment a reviewer walked a
// `reviewed` model past Step 2. (TaskModelList.jsx imports across this
// same boundary; vite bundles it for the client, node loads it directly
// on the server.)
import { STATUS, TRANSITIONS, canTransition } from "../../server/utils/lifecycleMatrix.js";

// D53b: the same "defined once, imported by both sides" boundary as the
// lifecycle matrix above. `dinaParametersAreUsable` is the ONE place that
// decides whether a slip/guess pair is usable (each in [0,1), guess < 1 -
// slip) -- schema.js re-implementing that range check in JSX/JS here would
// be exactly the "drift that produced five broken mirrors" defect this
// build's own retrospectives name; importing it keeps this file's
// confirm-time gate and attributeAccumulation.js's scoring-time gate
// unable to disagree.
import { dinaParametersAreUsable } from "../../server/delivery/attributeAccumulation.js";

// The shared ECD response vocabulary. Imported rather than restated so the
// item rules below and the Item Wizard read the SAME compatibility map --
// the previous `item.interaction.type === observable.type` rule compared two
// enums with no value in common, and was unsatisfiable for every item ever
// authored. See src/utils/ecdVocabulary.js for the full account.
import {
  INTERACTION_TYPE_VALUES,
  SCORING_METHOD_VALUES,
  isInteractionCompatible,
  interactionCompatibilityMessage,
  interactionTypesForObservable,
  responsePatternIsSpecified,
  SM_VARIABLE_TYPE_VALUES,
  isPriorFamilyCompatible,
  priorFamiliesForSmVariableType,
  priorDistributionParamsAreValid,
  PSYCHOLOGICAL_PERSPECTIVE_VALUES,
  CALIBRATION_FILE_KIND_VALUES,
  statisticalModelTypesForCalibrationKind,
  CALIBRATION_JOB_KIND_VALUES,
  BLOOM_LEVEL_VALUES,
  REASONING_TYPE_VALUES,
} from "./ecdVocabulary.js";
import { CALIBRATION_JOB_STATUS } from "../../server/utils/lifecycleMatrix.js";

// Canonical session status spellings -- see src/utils/sessionStatus.js for
// why "in_progress" (underscore) is the one, not "in-progress".
import { SESSION_STATUS } from "./sessionStatus.js";

export const schema = {

  // 🔹 Item Bank (ECD-Compliant)
  items: {
    id: 'string',

    /* ---------------------------------------------
      1️⃣ TASK MODEL INSTANTIATION (FOUNDATIONAL)
    --------------------------------------------- */
    taskModelId: 'string',        // REQUIRED
    taskModelVersion: 'number',   // version lock
    observationId: 'string',      // must be declared in TaskModel.expectedObservations
    evidenceModelId: 'string',    // derived via TaskModel → Observable
    evidenceModelVersion: 'number',

    /* ---------------------------------------------
      2️⃣ STIMULUS INSTANTIATION (Blueprint Constrained)
    --------------------------------------------- */
    stimulus: {
      layout: 'string', // single | composite | passage_based
      blocks: 'array'   // structured stimulus composition
    },

    /* ---------------------------------------------
      3️⃣ INTERACTION INSTANTIATION (Blueprint Constrained)
    --------------------------------------------- */
    interaction: {
      type: 'string',               // must match observable.type
      responseComponents: 'array'   // structured response capture
    },

    /* ---------------------------------------------
      4️⃣ SCORING ↔ EVIDENCE EXPLICIT MAPPING
    --------------------------------------------- */
    scoring: {
      method: 'string', // binary | partial | rubric | numeric | performance | likert
      maxScore: 'number',

      evidenceActivationMap: [{
        responsePattern: 'object',      // explicit scoring condition
        activatesObservable: 'boolean',
        strengthOverride: 'number',     // optional override (1–5)
        rationale: 'string'
      }]
    },

    /* ---------------------------------------------
      5️⃣ DOMAIN & COGNITIVE METADATA
    --------------------------------------------- */
    learningDomain: 'string', // cognitive | affective | psychomotor

    cognitiveDemand: {
      bloomLevel: 'string',
      soloLevel: 'string',
      reasoningType: 'string'
    },

    metadata: {
      subject: 'string',
      grade: 'string',
      topic: 'string',
      difficulty: 'string',
      difficultyJustification: 'string',
      tags: 'array',
      source: 'string'
    },

    /* ---------------------------------------------
      6️⃣ PSYCHOMETRICS (SUBORDINATE TO EM MODEL)
    --------------------------------------------- */
    psychometrics: {
      statisticalModelType: 'string',   // must match active EM model
      irtParams: {
        a: 'number',
        b: 'number',
        c: 'number',
        updatedAt: 'date',
        source: 'string'
      },
      // D53b: the DINA analogue of irtParams above -- a per-item pilot
      // slip/guess pair, author-owned in the Item Wizard, used ONLY when
      // the item's Evidence Model runs a 'dina' statistical model with no
      // active calibrated parameter set yet (sessionRoutes.js). 'gdina'
      // has no pilot field: its calibrated parameters are a probability
      // TABLE sized to each item's own required-attribute count, not a
      // fixed pair, and authoring that table is out of this field's scope.
      dinaParams: {
        slip: 'number',
        guess: 'number',
        updatedAt: 'date',
        source: 'string'
      },
      calibrationStatus: 'string'   // uncalibrated | pilot | calibrated
    },

    /* ---------------------------------------------
      7️⃣ OPERATIONAL GOVERNANCE
    --------------------------------------------- */
    equivalenceGroupId: 'string',
    exposureControl: {
      usageCount: 'number',
      maxUsageBeforeRetire: 'number',
      reactivationCount: 'number',
      maxReactivations: 'number'
    },

    /* ---------------------------------------------
      8️⃣ LIFECYCLE
    --------------------------------------------- */
    status: 'string',               // draft | reviewed | confirmed | operational | suspended | archived
    locked: 'boolean',
    versionNumber: 'number',
    parentItemId: 'string',

    creator: 'string',
    modifier: 'string',

    createdAt: 'date',
    updatedAt: 'date'
  },

  competencyModels: {
    id: 'string',
    name: 'string',
    description: 'string',
    measurementIntent: 'string',
    constructFramework: {
      reference: 'string',
      citation: 'string',
      notes: 'string',
      // Curricular grounding, selected in CompetencyWizard Step 3 from the
      // curricularPolicies uploaded under Settings > Policies > Curricular
      // Policies. `policyId` is the live reference; `policyName` and
      // `curricularGoals` are a denormalised snapshot taken at selection
      // time so a confirmed model still renders its provenance verbatim
      // even if the source policy is later edited or deleted (the same
      // reason evidence models snapshot competency labels).
      policyId: 'string',
      policyName: 'string',
      curricularGoalCodes: 'array',
      curricularGoals: 'array'
    },
    status: 'string',
    locked: 'boolean',
    versionNumber: 'number',
    parentModelId: 'string',

    // Student Model Variables -- see ecdVocabulary.js §6. Declared and
    // validated as of Day 16 (Week 4 core schema); no wizard step authors
    // this yet, so it is optional at every status, including confirmed --
    // making it required would strand every model confirmed before the
    // authoring UI exists. Each entry: { id, label, type, scale,
    // priorDistribution: { family, params } }. A DINA/G-DINA student model
    // is a vector of `binary`-type entries.
    smVariables: 'array',

    // See ecdVocabulary.js §7. Optional single enum, validated if present.
    psychologicalPerspective: 'string',

    createdAt: 'date',
    updatedAt: 'date',
  },

  competencies: {
    id: 'string',
    name: 'string',
    description: 'string',
    variableType: 'string',
    states: [{
      value: 'string',
      label: 'string',
      description: 'string',
      order: 'number'
    }],
    scale: {
      min: 'number',
      max: 'number',
      interpretationGuide: 'string'
    },
    relationships: [{
      targetCompetencyId: 'string',
      type: 'string'
    }],
    domain: 'string',
    strand: 'string',
    facet: 'string',
    modelId: 'string',
    createdAt: 'date',
    updatedAt: 'date',
  },

  evidenceModels: {
    id: 'string',
    name: 'string',
    description: 'string',
    competencyId: 'string',
    competencyModelVersion: 'number',
    claimStatement: 'string',
    warrants: [{
      id: 'string',
      reasoningStatement: 'string',
      cognitiveAttribute: 'string',
      performanceCondition: 'string',
      limitationClause: 'string'
    }],
    observables: [{
      id: 'string',
      statement: 'string',
      type: 'string',
      warrantId: 'string',
      boundaryNote: 'string',
      evidenceRule: {
        direction: 'string',
        strengthLevel: 'number',
        activationCondition: 'string',
        justification: 'string'
      }
    }],
    statisticalModels: [{
      id: 'string',
      type: 'string',
      subtype: 'string',
      structureConfig: 'object',
      active: 'boolean',
      parameterSets: [{
        parameterSetId: 'string',
        parameters: 'object',
        calibratedAt: 'date',
        calibratedBy: 'string',
        calibrationMethod: 'string',
        sampleSize: 'number',
        notes: 'string',
        // Provenance, Day 19 (Week 4 core schema): a calibration run whose
        // package version and convergence cannot be stated is not
        // defensible (build reference Part 4.3). `packageVersion` and
        // `converged` are new; `sampleSize`/`calibratedAt` already existed
        // above but were never actually mandatory -- see the validation
        // block below, which makes all four jointly required and refuses
        // to store a non-converged run, regardless of status or `strict`.
        packageVersion: 'string',
        converged: 'boolean',
        // Optional: which of ecdVocabulary.js's CALIBRATION_FILE_KINDS this
        // run's source file declared itself as, validated for consistency
        // with the parent statisticalModel's `type` when present. Never
        // required -- unlike the four provenance fields above, this is
        // classification of the import, not evidence of run quality.
        calibrationKind: 'string',
        // ADR 0002 (Day 20): the rest of the calibration response contract,
        // alongside the four mandatory provenance fields above. Both
        // optional -- unlike provenance (an unconditional "can this run be
        // trusted at all" question), these answer "how good was the fit",
        // which not every calibration method produces and which genuinely
        // varies in shape by model family (IRT vs CTT vs DINA/G-DINA fit
        // indices share no common vocabulary). `fitStatistics` is
        // deliberately left loosely typed for that reason -- see the ADR.
        standardErrors: 'object',
        fitStatistics: 'object',
        // D62: the job that produced this set. Provenance that cannot be
        // traced back to its run is not provenance.
        calibrationJobId: 'string',
      }],
      activeParameterSetId: 'string',
    }],
      decisionRule: {
        type: 'string',         // mastery | classification | score_band | posterior_threshold
        threshold: 'number',    // cut score / posterior / theta threshold
        direction: 'string',    // above | below | within
        justification: 'string' // interpretive rationale
      },
    status: 'string',
    locked: 'boolean',
    createdAt: 'date',
    updatedAt: 'date'
  },

  taskModels: {
    id: 'string',
    name: 'string',
    description: 'string',
    designRationale: 'string',   // why this task form, for reviewers

    /* ---------------------------------------------
      1️⃣ STRICT EVIDENCE BINDING (MANDATORY)

      A TaskModel declares NO competency of its own. Its construct is
      derived from the Evidence Models it binds -- evidenceModel
      .competencyId -- and primaryEvidenceModelId names which of those
      bindings is the main inferential target. Because that field is a
      pointer INTO evidenceModelIds, the two can never disagree.

      The wizard previously carried a separate `taskPurpose`
      {primaryCompetencyId, excludedCompetencyIds}. It was never declared
      here, so it was never validated -- a second, unchecked declaration
      of the construct. It has been removed from the wizard and from
      server/utils/lifecycleValidation.js. Records predating that change
      may still carry the field; it is inert.
    --------------------------------------------- */
    evidenceModelIds: 'array',  // REQUIRED — at least one
    primaryEvidenceModelId: 'string',  // REQUIRED from `reviewed` onward

    /* ---------------------------------------------
      2️⃣ OBSERVABLE TARGETS
    --------------------------------------------- */
    expectedObservations: [{
      observationId: 'string',
      evidenceModelId: 'string',
      required: 'boolean',
      weight: 'number'
    }],

    taskStructure: {
      presentationMode: 'string',      // interactive | simulation | performance | constructed
      responseFormat: 'string',        // selected | constructed | hybrid
      stimulusPolicy: 'string',        // static | parameterized | generative
      timingConstraint: 'object',      // { timeLimitSeconds, pacingPolicy }
      resourceConstraints: 'object',   // toolsAllowed, collaborationAllowed, maxAttempts
      // Delivery context: environment, assessor, supportLevel,
      // supportDescription, affectiveLoad, socialExposure. Authored in
      // Step4TaskStructure. These constrain execution only -- they say
      // nothing about the task's claim, stakes or interpretation.
      administration: 'object'
    },

    blueprintConstraints: {
      difficultyRange: {
        min: 'number',
        max: 'number'
      },
      cognitiveDemand: {
        bloomLevel: 'string',
        reasoningType: 'string'
      },
      domainAlignment: {
        subject: 'string',
        gradeBand: 'string'
      },
      exposurePolicy: {
        maxUses: 'number',
        cooldownPolicy: 'string'
      },
      allowedInteractionTypes: 'array',
      allowedScoringMethods: 'array',
    },

    /* ---------------------------------------------
      3️⃣ STRUCTURAL COMPOSITION
    --------------------------------------------- */
    taskCompositionType: 'string',   // atomic | composite
    subTaskIds: 'array',             // ordered component TaskModel ids

    /* ---------------------------------------------
      4️⃣ PROCESS ACTION SPACE
    --------------------------------------------- */
    actions: 'array',

    /* ---------------------------------------------
      5️⃣ ITEM SCOPE (advisory)

      Which items are expected to elicit which observables. Read by
      SessionPlayer, TasksManager and TaskDetails. Never gates lifecycle
      promotion: items are normally authored after the TaskModel they
      instantiate, so requiring coverage at confirmation would make the
      ordinary authoring order impossible.
    --------------------------------------------- */
    selectedItemIds: 'array',
    itemMappings: 'array',   // [{ itemId, observationId, evidenceModelId }]

    /* ---------------------------------------------
      6️⃣ FAIRNESS & ACCESSIBILITY

      fairnessRisks entries are objects:
        { id, category, description, severity, mitigation }
      Records authored before that change hold bare strings; the client
      upgrades them on read via normalizeFairnessRisks().

      accessibilityAssumptions must have at least one populated field
      before the TaskModel can be promoted to `operational`.
    --------------------------------------------- */
    fairnessRisks: 'array',
    fairnessNotes: 'string',
    accessibilityAssumptions: 'object',

    /* ---------------------------------------------
      7️⃣ REUSE
    --------------------------------------------- */
    equivalenceGroupId: 'string',

    /* ---------------------------------------------
      8️⃣ GOVERNANCE
    --------------------------------------------- */
    status: 'string',        // draft | reviewed | confirmed | operational | archived
    locked: 'boolean',
    versionNumber: 'number',
    parentModelId: 'string',

    createdAt: 'date',
    updatedAt: 'date',
  },

  // tasks: {
  //   id: 'string',
  //   taskModelId: 'string',
  //   questionId: 'string',
  //   generatedEvidenceIds: 'array',
  //   generatedObservationIds: 'array',
  //   startTime: 'date',
  //   endTime: 'date',
  //   createdAt: 'date',
  //   updatedAt: 'date',
  // },

  students: {
    id: 'string',
    name: 'string',
    createdAt: 'date',
    updatedAt: 'date',
  },

  sessions: {
    id: 'string',
    studentId: 'string',
    // Group assignment: every assignee is also listed here so /mine can
    // match a typed username (stud1) or a students-collection id (stu…).
    studentIds: 'array',
    assignmentGroupId: 'string',
    cohortId: 'string',
    taskIds: 'array',
    currentTaskIndex: 'number',
    responses: [],
    // Deliberately untyped here -- see the deep validation block below
    // (`if (collection === "sessions")`) for the real structural checks on
    // `studentModel.smvPosteriors` (Day 33), the item-based Evidence
    // Accumulation posterior per Student Model Variable: { smvId, smvType,
    // evidenceModelId, parameterSetId, modelFamily, method, estimate,
    // precision, sem, responsesUsed, responsesExcluded, updatedAt }, keyed
    // by smvId. `studentModel.irtTheta`/`.bnPosteriors` are a separate,
    // pre-existing shape belonging to the legacy db.questions adaptive-
    // selection path -- not reused or extended by the new field.
    studentModel: 'object',
    selectionStrategy: 'string',
    nextTaskPolicy: 'object',
    status: 'string',
    isCompleted: 'boolean',
    startedAt: 'date',
    finishedAt: 'date',
    autoFinished: 'boolean',
    reviewedAt: 'date',
    updatedAt: 'date',
    // D58: the Assembly Model stop decision from selectNextActivity, persisted
    // on the session so /next-task is not the only place the reason lives.
    // Shape: { rule: "maxItems"|"targetsMet", assemblyModelId, reason,
    // targets?, stoppedAt }. Validated in the sessions block below. Absent
    // until a stopping rule actually fires; finishing by hand does not invent
    // one.
    stopped: 'object',
  },

  policies: {
    type: "object",
    required: ["id", "name", "type", "createdAt", "updatedAt"],
    properties: {
      id: { type: "string", pattern: "^p[0-9]+$" },
      name: { type: "string", minLength: 1 },
      description: { type: "string" },
      type: {
        type: "string",
        enum: ["fixed", "IRT", "BayesianNetwork", "MarkovChain"],
      },
      config: { type: "object" },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
    },
    additionalProperties: false,
  },

  // ------------------------------------------------------------------
  // curricularPolicies — a published curriculum document (e.g. NCF-SE
  // 2023) expressed as Curricular Goals -> Competencies -> Learning
  // Outcomes. Deliberately a SEPARATE collection from `policies` above:
  // `policies` are adaptive item-SELECTION policies consumed by sessions
  // (fixed/IRT/BayesianNetwork/MarkovChain), and mixing curriculum
  // documents into that enum would leak them into every session/report
  // policy picker. Uploaded as JSON under Settings > Policies >
  // Curricular Policies, consumed by CompetencyWizard Step 3.
  // Declared in the plain-shape style (not the JSON-schema style used by
  // `policies`) so validateEntity falls through to the generic field loop
  // and then reaches the deep `collection === "curricularPolicies"` block
  // below — the JSON-schema branch returns early and never would.
  // ------------------------------------------------------------------
  curricularPolicies: {
    id: 'string',
    name: 'string',
    description: 'string',
    version: 'string',
    issuingBody: 'string',
    subject: 'string',
    stage: 'string',
    curricularGoals: 'array',
    createdAt: 'date',
    updatedAt: 'date',
  },

  // ------------------------------------------------------------------
  // assemblyModels — Day 17 (Week 4 core schema). Declared and validated
  // only; not mounted, no UI, no lifecycle wiring yet (that's Day 21's
  // "matrix entries + validateXLifecycle() for each new core collection").
  //
  // `{targetsBySMV: [{smvId, requiredSEM | requiredClassificationAccuracy}],
  // stoppingRules, selectionAlgorithm}` per the build reference: an Assembly
  // Model states, per Student Model Variable on a Competency Model, how
  // precisely it must be estimated before a session can stop -- a standard
  // error target for a continuous SMV, a classification-accuracy target
  // for a binary/ordinal/categorical one (see ecdVocabulary.js SM_VARIABLE_
  // TYPES). `selectionAlgorithm` is a POINTER to an existing `policies`
  // record (fixed/IRT/BayesianNetwork/MarkovChain), not a duplicated copy
  // of its `type` -- the "one pointer, validated on both sides" invariant.
  //
  // Declared in the plain-shape style, not the JSON-schema style `policies`
  // uses above, for the same reason `curricularPolicies` is: the JSON-schema
  // branch in validateEntity returns early and would never reach the deep
  // `collection === "assemblyModels"` referential-integrity checks below.
  // ------------------------------------------------------------------
  assemblyModels: {
    id: 'string',
    name: 'string',
    description: 'string',
    competencyModelId: 'string',
    competencyModelVersion: 'number',
    targetsBySMV: 'array',
    stoppingRules: 'object',
    selectionAlgorithm: 'object',
    status: 'string',
    // Day 21 (Week 5): lifecycle wiring. `locked`/`versionNumber`/
    // `parentModelId` bring this entity's shape in line with every other
    // lifecycle-governed collection (competencyModels, taskModels, items),
    // since validateAssemblyModelLifecycle (server/utils/lifecycleValidation.js)
    // and the confirmed-requires-locked check below both need them. Full
    // version-migration governance (the multi-step chain competencyModels
    // has) is NOT built here -- out of scope for "legal transitions + a
    // promotion validator."
    locked: 'boolean',
    versionNumber: 'number',
    parentModelId: 'string',
    createdAt: 'date',
    updatedAt: 'date',
  },

  // ------------------------------------------------------------------
  // qMatrixModels — Day 18 (Week 4 core schema). Declared and validated
  // only; not mounted, no UI, no lifecycle wiring yet. The Q-matrix editor
  // itself and the DINA/G-DINA config panel on the Evidence Model are both
  // explicitly W10 deliverables in the build reference -- this collection
  // exists here only so `dina`/`gdina` statisticalModels entries (added to
  // `evidenceModels` below) have something real to point at and validate
  // against.
  //
  // An attributes x items matrix: `attributeIds` are the columns, and MUST
  // each be a `binary`-type entry in the bound competency model's
  // `smVariables[]` (see ecdVocabulary.js SM_VARIABLE_TYPES) -- a Q-matrix
  // over a continuous SMV is a category error, not a stricter variant.
  // `entries[]` are the sparse cells: which items require which attributes.
  //
  // Named `qMatrixModels`, not `qMatrices`, so it survives dbAdapter.js's
  // naive trailing-"s" singularizer (`qMatrices` -> `qMatrice`, wrong;
  // `qMatrixModels` -> `qMatrixModel`, correct) -- see CLAUDE.md's note on
  // keeping collection names simple plurals.
  //
  // Declared in the plain-shape style for the same reason `assemblyModels`
  // and `curricularPolicies` are: the JSON-schema branch in validateEntity
  // returns early and would never reach the deep
  // `collection === "qMatrixModels"` referential-integrity checks below.
  // ------------------------------------------------------------------
  qMatrixModels: {
    id: 'string',
    name: 'string',
    description: 'string',
    competencyModelId: 'string',
    competencyModelVersion: 'number',
    attributeIds: 'array',
    entries: 'array',
    status: 'string',
    // Day 21 (Week 5): lifecycle wiring -- see the identical comment on
    // assemblyModels above.
    locked: 'boolean',
    versionNumber: 'number',
    parentModelId: 'string',
    createdAt: 'date',
    updatedAt: 'date',
  },

  // ------------------------------------------------------------------
  // compositeLibrary — Day 19 (Week 4 core schema). Schema declaration
  // only: the actual builder (`compositeLibrary/builder.js`, walking
  // Task Model -> items -> evidence models to COMPILE a package) is Day
  // 24. This just gives that future builder something real to write into
  // and validate against, per-item referential integrity today.
  //
  // Deliberately has NO `status`/lifecycle. Per the build reference, a
  // composite library entry is "a compiled versioned package built at
  // Task Model activation" -- a build ARTIFACT keyed by
  // (taskModelId, taskModelVersion), not an authored entity a human
  // drafts/reviews/revises. `parameterSets[]` above is the closer
  // precedent in this codebase: append-only, stamped at creation, never
  // transitioned through a status enum. `active` marks which package is
  // currently served for a given taskModelId; at most one may be active
  // (enforced below), the same "exactly one active X" shape as
  // statisticalModels' activeCount check.
  //
  // Declared in the plain-shape style for the same reason `assemblyModels`
  // and `qMatrixModels` are: the JSON-schema branch in validateEntity
  // returns early and would never reach the deep
  // `collection === "compositeLibrary"` referential-integrity checks below.
  // ------------------------------------------------------------------
  compositeLibrary: {
    id: 'string',
    taskModelId: 'string',
    taskModelVersion: 'number',
    compiledAt: 'date',
    active: 'boolean',
    items: 'array',
    createdAt: 'date',
    updatedAt: 'date',
  },

  // ------------------------------------------------------------------
  // calibrationJobs — D62 (W13). Node-side job record for offline R
  // calibration. Not an authored entity: status is queued/running/
  // succeeded/failed/cancelled (lifecycleMatrix.js), not draft/reviewed.
  // Seven-artefact contract: this block, validateEntity below, lifecycle
  // validator, routes + role gate, vocabulary, readiness mirror, tests.
  // ------------------------------------------------------------------
  calibrationJobs: {
    id: 'string',
    kind: 'string',
    status: 'string',
    evidenceModelId: 'string',
    statisticalModelId: 'string',
    requestedBy: 'string',
    requestedAt: 'date',
    startedAt: 'date',
    finishedAt: 'date',
    request: 'object',
    response: 'object',
    error: 'object',
    attempts: 'number',
    maxAttempts: 'number',
    ingestedParameterSetId: 'string',
    retainUntil: 'date',
    createdAt: 'date',
    updatedAt: 'date',
  },
};

// ------------------------------
// Validation function (Refactored — Structural Cleanup)
// All original validation logic preserved.
// Only structural relocation of compatibility + audit blocks.
// ------------------------------

/* =====================================================
   🔹 EVIDENCE MODEL LINKABILITY
   -----------------------------------------------------
   "Confirmed" was used throughout as shorthand for "governed and
   structurally frozen, therefore safe to point a task model or item
   at". That shorthand held only because nothing could ever leave the
   confirmed state. Now that an evidence model can be activated and
   suspended, a literal `status === "confirmed"` test silently breaks
   every downstream link the moment the model goes live: task models
   referencing it fail validation, and no new ones can be created
   against it.

   All three of confirmed / operational / suspended are locked, version-
   stable states -- structure cannot change in any of them, which is the
   property downstream entities actually depend on. Archived is
   deliberately excluded: a retired model must not accept NEW links.
===================================================== */

export const LINKABLE_EVIDENCE_MODEL_STATUSES = [
  "confirmed",
  "operational",
  "suspended",
];

export function isLinkableEvidenceModel(em) {
  return (
    !!em &&
    !!em.locked &&
    LINKABLE_EVIDENCE_MODEL_STATUSES.includes(em.status)
  );
}

// F14 (D53a live walk, session 10; fixed D53b): the same "locked,
// structurally-frozen" set as LINKABLE_EVIDENCE_MODEL_STATUSES above,
// applied to the Q-matrix a DINA/G-DINA statistical model binds to. Before
// this, NOTHING checked the bound Q-matrix's own lifecycle status -- only
// that it existed and its attributes were binary -- so a confirmed, locked
// Evidence Model could cite a Q-matrix an author was still actively
// editing (draft/reviewed), or one withdrawn from service (archived), and
// the "no draft parent" rule the rest of this chain enforces
// (isLinkableEvidenceModel, isInstantiableTaskModel) simply did not apply
// to this one pointer.
export const LINKABLE_QMATRIX_STATUSES = [
  "confirmed",
  "operational",
  "suspended",
];

/* A TaskModel an Item may instantiate.

   Same shape, and the same past mistake, as the evidence-model predicate
   above: the item validator tested `tm.status !== "confirmed"` literally.
   That was shorthand for "locked and structurally frozen", written when
   nothing could ever leave the confirmed state. Now that a TaskModel can
   be activated and suspended, the literal test meant that the moment a
   TaskModel went operational, EVERY item bound to it failed validation --
   so an operational task's items could no longer be edited, retired or
   even suspended. The safety valve was welded shut by activation itself.

   Archived is excluded: an archived TaskModel accepts no new instantiations.
   `locked` is still required -- a draft or reviewed TaskModel is not a
   stable target. */
export const INSTANTIABLE_TASK_MODEL_STATUSES = [
  "confirmed",
  "operational",
  "suspended",
];

/* ------------------------------------------------------------
   taskStructure.resourceConstraints.toolsAllowed

   Two components used to disagree about this field's type: the Task
   Model editor (Step4TaskStructure) wrote a comma-separated FREE-TEXT
   STRING while the Item Wizard read it as a `string[]` and called
   `.join()` on it, unmounting the whole admin console to a blank page
   for any Task Model that actually named a tool.

   The array is the real type. The Task Model editor has written arrays
   since that fix, and server/migrations/migrations/002-normalize-tools-allowed.js
   rewrote every remaining comma-separated string on disk, so this reader
   no longer needs to tolerate both shapes -- every consumer still reads
   through here rather than touching the field directly, in case a future
   record ever fails to normalize.
------------------------------------------------------------ */
export function toolsAllowedList(resourceConstraints) {
  const raw = resourceConstraints?.toolsAllowed;

  if (!Array.isArray(raw)) return [];

  return raw.map((t) => String(t ?? "").trim()).filter(Boolean);
}

export function isInstantiableTaskModel(tm) {
  return (
    !!tm &&
    !!tm.locked &&
    INSTANTIABLE_TASK_MODEL_STATUSES.includes(tm.status)
  );
}

export function validateEntity(collection, obj, db = null, options = {}) {
  const rules = schema[collection];
  if (!rules) return { valid: false, errors: ["Unknown collection"] };
  const errors = [];

  // `strict` gates structural-COMPLETENESS checks only (e.g. "binary
  // competency must have exactly 2 states", "continuous scale must define
  // min/max", "at least one observable is required"). Those fields are
  // filled in across multiple wizard steps, so enforcing them on every
  // intermediate draft save blocks the wizard before the user ever reaches
  // the step where that UI lives -- an Evidence Model draft saved on the way
  // out of Step 3 (Warrants) legitimately has no observables, no evidence
  // rules and no statistical model yet, and used to be rejected with
  // "Observable ... missing" / "At least one statistical model is required"
  // in a red toast that made Next look broken.
  //
  // What is NEVER gated: referential integrity (a dangling warrantId), value
  // validity for values that ARE present (an evidenceRule.direction outside
  // the enum), and lifecycle guards. Only the presence of things a later
  // wizard step authors is relaxed. Confirm-time validation runs strict, so
  // nothing incomplete can be locked.
  //
  // Defaults to true so every existing call site keeps its current strict
  // behavior; draft-time competency and evidence-model saves opt out
  // explicitly with { strict: false }.
  const strict = options.strict !== false;

  /* `allowDraftParents` relaxes ONE thing and nothing else: the guards that
     require a referenced PARENT to already be confirmed + locked (an Item's
     Task Model and Evidence Model, a Task Model's Evidence Models).
     Referential integrity is untouched -- the parent must still exist, the
     observation must still be declared, versions must still agree.

     It exists for the bulk importers, which land a whole authored chain as
     drafts in one sitting: uploading a Task Model file should not require
     stopping to run Lock & Confirm on every Evidence Model first. Nothing
     goes live unvalidated, because CONFIRMATION never passes this flag --
     the same guards run strict at the moment a record is locked, which is
     the point at which they actually protect anything.

     Defaults to false, so every existing call site is unchanged. */
  const allowDraftParents = options.allowDraftParents === true;

  function validateField(key, def, val) {
    if (val === undefined || val === null) return;
    switch (def.type) {
      case "string":
        if (typeof val !== "string") errors.push(`${key} should be string`);
        if (def.enum && !def.enum.includes(val)) {
          errors.push(`${key} must be one of: ${def.enum.join(", ")}`);
        }
        if (def.minLength && val.length < def.minLength) {
          errors.push(`${key} must be at least ${def.minLength} characters`);
        }
        if (def.format === "date-time") {
          const d = new Date(val);
          if (isNaN(d.getTime())) errors.push(`${key} should be a valid date-time`);
        }
        break;
      case "number":
        if (typeof val !== "number") errors.push(`${key} should be number`);
        break;
      case "boolean":
        if (typeof val !== "boolean") errors.push(`${key} should be boolean`);
        break;
      case "array":
        if (!Array.isArray(val)) errors.push(`${key} should be array`);
        break;
      case "object":
        if (typeof val !== "object" || Array.isArray(val)) {
          errors.push(`${key} should be object`);
        }
        break;
    }
  }

  if (rules.type === "object" && rules.properties) {
    for (const reqField of rules.required || []) {
      if (obj[reqField] === undefined || obj[reqField] === null) {
        errors.push(`Missing field: ${reqField}`);
      }
    }
    for (const [key, def] of Object.entries(rules.properties)) {
      validateField(key, def, obj[key]);
    }
    return { valid: errors.length === 0, errors };
  }

  for (const key of Object.keys(rules)) {
    const expected = rules[key];
    const val = obj[key];
    if (val === undefined || val === null) continue;
    if (expected === "string" && typeof val !== "string") errors.push(`${key} should be string`);
    if (expected === "number" && typeof val !== "number") errors.push(`${key} should be number`);
    if (expected === "boolean" && typeof val !== "boolean") errors.push(`${key} should be boolean`);
    if (expected === "array" && !Array.isArray(val)) errors.push(`${key} should be array`);
    if (expected === "object" && (typeof val !== "object" || Array.isArray(val))) errors.push(`${key} should be object`);
    if (expected === "date") {
      const d = new Date(val);
      if (isNaN(d.getTime())) errors.push(`${key} should be date`);
    }
  }

  /* =====================================================
     CURRICULAR POLICIES — CURRICULUM DOCUMENT STRUCTURE
     Uploaded as JSON under Settings > Policies > Curricular
     Policies, consumed by CompetencyWizard Step 3. Validated
     deeply here because the whole point of the upload is that
     Step 3's dropdowns can trust the goal codes/statements —
     a policy whose goals lack codes renders as blank options.
  ===================================================== */

  if (collection === "curricularPolicies") {

    if (!obj.name || obj.name.trim().length < 3) {
      errors.push("Curricular policy name is required (min 3 characters).");
    }

    if (!Array.isArray(obj.curricularGoals) || obj.curricularGoals.length === 0) {
      errors.push("At least one curricular goal is required.");
    } else {
      const seenGoalCodes = new Set();

      obj.curricularGoals.forEach((goal, gi) => {
        const where = `curricularGoals[${gi}]`;

        if (!goal || typeof goal !== "object" || Array.isArray(goal)) {
          errors.push(`${where} must be an object.`);
          return;
        }

        if (!goal.code || typeof goal.code !== "string" || !goal.code.trim()) {
          errors.push(`${where} is missing a code (e.g. "CG-1").`);
        } else if (seenGoalCodes.has(goal.code.trim())) {
          // Step 3 keys its multi-select by goal code, so duplicates would
          // make two options indistinguishable and collide on selection.
          errors.push(`${where} duplicates curricular goal code "${goal.code}".`);
        } else {
          seenGoalCodes.add(goal.code.trim());
        }

        if (!goal.statement || typeof goal.statement !== "string" || goal.statement.trim().length < 5) {
          errors.push(`${where} is missing a statement (min 5 characters).`);
        }

        if (goal.competencies !== undefined && !Array.isArray(goal.competencies)) {
          errors.push(`${where}.competencies must be an array when present.`);
        }

        const seenCompetencyCodes = new Set();

        (Array.isArray(goal.competencies) ? goal.competencies : []).forEach((comp, ci) => {
          const cWhere = `${where}.competencies[${ci}]`;

          if (!comp || typeof comp !== "object" || Array.isArray(comp)) {
            errors.push(`${cWhere} must be an object.`);
            return;
          }

          if (!comp.code || typeof comp.code !== "string" || !comp.code.trim()) {
            errors.push(`${cWhere} is missing a code (e.g. "C-1.1").`);
          } else if (seenCompetencyCodes.has(comp.code.trim())) {
            errors.push(`${cWhere} duplicates competency code "${comp.code}".`);
          } else {
            seenCompetencyCodes.add(comp.code.trim());
          }

          if (!comp.statement || typeof comp.statement !== "string" || comp.statement.trim().length < 5) {
            errors.push(`${cWhere} is missing a statement (min 5 characters).`);
          }

          if (comp.learningOutcomes !== undefined) {
            if (!Array.isArray(comp.learningOutcomes)) {
              errors.push(`${cWhere}.learningOutcomes must be an array of strings.`);
            } else if (comp.learningOutcomes.some((lo) => typeof lo !== "string")) {
              errors.push(`${cWhere}.learningOutcomes must contain only strings.`);
            }
          }
        });
      });
    }
  }

  /* =====================================================
     STRICT ECD VALIDATION — EVIDENCE MODELS (CLEANED)
  ===================================================== */

  if (collection === "evidenceModels") {

    if (!obj.competencyId) {
      errors.push("Evidence model must reference exactly one competencyId.");
    } else if (db && !db.competencies?.find(c => c.id === obj.competencyId)) {
      errors.push(`Invalid competencyId: ${obj.competencyId}`);
    }

    if (strict || obj.claimStatement) {
      if (!obj.claimStatement || obj.claimStatement.trim().length < 20) {
        errors.push("claimStatement is required and must be meaningful.");
      }
    }

    if (strict && (!Array.isArray(obj.warrants) || obj.warrants.length === 0)) {
      errors.push("At least one warrant is required.");
    }

    const warrantIds = new Set();
    for (const w of obj.warrants || []) {
      if (!w.id) errors.push("Warrant missing id.");
      if (strict) {
        if (!w.reasoningStatement) errors.push(`Warrant ${w.id} missing reasoningStatement.`);
        if (!w.cognitiveAttribute) errors.push(`Warrant ${w.id} missing cognitiveAttribute.`);
        if (!w.performanceCondition) errors.push(`Warrant ${w.id} missing performanceCondition.`);
        // The Toulmin rebuttal. WarrantCard writes it as `limitationClause`;
        // WarrantBuilder used to emit the very same thing under the name
        // `rebuttalCondition`, so a builder-created warrant failed this check
        // even though the author had filled the field in. WarrantBuilder now
        // writes the canonical name, but accept either so warrants saved
        // before that fix still validate.
        if (!w.limitationClause && !w.rebuttalCondition) {
          errors.push(`Warrant ${w.id} missing limitationClause.`);
        }
      }
      warrantIds.add(w.id);
    }

    if (strict && (!Array.isArray(obj.observables) || obj.observables.length === 0)) {
      errors.push("At least one observable is required.");
    }

    // Evidence rules are edited in the wizard (Step5EvidenceRules /
    // EvidenceRulePanel) as a top-level `evidenceRules[]` array keyed by
    // observableId, but most downstream consumers (the rest of this
    // function's decisionRule/statistics checks, evidenceDiagnosticsEngine,
    // BayesianEvidenceNetwork, StatisticalModelCard, ObservableMappingTable,
    // CPTEditorPanel, EvidenceChainCard, ItemWizard's Step2_ECDAlignment)
    // read an embedded `observable.evidenceRule` object. EvidenceWizardContext
    // now keeps both in sync on every add/update/remove, but fall back to the
    // array here too so this still validates correctly for any
    // already-persisted model saved before that sync existed. Without this
    // fallback, Step 6/7 could report "Observable ... missing evidenceRule"
    // even while the wizard's own "Evidence rules compatible with selected
    // model" check passed, because the two were reading different fields for
    // the same data.
    const evidenceRuleByObservableId = new Map(
      (obj.evidenceRules || []).map(r => [r.observableId, r])
    );

    for (const o of obj.observables || []) {
      if (!o.id) errors.push("Observable missing id.");
      if (strict && !o.statement) errors.push(`Observable ${o.id} missing statement.`);
      if (strict && !o.type) errors.push(`Observable ${o.id} missing type.`);

      if (!o.warrantId) {
        if (strict) errors.push(`Observable ${o.id} must reference exactly one warrantId.`);
      } else if (!warrantIds.has(o.warrantId)) {
        // Referential integrity, not completeness -- a dangling warrantId is
        // wrong at every lifecycle stage, so this fires in draft mode too.
        errors.push(`Observable ${o.id} references invalid warrantId: ${o.warrantId}`);
      }

      const er = o.evidenceRule || evidenceRuleByObservableId.get(o.id);
      if (!er) {
        if (strict) errors.push(`Observable ${o.id} missing evidenceRule.`);
      } else {
        if (strict || er.direction !== undefined) {
          if (!["supports", "weakens", "neutral"].includes(er.direction)) {
            errors.push(`Observable ${o.id} has invalid evidenceRule.direction.`);
          }
        }
        if (strict || er.strengthLevel !== undefined) {
          if (typeof er.strengthLevel !== "number" || er.strengthLevel < 1 || er.strengthLevel > 5) {
            errors.push(`Observable ${o.id} evidenceRule.strengthLevel must be 1–5.`);
          }
        }
        if (strict) {
          if (!er.activationCondition) errors.push(`Observable ${o.id} missing evidenceRule.activationCondition.`);
          if (!er.justification) errors.push(`Observable ${o.id} missing evidenceRule.justification.`);
        }
      }
    }

    if (strict) {
      for (const wId of warrantIds) {
        const linked = (obj.observables || []).some(o => o.warrantId === wId);
        if (!linked) errors.push(`Warrant ${wId} has no linked observables.`);
      }
    }

    if (strict && (!Array.isArray(obj.statisticalModels) || obj.statisticalModels.length === 0)) {
      errors.push("At least one statistical model is required.");
    }

    let activeCount = 0;

    for (const sm of obj.statisticalModels || []) {
      if (!sm.id) errors.push("Statistical model missing id.");
      if (strict && !sm.type) errors.push(`Statistical model ${sm.id} missing type.`);
      if (strict && !sm.structureConfig) errors.push(`Statistical model ${sm.id} missing structureConfig.`);
      if (sm.active) activeCount++;

      if (sm.type === "irt" && sm.structureConfig?.dimensions > 1) {
        errors.push(`Statistical model ${sm.id} violates single-latent constraint.`);
      }

      if (strict && sm.type === "bayesian_network") {
        const latentNodes = sm.structureConfig?.latentNodes || [];
        if (latentNodes.length !== 1) {
          errors.push(`Bayesian model ${sm.id} must contain exactly one latent node.`);
        }
      }

      /* DINA / G-DINA — Day 18. A diagnostic classification model is
         defined over a Q-matrix, not authored freestanding, so its
         structureConfig carries a POINTER (`qMatrixId`) rather than a
         duplicated copy of the attribute list. Every attribute the bound
         Q-matrix declares must be a binary SMV -- this is the check the
         Day 18 exit criterion names ("a G-DINA model ... refuses a
         continuous SMV"), enforced here even though qMatrixModels' own
         validation already enforces it at authoring time, because this
         evidence model may be validated against a `db` snapshot where
         that invariant was violated by some other path. */
      if (sm.type === "dina" || sm.type === "gdina") {
        const qMatrixId = sm.structureConfig?.qMatrixId;

        if (strict && !qMatrixId) {
          errors.push(`Statistical model ${sm.id} (${sm.type}) requires structureConfig.qMatrixId.`);
        }

        if (qMatrixId && db) {
          const qMatrix = db.qMatrixModels?.find(q => q.id === qMatrixId);
          if (!qMatrix) {
            errors.push(`Statistical model ${sm.id} (${sm.type}) references unknown qMatrixId '${qMatrixId}'.`);
          } else {
            const boundCompetencyModel = db.competencyModels?.find(m => m.id === qMatrix.competencyModelId);
            const nonBinaryAttr = (qMatrix.attributeIds || [])
              .map(attrId => boundCompetencyModel?.smVariables?.find(smv => smv.id === attrId))
              .find(smv => smv && smv.type !== "binary");

            if (nonBinaryAttr) {
              errors.push(
                `Statistical model ${sm.id} (${sm.type}) is bound to Q-matrix '${qMatrixId}', which references non-binary SMV '${nonBinaryAttr.id}' (type '${nonBinaryAttr.type}'). DINA/G-DINA models require every Q-matrix attribute to be a binary Student Model Variable.`
              );
            }

            // F14 fix: the pointer itself must be to a locked, structurally
            // -frozen Q-matrix, exactly as every other cross-entity pointer
            // in this chain already requires of its parent. Gated by
            // `allowDraftParents` for the same reason isLinkableEvidenceModel
            // is -- staged bulk import cites still-draft parents on purpose.
            if (!allowDraftParents && !LINKABLE_QMATRIX_STATUSES.includes(qMatrix.status)) {
              errors.push(
                `Statistical model ${sm.id} (${sm.type}) is bound to Q-matrix '${qMatrixId}', which is '${qMatrix.status}'. DINA/G-DINA models may only bind to a confirmed, operational or suspended Q-matrix.`
              );
            }
          }
        }
      }

      if (obj.status === "draft" && sm.parameterSets?.length > 0) {
        errors.push(`Draft evidence model cannot contain parameterSets.`);
      }

      /* PROVENANCE — Day 19. Mandatory on every parameterSet, at every
         status (never gated by `strict`): a calibration run whose package
         version and convergence cannot be stated is not defensible, and a
         run that did not converge must be refused outright rather than
         stored as though it were usable. */
      for (const ps of sm.parameterSets || []) {
        const psTag = ps.parameterSetId || "(missing id)";

        if (!ps.packageVersion) {
          errors.push(`Parameter set ${psTag} on model ${sm.id} requires packageVersion.`);
        }
        if (typeof ps.sampleSize !== "number" || ps.sampleSize <= 0) {
          errors.push(`Parameter set ${psTag} on model ${sm.id} requires a positive sampleSize.`);
        }
        if (!ps.calibratedAt) {
          errors.push(`Parameter set ${psTag} on model ${sm.id} requires calibratedAt.`);
        }
        if (typeof ps.converged !== "boolean") {
          errors.push(`Parameter set ${psTag} on model ${sm.id} must declare converged.`);
        } else if (!ps.converged) {
          errors.push(`Parameter set ${psTag} on model ${sm.id} did not converge and cannot be stored as a parameter set.`);
        }

        if (ps.calibrationKind !== undefined && ps.calibrationKind !== null) {
          if (!CALIBRATION_FILE_KIND_VALUES.includes(ps.calibrationKind)) {
            errors.push(`Parameter set ${psTag} on model ${sm.id} has invalid calibrationKind '${ps.calibrationKind}'. Must be one of: ${CALIBRATION_FILE_KIND_VALUES.join(", ")}.`);
          } else if (!statisticalModelTypesForCalibrationKind(ps.calibrationKind).includes(sm.type)) {
            errors.push(`Parameter set ${psTag} on model ${sm.id} declares calibrationKind '${ps.calibrationKind}', which does not apply to statistical model type '${sm.type}'.`);
          }
        }

        // ADR 0002: optional, but if present must actually be the object
        // shape the contract describes -- not required of every run.
        if (ps.standardErrors !== undefined && ps.standardErrors !== null) {
          if (typeof ps.standardErrors !== "object" || Array.isArray(ps.standardErrors)) {
            errors.push(`Parameter set ${psTag} on model ${sm.id} has invalid standardErrors: should be object.`);
          }
        }
        if (ps.fitStatistics !== undefined && ps.fitStatistics !== null) {
          if (typeof ps.fitStatistics !== "object" || Array.isArray(ps.fitStatistics)) {
            errors.push(`Parameter set ${psTag} on model ${sm.id} has invalid fitStatistics: should be object.`);
          }
        }
      }

      if (obj.status === "confirmed") {
        if (!Array.isArray(sm.parameterSets) || sm.parameterSets.length === 0) {
          errors.push(`Confirmed model ${sm.id} must contain at least one parameterSet.`);
        }
        if (!sm.activeParameterSetId) {
          errors.push(`Confirmed model ${sm.id} must specify activeParameterSetId.`);
        } else {
          const exists = sm.parameterSets.find(p => p.parameterSetId === sm.activeParameterSetId);
          if (!exists) errors.push(`Invalid activeParameterSetId in model ${sm.id}.`);
        }
      }
    }

    if (strict && activeCount !== 1) {
      errors.push("Exactly one statistical model must be active.");
    }

    /* ---------------------------------------------------
      PHASE 8 — STEP 1
      CLAIM-LEVEL DECISION RULE VALIDATION
    --------------------------------------------------- */

    if (obj.status === "confirmed") {

      if (!obj.decisionRule) {
        errors.push("Confirmed evidence model must define decisionRule.");
      } else {

        const dr = obj.decisionRule;

        if (!dr.type) {
          errors.push("decisionRule.type is required.");
        }

        if (typeof dr.threshold !== "number") {
          errors.push("decisionRule.threshold must be numeric.");
        }

        if (!["above", "below", "within"].includes(dr.direction)) {
          errors.push("decisionRule.direction must be above, below, or within.");
        }

        if (!dr.justification || dr.justification.length < 10) {
          errors.push("decisionRule.justification must be meaningful.");
        }

        if (db) {
          const competency = db.competencies?.find(
            c => c.id === obj.competencyId
          );

          if (competency) {

            if (competency.variableType === "binary" && dr.type !== "mastery") {
              errors.push("Binary competency must use mastery decision rule.");
            }

            if (competency.variableType === "ordinal" && dr.type !== "classification") {
              errors.push("Ordinal competency must use classification decision rule.");
            }

            if (competency.variableType === "continuous" && dr.type !== "posterior_threshold") {
              errors.push("Continuous competency must use posterior_threshold decision rule.");
            }

            if (competency.variableType === "categorical" && dr.type !== "classification") {
              errors.push("Categorical competency must use classification decision rule.");
            }
          }
        }
      }
    }

    /* ---------------------------------------------------
      PHASE 8 — STEP 2
      HIGH-STAKES DECISION PROTECTION
    --------------------------------------------------- */

    if (obj.status === "confirmed" && obj.decisionRule) {

      const dr = obj.decisionRule;

      if (["mastery", "posterior_threshold"].includes(dr.type)) {

        if (!dr.justification || !dr.justification.toLowerCase().includes("calibration")) {
          errors.push(
            "High-stakes mastery/posterior decisions must reference calibration basis in justification."
          );
        }
      }

      if (typeof dr.threshold === "number") {

        if (dr.threshold > 0.95 || dr.threshold < 0.05) {
          if (!dr.justification || dr.justification.length < 25) {
            errors.push(
              "Extreme decision thresholds require detailed justification (>=25 characters)."
            );
          }
        }
      }

      if (dr.direction === "within" && dr.type === "mastery") {
        errors.push(
          "Mastery decisions cannot use 'within' direction. Use 'above' or 'below'."
        );
      }
    }

    /* ---------------------------------------------------
       PHASE 8 — STEP 3
       DECISION RULE ↔ COMPETENCY STATE ALIGNMENT
    --------------------------------------------------- */

    if (obj.status === "confirmed" && db) {

      const competency = db.competencies?.find(
        c => c.id === obj.competencyId
      );

      if (!obj.decisionRule) {
        errors.push("Confirmed evidence model must define decisionRule.");
      } else if (competency) {

        const dr = obj.decisionRule;
        const vType = competency.variableType;

        // ---------- BINARY ----------
        if (vType === "binary") {
          if (dr.type !== "mastery") {
            errors.push("Binary competency must use mastery decision rule.");
          }
          if (typeof dr.threshold !== "number") {
            errors.push("Binary mastery decision requires numeric threshold.");
          }
        }

        // ---------- ORDINAL ----------
        if (vType === "ordinal") {
          if (dr.type !== "classification" && dr.type !== "score_band") {
            errors.push("Ordinal competency must use classification or score_band decision rule.");
          }

          if (!Array.isArray(competency.states) || competency.states.length < 2) {
            errors.push("Ordinal competency must define ordered states for classification.");
          }
        }

        // ---------- CONTINUOUS ----------
        if (vType === "continuous") {
          if (dr.type !== "posterior_threshold") {
            errors.push("Continuous competency must use posterior_threshold decision rule.");
          }

          if (!competency.scale) {
            errors.push("Continuous competency must define scale for threshold interpretation.");
          }
        }

        // ---------- CATEGORICAL ----------
        if (vType === "categorical") {
          if (dr.type !== "classification") {
            errors.push("Categorical competency must use classification decision rule.");
          }

          if (!Array.isArray(competency.states) || competency.states.length < 2) {
            errors.push("Categorical competency must define discrete states.");
          }
        }
      }
    }

    /* ---------------------------------------------------
       PHASE 8 — STEP 4
       DECISION RULE ↔ STATISTICAL MODEL SEMANTIC COHERENCE
    --------------------------------------------------- */

    if (obj.status === "confirmed" && obj.decisionRule) {

      const activeModel = obj.statisticalModels?.find(sm => sm.active);

      if (activeModel) {

        const dr = obj.decisionRule;

        // IRT / Rasch produce theta → cannot use score_band
        if (["irt", "rasch"].includes(activeModel.type)) {
          if (dr.type === "score_band") {
            errors.push(
              "IRT/Rasch models operate on latent theta; score_band decision rule is semantically incompatible."
            );
          }
        }

        // Bayesian Network, DINA and G-DINA all produce posterior/mastery
        // PROBABILITIES over discrete states, not a raw or latent score.
        if (["bayesian_network", "dina", "gdina"].includes(activeModel.type)) {
          if (dr.type === "mastery" && dr.threshold > 1) {
            errors.push(
              `${activeModel.type === "bayesian_network" ? "Bayesian network" : "DINA/G-DINA"} mastery decision must use posterior probability between 0 and 1.`
            );
          }
          if (dr.type === "score_band") {
            errors.push(
              `${activeModel.type === "bayesian_network" ? "Bayesian network" : "DINA/G-DINA"} does not support score_band without explicit discretization layer.`
            );
          }
        }

        // Classical Test Theory / Sum / Threshold models produce bounded
        // observed scores, not a posterior over a latent variable.
        if (["ctt", "sum", "threshold"].includes(activeModel.type)) {
          if (dr.type === "posterior_threshold") {
            errors.push(
              "Raw score models cannot use posterior_threshold decision rule."
            );
          }
        }

        // A standardized CTT score is norm-referenced: the cut is a z (or a
        // scaled score), so a threshold expressed as a raw proportion is
        // almost certainly a mistake carried over from another scale.
        if (activeModel.type === "ctt") {
          const scale = activeModel.structureConfig?.scoreScale;
          if (scale === "percent" && typeof dr.threshold === "number") {
            if (dr.threshold < 0 || dr.threshold > 100) {
              errors.push(
                "Percent-of-maximum CTT scores require a decision threshold between 0 and 100."
              );
            }
          }
        }
      }
    }



    /* ---------------------------------------------------
       VARIABLE TYPE ↔ STATISTICAL MODEL COMPATIBILITY
    --------------------------------------------------- */

    if (obj.status === "confirmed" && db) {
      const competency = db.competencies?.find(c => c.id === obj.competencyId);
      if (competency) {
        const vType = competency.variableType;
        for (const sm of obj.statisticalModels || []) {
          // "ctt" (Classical Test Theory) is permitted wherever the
          // competency is ORDERED -- binary, ordinal, continuous. A total
          // score presupposes that more evidence means further along the
          // construct, which is false for unordered categories, so
          // categorical deliberately excludes it. Mirrors
          // modelGuidanceLibrary.js's allowedVariableTypes -- keep the two
          // in step, or Step 6 will offer a model confirmation rejects.
          //
          // `dina`/`gdina` are declared allowed here (Day 18) WITHOUT a
          // matching modelGuidanceLibrary.js entry -- deliberately, since
          // that library drives Step 6's picker and the DINA/G-DINA config
          // panel is an explicit W10 deliverable, not this week's. That
          // asymmetry is safe in only this one direction: schema.js
          // permitting a model Step 6 doesn't yet offer can never produce
          // the "offered then rejected" bug the comment above warns about.
          if (vType === "binary") {
            const allowed = ["ctt", "rasch", "irt", "bayesian_network", "sum", "dina", "gdina"];
            if (!allowed.includes(sm.type)) errors.push(`Statistical model '${sm.type}' incompatible with binary competency.`);
            if (sm.type === "irt" && sm.subtype && sm.subtype !== "1pl") {
              errors.push("Binary competency allows only 1PL (Rasch) IRT.");
            }
          }
          if (vType === "ordinal") {
            // bayesian_network belongs here: a discrete Bayes net whose
            // latent node takes the competency's ordered states as its
            // values is a standard ECD measurement model for an ordinal
            // construct, and CPTEditorPanel already builds one row per
            // state. Leaving it out contradicted
            // modelGuidanceLibrary.js's allowedVariableTypes -- Step 6
            // offered the model (or, before this fix, silently hid it) and
            // confirmation then rejected it. Keep the two lists in step.
            const allowed = ["ctt", "threshold", "irt", "rasch", "bayesian_network"];
            if (!allowed.includes(sm.type)) errors.push(`Statistical model '${sm.type}' incompatible with ordinal competency.`);
          }
          if (vType === "continuous") {
            const allowed = ["ctt", "rasch", "irt"];
            if (!allowed.includes(sm.type)) errors.push("Continuous competency requires a CTT, IRT or Rasch model.");
            if (sm.type === "bayesian_network") errors.push("Continuous competency cannot use categorical Bayesian network.");
          }
          if (vType === "categorical") {
            if (sm.type !== "bayesian_network") errors.push("Categorical competency requires Bayesian network model.");
          }
        }
      }
    }

    /* ---------------------------------------------------
       LATENT SCALE ALIGNMENT AUDIT (OUTSIDE SM LOOP)
    --------------------------------------------------- */

    if (obj.status === "confirmed" && db) {
      const competency = db.competencies?.find(c => c.id === obj.competencyId);
      if (competency) {
        const vType = competency.variableType;
        const supports = obj.observables.filter(o => o.evidenceRule?.direction === "supports");
        const weakens = obj.observables.filter(o => o.evidenceRule?.direction === "weakens");

        if (vType === "binary") {
          if (supports.length === 0) errors.push("Binary competency must include at least one supporting observable.");
          if (supports.length > 0 && weakens.length > supports.length * 2) {
            errors.push("Excessive weakening observables for binary competency.");
          }
        }

        if (vType === "ordinal") {
          for (const o of obj.observables) {
            const strength = o.evidenceRule?.strengthLevel;
            if (typeof strength !== "number") continue;
            if (o.evidenceRule.direction === "supports" && strength < 2) {
              errors.push(`Observable ${o.id} has weak support inconsistent with ordinal progression.`);
            }
            if (o.evidenceRule.direction === "weakens" && strength > 4) {
              errors.push(`Observable ${o.id} excessively weakens ordinal progression.`);
            }
          }
        }

        if (vType === "continuous") {
          const contradictory = supports.length > 0 && weakens.length > 0;
          if (contradictory) {
            errors.push("Continuous competency should not mix strong support and weakening patterns without threshold model.");
          }
        }

        if (vType === "categorical") {
          const neutralOnly = obj.observables.every(o => o.evidenceRule?.direction === "neutral");
          if (neutralOnly) {
            errors.push("Categorical competency must include directional evidence (supports/weakens).");
          }
        }
      }
    }

    /* ---------------------------------------------------
       PHASE 4 — STEP 1
       PREREQUISITE DIRECTION COHERENCE
    --------------------------------------------------- */

    if (obj.status === "confirmed" && db) {

      const competency = db.competencies?.find(
        c => c.id === obj.competencyId
      );

      if (competency) {

        const prerequisites = (competency.relationships || [])
          .filter(r => r.type === "prerequisite");

        if (prerequisites.length > 0) {

          const supports = obj.observables.filter(
            o => o.evidenceRule?.direction === "supports"
          );

          const weakens = obj.observables.filter(
            o => o.evidenceRule?.direction === "weakens"
          );

          if (supports.length === 0) {
            errors.push(
              "Evidence model for competency with prerequisites must include supporting observables."
            );
          }

          if (weakens.length > supports.length * 2) {
            errors.push(
              "Weakening-dominant evidence conflicts with prerequisite structure."
            );
          }
        }
      }
    }

    /* ---------------------------------------------------
       PHASE 4 — STEP 2
       TRANSITIVE PREREQUISITE COHERENCE
    --------------------------------------------------- */

    if (obj.status === "confirmed" && db) {

      const competencyMap = {};
      db.competencies?.forEach(c => {
        competencyMap[c.id] = (c.relationships || [])
          .filter(r => r.type === "prerequisite")
          .map(r => r.targetCompetencyId);
      });

      function collectPrerequisites(id, visited = new Set()) {
        if (!competencyMap[id]) return [];
        let result = [];

        for (const pre of competencyMap[id]) {
          if (!visited.has(pre)) {
            visited.add(pre);
            result.push(pre);
            result = result.concat(
              collectPrerequisites(pre, visited)
            );
          }
        }
        return result;
      }

      const fullChain = collectPrerequisites(obj.competencyId);

      if (fullChain.length > 1) {

        const supports = obj.observables.filter(
          o => o.evidenceRule?.direction === "supports"
        );

        const weakens = obj.observables.filter(
          o => o.evidenceRule?.direction === "weakens"
        );

        if (supports.length < 1) {
          errors.push(
            "Deep prerequisite chain requires explicit supporting observables."
          );
        }

        if (weakens.length >= supports.length) {
          errors.push(
            "Evidence structure conflicts with transitive prerequisite ladder."
          );
        }
      }
    }

    /* ---------------------------------------------------
       PHASE 4 — STEP 3
       SIBLING COMPETENCY STRUCTURAL COHERENCE
    --------------------------------------------------- */

    if (obj.status === "confirmed" && db) {

      const competency = db.competencies?.find(
        c => c.id === obj.competencyId
      );

      if (competency && competency.modelId) {

        const siblings = db.competencies?.filter(
          c =>
            c.modelId === competency.modelId &&
            c.id !== competency.id
        ) || [];

        if (siblings.length > 0) {

          const supports = obj.observables.filter(
            o => o.evidenceRule?.direction === "supports"
          );

          const weakens = obj.observables.filter(
            o => o.evidenceRule?.direction === "weakens"
          );

          if (weakens.length >= supports.length) {
            errors.push(
              "Evidence structure conflicts with sibling competency progression."
            );
          }
        }
      }
    }

    /* ---------------------------------------------------
       PHASE 4 — STEP 4
       RELATIONSHIP TYPING CONFLICT DETECTION
    --------------------------------------------------- */

    if (obj.status === "confirmed" && db) {

      const competency = db.competencies?.find(
        c => c.id === obj.competencyId
      );

      if (competency && Array.isArray(competency.relationships)) {

        const relationshipMap = {};

        for (const r of competency.relationships) {
          if (!relationshipMap[r.targetCompetencyId]) {
            relationshipMap[r.targetCompetencyId] = new Set();
          }
          relationshipMap[r.targetCompetencyId].add(r.type);
        }

        for (const [targetId, typeSet] of Object.entries(relationshipMap)) {

          if (typeSet.size > 1) {
            errors.push(
              `Conflicting relationship types toward competency ${targetId}.`
            );
          }

          if (typeSet.has("part-of") && typeSet.has("prerequisite")) {
            errors.push(
              `Competency ${targetId} cannot be both part-of and prerequisite.`
            );
          }
        }

        // Detect mutual prerequisite contradiction
        for (const r of competency.relationships) {
          if (r.type === "prerequisite") {

            const target = db.competencies?.find(
              c => c.id === r.targetCompetencyId
            );

            if (target?.relationships?.some(
              tr => tr.type === "prerequisite" &&
                    tr.targetCompetencyId === competency.id
            )) {
              errors.push(
                "Mutual prerequisite relationship detected."
              );
            }
          }
        }
      }
    }

    /* ---------------------------------------------------
       PHASE 4 — STEP 5
       CORRELATION SYMMETRY & PART-OF HIERARCHY SANITY
    --------------------------------------------------- */

    if (obj.status === "confirmed" && db) {

      const competency = db.competencies?.find(
        c => c.id === obj.competencyId
      );

      if (competency) {

        /* ---------- 1️⃣ Correlates-With Symmetry ---------- */

        for (const r of competency.relationships || []) {

          if (r.type === "correlates-with") {

            const target = db.competencies?.find(
              c => c.id === r.targetCompetencyId
            );

            const reciprocal = target?.relationships?.some(
              tr =>
                tr.type === "correlates-with" &&
                tr.targetCompetencyId === competency.id
            );

            if (!reciprocal) {
              errors.push(
                `Correlates-with relationship must be symmetric with competency ${r.targetCompetencyId}.`
              );
            }
          }
        }

        /* ---------- 2️⃣ Part-Of Cycle Detection ---------- */

        const partOfMap = {};

        db.competencies?.forEach(c => {
          partOfMap[c.id] = (c.relationships || [])
            .filter(r => r.type === "part-of")
            .map(r => r.targetCompetencyId);
        });

        function detectPartOfCycle(node, visited = new Set(), stack = new Set()) {

          if (!partOfMap[node]) return false;

          if (stack.has(node)) return true;
          if (visited.has(node)) return false;

          visited.add(node);
          stack.add(node);

          for (const next of partOfMap[node]) {
            if (detectPartOfCycle(next, visited, stack)) {
              return true;
            }
          }

          stack.delete(node);
          return false;
        }

        if (detectPartOfCycle(competency.id)) {
          errors.push("Part-of hierarchy cannot form cycles.");
        }
      }
    }

    /* ---------------------------------------------------
       PHASE 5 — STEP 1
       CROSS-EVIDENCE PREREQUISITE CONSISTENCY
    --------------------------------------------------- */

    if (obj.status === "confirmed" && db) {

      const competencyMap = {};
      db.competencies?.forEach(c => {
        competencyMap[c.id] = (c.relationships || [])
          .filter(r => r.type === "prerequisite")
          .map(r => r.targetCompetencyId);
      });

      function collectPrerequisites(id, visited = new Set()) {
        if (!competencyMap[id]) return [];
        let result = [];

        for (const pre of competencyMap[id]) {
          if (!visited.has(pre)) {
            visited.add(pre);
            result.push(pre);
            result = result.concat(
              collectPrerequisites(pre, visited)
            );
          }
        }
        return result;
      }

      const fullPrereqs = collectPrerequisites(obj.competencyId);

      if (fullPrereqs.length > 0) {

        const currentSupports = obj.observables.filter(
          o => o.evidenceRule?.direction === "supports"
        ).length;

        const currentWeakens = obj.observables.filter(
          o => o.evidenceRule?.direction === "weakens"
        ).length;

        for (const preId of fullPrereqs) {

          const preEvidenceModels = db.evidenceModels?.filter(
            em =>
              em.status === "confirmed" &&
              em.competencyId === preId
          ) || [];

          for (const preEM of preEvidenceModels) {

            const preSupports = preEM.observables.filter(
              o => o.evidenceRule?.direction === "supports"
            ).length;

            const preWeakens = preEM.observables.filter(
              o => o.evidenceRule?.direction === "weakens"
            ).length;

            if (
              currentSupports > currentWeakens &&
              preWeakens >= preSupports
            ) {
              errors.push(
                `Evidence for higher competency conflicts with weakening-dominant prerequisite evidence (${preId}).`
              );
            }
          }
        }
      }
    }

    /* ---------------------------------------------------
       PHASE 5 — STEP 2
       CROSS-EVIDENCE SIBLING CONSISTENCY
    --------------------------------------------------- */

    if (obj.status === "confirmed" && db) {

      const competency = db.competencies?.find(
        c => c.id === obj.competencyId
      );

      if (competency && competency.modelId) {

        const siblings = db.competencies?.filter(
          c =>
            c.modelId === competency.modelId &&
            c.id !== competency.id
        ) || [];

        const currentSupports = obj.observables.filter(
          o => o.evidenceRule?.direction === "supports"
        ).length;

        const currentWeakens = obj.observables.filter(
          o => o.evidenceRule?.direction === "weakens"
        ).length;

        for (const sib of siblings) {

          const siblingEvidence = db.evidenceModels?.filter(
            em =>
              em.status === "confirmed" &&
              em.competencyId === sib.id
          ) || [];

          for (const sibEM of siblingEvidence) {

            const sibSupports = sibEM.observables.filter(
              o => o.evidenceRule?.direction === "supports"
            ).length;

            const sibWeakens = sibEM.observables.filter(
              o => o.evidenceRule?.direction === "weakens"
            ).length;

            if (
              currentSupports > currentWeakens &&
              sibWeakens >= sibSupports
            ) {
              errors.push(
                `Evidence conflicts with weakening-dominant sibling competency (${sib.id}).`
              );
            }

            if (
              currentWeakens > currentSupports &&
              sibSupports > sibWeakens
            ) {
              errors.push(
                `Evidence conflicts with support-dominant sibling competency (${sib.id}).`
              );
            }
          }
        }
      }
    }

    /* ---------------------------------------------------
       PHASE 5 — STEP 3
       CROSS-EVIDENCE PART-OF PROPAGATION CONSISTENCY
    --------------------------------------------------- */

    if (obj.status === "confirmed" && db) {

      const competency = db.competencies?.find(
        c => c.id === obj.competencyId
      );

      if (competency) {

        const currentSupports = obj.observables.filter(
          o => o.evidenceRule?.direction === "supports"
        ).length;

        const currentWeakens = obj.observables.filter(
          o => o.evidenceRule?.direction === "weakens"
        ).length;

        /* ---------- 1️⃣ Upward: X part-of Y ---------- */

        const parents = (competency.relationships || [])
          .filter(r => r.type === "part-of")
          .map(r => r.targetCompetencyId);

        for (const parentId of parents) {

          const parentEMs = db.evidenceModels?.filter(
            em =>
              em.status === "confirmed" &&
              em.competencyId === parentId
          ) || [];

          for (const parentEM of parentEMs) {

            const parentSupports = parentEM.observables.filter(
              o => o.evidenceRule?.direction === "supports"
            ).length;

            const parentWeakens = parentEM.observables.filter(
              o => o.evidenceRule?.direction === "weakens"
            ).length;

            if (
              currentSupports > currentWeakens &&
              parentWeakens >= parentSupports
            ) {
              errors.push(
                `Component competency evidence conflicts with weakening-dominant parent (${parentId}).`
              );
            }

            if (
              currentWeakens > currentSupports &&
              parentSupports > parentWeakens
            ) {
              errors.push(
                `Weakening-dominant component conflicts with support-dominant parent (${parentId}).`
              );
            }
          }
        }

        /* ---------- 2️⃣ Downward: C part-of X ---------- */

        const children = db.competencies?.filter(
          c =>
            (c.relationships || []).some(
              r =>
                r.type === "part-of" &&
                r.targetCompetencyId === competency.id
            )
        ) || [];

        for (const child of children) {

          const childEMs = db.evidenceModels?.filter(
            em =>
              em.status === "confirmed" &&
              em.competencyId === child.id
          ) || [];

          for (const childEM of childEMs) {

            const childSupports = childEM.observables.filter(
              o => o.evidenceRule?.direction === "supports"
            ).length;

            const childWeakens = childEM.observables.filter(
              o => o.evidenceRule?.direction === "weakens"
            ).length;

            if (
              childSupports > childWeakens &&
              currentWeakens >= currentSupports
            ) {
              errors.push(
                `Support-dominant child competency (${child.id}) conflicts with weakening-dominant composite.`
              );
            }

            if (
              childWeakens > childSupports &&
              currentSupports > currentWeakens
            ) {
              errors.push(
                `Weakening-dominant child competency (${child.id}) conflicts with support-dominant composite.`
              );
            }
          }
        }
      }
    }

    /* ---------------------------------------------------
       PHASE 5 — STEP 4
       CROSS-EVIDENCE CORRELATION COHERENCE
    --------------------------------------------------- */

    if (obj.status === "confirmed" && db) {

      const competency = db.competencies?.find(
        c => c.id === obj.competencyId
      );

      if (competency) {

        const correlates = (competency.relationships || [])
          .filter(r => r.type === "correlates-with")
          .map(r => r.targetCompetencyId);

        const currentSupports = obj.observables.filter(
          o => o.evidenceRule?.direction === "supports"
        ).length;

        const currentWeakens = obj.observables.filter(
          o => o.evidenceRule?.direction === "weakens"
        ).length;

        for (const corrId of correlates) {

          const corrEMs = db.evidenceModels?.filter(
            em =>
              em.status === "confirmed" &&
              em.competencyId === corrId
          ) || [];

          for (const corrEM of corrEMs) {

            const corrSupports = corrEM.observables.filter(
              o => o.evidenceRule?.direction === "supports"
            ).length;

            const corrWeakens = corrEM.observables.filter(
              o => o.evidenceRule?.direction === "weakens"
            ).length;

            const currentDominant =
              currentSupports > currentWeakens
                ? "support"
                : currentWeakens > currentSupports
                ? "weaken"
                : "neutral";

            const corrDominant =
              corrSupports > corrWeakens
                ? "support"
                : corrWeakens > corrSupports
                ? "weaken"
                : "neutral";

            if (
              currentDominant === "support" &&
              corrDominant === "weaken"
            ) {
              errors.push(
                `Correlated competency (${corrId}) shows opposing weakening pattern.`
              );
            }

            if (
              currentDominant === "weaken" &&
              corrDominant === "support"
            ) {
              errors.push(
                `Correlated competency (${corrId}) shows opposing support pattern.`
              );
            }
          }
        }
      }
    }

    /* ---------------------------------------------------
       PHASE 5 — STEP 5
       GLOBAL DOMINANCE PARADOX DETECTION
    --------------------------------------------------- */

    if (obj.status === "confirmed" && db) {

      const competency = db.competencies?.find(
        c => c.id === obj.competencyId
      );

      if (competency && competency.modelId) {

        const modelCompetencies = db.competencies?.filter(
          c => c.modelId === competency.modelId
        ) || [];

        const relatedEvidence = db.evidenceModels?.filter(
          em =>
            em.status === "confirmed" &&
            modelCompetencies.some(
              mc => mc.id === em.competencyId
            )
        ) || [];

        if (relatedEvidence.length >= 3) {

          let supportDominant = 0;
          let weakenDominant = 0;

          for (const em of relatedEvidence) {

            const supports = em.observables.filter(
              o => o.evidenceRule?.direction === "supports"
            ).length;

            const weakens = em.observables.filter(
              o => o.evidenceRule?.direction === "weakens"
            ).length;

            if (supports > weakens) supportDominant++;
            if (weakens > supports) weakenDominant++;
          }

          const totalDominant = supportDominant + weakenDominant;

          if (totalDominant >= 3) {

            const supportRatio = supportDominant / totalDominant;
            const weakenRatio = weakenDominant / totalDominant;

            const currentSupports = obj.observables.filter(
              o => o.evidenceRule?.direction === "supports"
            ).length;

            const currentWeakens = obj.observables.filter(
              o => o.evidenceRule?.direction === "weakens"
            ).length;

            const currentDominant =
              currentSupports > currentWeakens
                ? "support"
                : currentWeakens > currentSupports
                ? "weaken"
                : "neutral";

            if (
              supportRatio >= 0.7 &&
              currentDominant === "weaken"
            ) {
              errors.push(
                "Global dominance paradox: majority competencies support-dominant while this model is weakening-dominant."
              );
            }

            if (
              weakenRatio >= 0.7 &&
              currentDominant === "support"
            ) {
              errors.push(
                "Global dominance paradox: majority competencies weakening-dominant while this model is support-dominant."
              );
            }
          }
        }
      }
    }

    /* ---------------------------------------------------
       PHASE 8 — STEP 5
       LONGITUDINAL DECISION STABILITY GUARD
    --------------------------------------------------- */

    if (db && obj.id) {

      const existing = db.evidenceModels?.find(
        em => em.id === obj.id
      );

      if (existing && existing.decisionRule && obj.decisionRule) {

        const decisionChanged =
          JSON.stringify(existing.decisionRule) !==
          JSON.stringify(obj.decisionRule);

        if (decisionChanged) {

          const historicalSessions = db.sessions?.filter(
            s =>
              ["submitted", "reviewed"].includes(s.status) &&
              (s.responses || []).some(
                r => r.evidenceModelId === obj.id
              )
          ) || [];

          if (historicalSessions.length > 0) {
            errors.push(
              "Cannot modify decisionRule after historical sessions exist. Create new evidence model version to preserve longitudinal decision stability."
            );
          }
        }
      }
    }

    /* ---------------------------------------------------
       PHASE 1 — STRICT UNIDIMENSIONAL EVIDENCE LOCK
    --------------------------------------------------- */

    if (obj.status === "confirmed" && db) {

      const competency = db.competencies?.find(
        c => c.id === obj.competencyId
      );

      if (competency && competency.modelId) {

        const competencyModel = db.competencyModels?.find(
          m => m.id === competency.modelId
        );

        if (competencyModel?.measurementIntent === "unidimensional") {

          const otherConfirmedEvidence = db.evidenceModels?.filter(
            em =>
              em.status === "confirmed" &&
              em.id !== obj.id &&
              em.competencyId !== obj.competencyId
          ) || [];

          if (otherConfirmedEvidence.length > 0) {
            errors.push(
              "Unidimensional competency model cannot confirm evidence for multiple competencies."
            );
          }
        }
      }
    }



    /* ---------------------------------------------------
       PHASE 6 — STEP 1
       COMPETENCY MODEL VERSION LOCK
    --------------------------------------------------- */

    if (obj.status === "confirmed" && db) {

      const competency = db.competencies?.find(
        c => c.id === obj.competencyId
      );

      if (competency && competency.modelId) {

        const model = db.competencyModels?.find(
          m => m.id === competency.modelId
        );

        if (model) {

          if (
            typeof obj.competencyModelVersion !== "number"
          ) {
            errors.push(
              "Evidence model must declare competencyModelVersion."
            );
          } else if (
            obj.competencyModelVersion !== model.versionNumber
          ) {
            errors.push(
              `Evidence model version mismatch: linked competency model is version ${model.versionNumber}, but evidence declares version ${obj.competencyModelVersion}.`
            );
          }
        }
      }
    }

    /* ---------------------------------------------------
      PHASE 4 — RECALIBRATION VERSION GUARD
    --------------------------------------------------- */

    if (db && obj.id) {

      const existing = db.evidenceModels?.find(
        em => em.id === obj.id
      );

      if (existing) {

        // Detect parameter set mutation
        const parameterSetsChanged =
          JSON.stringify(existing.statisticalModels?.map(sm => ({
            id: sm.id,
            parameterSets: sm.parameterSets,
            activeParameterSetId: sm.activeParameterSetId
          }))) !==
          JSON.stringify(obj.statisticalModels?.map(sm => ({
            id: sm.id,
            parameterSets: sm.parameterSets,
            activeParameterSetId: sm.activeParameterSetId
          })));

        if (parameterSetsChanged) {

          const competency = db.competencies?.find(
            c => c.id === obj.competencyId
          );

          if (competency && competency.modelId) {

            const competencyModel = db.competencyModels?.find(
              m => m.id === competency.modelId
            );

            if (
              competencyModel &&
              obj.competencyModelVersion !== competencyModel.versionNumber
            ) {
              errors.push(
                "Recalibration blocked: Evidence model bound to outdated competency model version."
              );
            }
          }
        }
      }
    }

    /* ---------------------------------------------------
       PHASE 7 — STEP 2
       ACTIVE STATISTICAL MODEL FREEZE DURING SESSION
    --------------------------------------------------- */

    if (db && obj.id) {

      const existing = db.evidenceModels?.find(
        em => em.id === obj.id
      );

      if (existing) {

        // Detect active statistical model change
        const existingActive = existing.statisticalModels?.find(sm => sm.active);
        const newActive = obj.statisticalModels?.find(sm => sm.active);

        const activeChanged =
          existingActive?.id !== newActive?.id ||
          existingActive?.activeParameterSetId !== newActive?.activeParameterSetId;

        if (activeChanged) {

          const sessionsUsingEvidence = db.sessions?.filter(
            s =>
              [SESSION_STATUS.IN_PROGRESS].includes(s.status) &&
              (s.responses || []).some(
                r => r.evidenceModelId === obj.id
              )
          ) || [];

          if (sessionsUsingEvidence.length > 0) {
            errors.push(
              "Cannot change active statistical model or parameter set while sessions are in progress using this evidence model."
            );
          }
        }
      }
    }

    /* ---------------------------------------------------
       PHASE 7 — STEP 3
       ADAPTIVE SELECTION STABILITY GUARD
    --------------------------------------------------- */

    if (db && obj.id) {

      const existing = db.evidenceModels?.find(
        em => em.id === obj.id
      );

      if (existing) {

        const structureChanged =
          JSON.stringify(existing.statisticalModels?.map(sm => ({
            id: sm.id,
            type: sm.type,
            structureConfig: sm.structureConfig
          }))) !==
          JSON.stringify(obj.statisticalModels?.map(sm => ({
            id: sm.id,
            type: sm.type,
            structureConfig: sm.structureConfig
          })));

        if (structureChanged) {

          const adaptiveSessions = db.sessions?.filter(
            s =>
              [SESSION_STATUS.IN_PROGRESS].includes(s.status) &&
              ["IRT", "BayesianNetwork"].includes(s.selectionStrategy) &&
              (s.responses || []).some(
                r => r.evidenceModelId === obj.id
              )
          ) || [];

          if (adaptiveSessions.length > 0) {
            errors.push(
              "Cannot modify statistical model structure while adaptive sessions (IRT/Bayesian) are in progress."
            );
          }
        }
      }
    }

    /* ---------------------------------------------------
       PHASE 7 — STEP 4
       SESSION SNAPSHOT INTEGRITY (EVIDENCE DRIFT DETECTION)
    --------------------------------------------------- */

    if (db && obj.id) {

      const historicalSessions = db.sessions?.filter(
        s =>
          ["submitted", "reviewed"].includes(s.status) &&
          (s.responses || []).some(
            r => r.evidenceModelId === obj.id
          )
      ) || [];

      if (historicalSessions.length > 0) {

        const existing = db.evidenceModels?.find(
          em => em.id === obj.id
        );

        if (existing) {

          const observablesChanged =
            JSON.stringify(existing.observables) !==
            JSON.stringify(obj.observables);

          const warrantsChanged =
            JSON.stringify(existing.warrants) !==
            JSON.stringify(obj.warrants);

          if (observablesChanged || warrantsChanged) {
            errors.push(
              "Cannot modify observables or warrants after sessions have been completed. Create a new evidence model version instead."
            );
          }
        }
      }
    }

    /* ---------------------------------------------------
       PHASE 7 — STEP 5
       LONGITUDINAL MEASUREMENT STABILITY GUARD
    --------------------------------------------------- */

    if (db && obj.id) {

      const existing = db.evidenceModels?.find(
        em => em.id === obj.id
      );

      if (existing) {

        const scaleChanged =
          JSON.stringify(existing.statisticalModels?.map(sm => ({
            type: sm.type,
            subtype: sm.subtype
          }))) !==
          JSON.stringify(obj.statisticalModels?.map(sm => ({
            type: sm.type,
            subtype: sm.subtype
          })));

        if (scaleChanged) {

          const historicalSessions = db.sessions?.filter(
            s =>
              ["submitted", "reviewed"].includes(s.status) &&
              (s.responses || []).some(
                r => r.evidenceModelId === obj.id
              )
          ) || [];

          if (historicalSessions.length > 0) {
            errors.push(
              "Cannot change statistical measurement type/subtype after historical sessions exist. Create new evidence model version to preserve longitudinal comparability."
            );
          }
        }
      }
    }

  }

  /* =====================================================
    STRICT ECD VALIDATION — ITEMS

    STRICTNESS
    ----------
    Everything below is split the same way the competency and task-model
    blocks are split (see the note on `strict` in validateEntity):

      NEVER gated  — referential integrity, lifecycle guards, and value
                     validity for values that ARE present.
      strict only  — the PRESENCE of things a later wizard step authors.

    This block used to run every rule unconditionally, which meant a draft
    saved on the way out of Step 1 was rejected with "Explicit
    evidenceActivationMap is required" — a rule about scoring, enforced
    three steps before the scoring UI exists. Since POST /api/items creates
    exactly such a draft, item creation returned 400 for every payload ever
    sent to it. Nothing could be authored at all.

    THE INTERACTION / OBSERVABLE RULE
    --------------------------------
    This block used to require `item.interaction.type === observable.type`.
    Those two fields draw from vocabularies with no value in common —
    observables are selected_response / constructed_response / ... and
    interactions are mcq / multiselect / ... — so the rule was
    unsatisfiable by construction and every item failed it forever.

    Equality was the wrong relation, not just the wrong data. An
    observable's type is an EVIDENCE-level statement about what kind of
    performance is captured; an interaction's type is a DELIVERY-level
    statement about which widget captures it. The relation is
    one-to-many compatibility, and it lives in src/utils/ecdVocabulary.js
    so that this file and the wizard read the SAME map rather than two
    copies of it.
  ===================================================== */

  if (collection === "items") {

    /* ---------------------------------------------
      1️⃣ THE GOVERNING LINK — TASK MODEL

      An Item is an instantiation of a Task Model and nothing else. Two
      fields are authored: `taskModelId` (+ its version lock) and
      `observationId`, which is a pointer INTO that task model's
      expectedObservations.

      `evidenceModelId` / `evidenceModelVersion` are DERIVED from that
      pointer. They are stored so downstream readers need not re-walk the
      chain, but they are never authored: server/routes/itemsRoutes.js
      recomputes them on every write. The checks here are therefore
      corruption detectors, not authoring rules — which is why their
      messages say so.
    --------------------------------------------- */

    if (!obj.taskModelId) {
      errors.push("Item must reference a taskModelId. An item exists only as an instantiation of a Task Model.");
    }

    if (strict && !obj.taskModelVersion) {
      errors.push("Item must declare taskModelVersion.");
    }

    if (strict && !obj.observationId) {
      errors.push("Item must declare which observation it elicits.");
    }

    if (db && obj.taskModelId) {

      const tm = db.taskModels?.find(t => t.id === obj.taskModelId);

      if (!tm) {
        errors.push(`Invalid taskModelId: ${obj.taskModelId}`);
      } else {

        /* isInstantiableTaskModel, not `status === "confirmed"`.

           The literal test was shorthand for "locked and structurally
           frozen", written when nothing could leave the confirmed state.
           Once a Task Model could be activated, the literal test meant
           that the moment a Task Model went operational EVERY item bound
           to it failed validation — so an operational task's items could
           no longer be edited, retired or even suspended, and no new item
           could be authored against the very blueprint that was live.
           The same mistake, in the same words, as the one this predicate
           was introduced to fix on the evidence-model side. */
        if (!allowDraftParents && !isInstantiableTaskModel(tm)) {
          errors.push(
            `Items can only instantiate confirmed, operational or suspended TaskModels, and only locked ones (this one is '${tm.status}'${tm.locked ? "" : ", unlocked"}).`
          );
        }

        if (obj.taskModelVersion !== undefined &&
            obj.taskModelVersion !== null &&
            obj.taskModelVersion !== tm.versionNumber) {
          errors.push(
            `This item was authored against version ${obj.taskModelVersion} of its Task Model, which is now at version ${tm.versionNumber}. Version locks are deliberate — clone the item onto the new version rather than re-pointing it.`
          );
        }

        const declaredObs = obj.observationId
          ? tm.expectedObservations?.find(eo => eo.observationId === obj.observationId)
          : null;

        if (obj.observationId && !declaredObs) {
          errors.push(
            `Observation '${obj.observationId}' is not declared in this Task Model's expectedObservations. An item can only elicit an observation its Task Model expects.`
          );
        }

        /* Derived-field agreement. Not an authoring rule — if these
           disagree, something wrote the record without going through the
           route's derivation step. */
        if (declaredObs) {
          if (obj.evidenceModelId && obj.evidenceModelId !== declaredObs.evidenceModelId) {
            errors.push(
              "evidenceModelId is derived from the Task Model's declaration and disagrees with it. It is not an authored field; re-save through the API to recompute it."
            );
          }
        }

        /* ---------------------------------------------
          2️⃣ BLUEPRINT ENFORCEMENT

          A blueprint whitelist NARROWS what the observable already
          permits. An absent or EMPTY list means "the Task Model does not
          constrain this" — the previous `blueprint.allowedX && !includes`
          test happened to agree for the empty case only by accident of
          `[]` being truthy while `[].includes(x)` is false, which made an
          empty whitelist reject everything.
        --------------------------------------------- */

        const blueprint = tm.blueprintConstraints || {};

        if (Array.isArray(blueprint.allowedInteractionTypes) &&
            blueprint.allowedInteractionTypes.length > 0 &&
            obj.interaction?.type &&
            !blueprint.allowedInteractionTypes.includes(obj.interaction.type)) {
          errors.push(
            `Interaction type '${obj.interaction.type}' is outside this Task Model's blueprint (allowed: ${blueprint.allowedInteractionTypes.join(", ")}).`
          );
        }

        if (Array.isArray(blueprint.allowedScoringMethods) &&
            blueprint.allowedScoringMethods.length > 0 &&
            obj.scoring?.method &&
            !blueprint.allowedScoringMethods.includes(obj.scoring.method)) {
          errors.push(
            `Scoring method '${obj.scoring.method}' is outside this Task Model's blueprint (allowed: ${blueprint.allowedScoringMethods.join(", ")}).`
          );
        }
      }
    }

    /* ---------------------------------------------
      3️⃣ VALUE VALIDITY (never gated)

      Values that ARE present must be legal, whatever the status. Only
      the PRESENCE of a value is a strict-mode question.
    --------------------------------------------- */

    if (obj.interaction?.type &&
        !INTERACTION_TYPE_VALUES.includes(obj.interaction.type)) {
      errors.push(
        `Unknown interaction type '${obj.interaction.type}'. Known types: ${INTERACTION_TYPE_VALUES.join(", ")}.`
      );
    }

    if (obj.scoring?.method &&
        !SCORING_METHOD_VALUES.includes(obj.scoring.method)) {
      errors.push(
        `Unknown scoring method '${obj.scoring.method}'. Known methods: ${SCORING_METHOD_VALUES.join(", ")}.`
      );
    }

    if (obj.scoring?.maxScore !== undefined &&
        obj.scoring.maxScore !== null &&
        (typeof obj.scoring.maxScore !== "number" ||
         !Number.isFinite(obj.scoring.maxScore) ||
         obj.scoring.maxScore <= 0)) {
      errors.push("scoring.maxScore must be a positive number.");
    }

    // Day 22 (vocabulary consolidation): cognitiveDemand.bloomLevel/
    // reasoningType were declared as bare 'string' with no enum check at
    // all before this -- any string passed. BLOOM_LEVELS/REASONING_TYPES
    // moved to ecdVocabulary.js specifically so this validator and the
    // wizard <select> it constrains read the same values.
    if (obj.cognitiveDemand?.bloomLevel &&
        !BLOOM_LEVEL_VALUES.includes(obj.cognitiveDemand.bloomLevel)) {
      errors.push(
        `Unknown cognitiveDemand.bloomLevel '${obj.cognitiveDemand.bloomLevel}'. Known levels: ${BLOOM_LEVEL_VALUES.join(", ")}.`
      );
    }

    if (obj.cognitiveDemand?.reasoningType &&
        !REASONING_TYPE_VALUES.includes(obj.cognitiveDemand.reasoningType)) {
      errors.push(
        `Unknown cognitiveDemand.reasoningType '${obj.cognitiveDemand.reasoningType}'. Known types: ${REASONING_TYPE_VALUES.join(", ")}.`
      );
    }

    for (const map of obj.scoring?.evidenceActivationMap || []) {

      if (map.activatesObservable !== undefined &&
          typeof map.activatesObservable !== "boolean") {
        errors.push("evidenceActivationMap.activatesObservable must be true or false.");
      }

      if (map.strengthOverride !== null &&
          map.strengthOverride !== undefined &&
          (map.strengthOverride < 1 || map.strengthOverride > 5)) {
        errors.push("strengthOverride must be between 1 and 5.");
      }
    }

    /* ---------------------------------------------
      4️⃣ STRUCTURAL COMPLETENESS (strict only)
    --------------------------------------------- */

    if (strict) {

      if (!Array.isArray(obj.stimulus?.blocks) || obj.stimulus.blocks.length === 0) {
        errors.push("A confirmed item must present at least one stimulus block.");
      }

      if (!obj.interaction?.type) {
        errors.push("A confirmed item must declare an interaction type.");
      }

      if (!Array.isArray(obj.interaction?.responseComponents) ||
          obj.interaction.responseComponents.length === 0) {
        errors.push("A confirmed item must configure at least one response component, or there is nothing to score.");
      }

      if (!obj.scoring?.method) {
        errors.push("A confirmed item must declare a scoring method.");
      }

      if (!Array.isArray(obj.scoring?.evidenceActivationMap) ||
          obj.scoring.evidenceActivationMap.length === 0) {
        errors.push(
          "A confirmed item must define at least one evidence activation rule. Without one, nothing a student does can ever count as evidence of the observable."
        );
      } else {

        if (!obj.scoring.evidenceActivationMap.some(m => m.activatesObservable === true)) {
          errors.push(
            "At least one activation rule must activate the observable, or this item can never contribute to the inference."
          );
        }

        obj.scoring.evidenceActivationMap.forEach((map, i) => {

          if (typeof map.activatesObservable !== "boolean") {
            errors.push(`Activation rule ${i + 1} must state whether it activates the observable.`);
          }

          if (!String(map.rationale ?? "").trim()) {
            errors.push(
              `Activation rule ${i + 1} needs a rationale — it is what a reviewer reads to judge whether the pattern really is evidence of the observable.`
            );
          }

          if (!responsePatternIsSpecified(obj.scoring.method, map.responsePattern)) {
            errors.push(
              `Activation rule ${i + 1} has no response pattern. An empty pattern matches nothing.`
            );
          }
        });

        // Day 27: two rules with byte-identical responsePatterns are
        // unambiguously an authoring mistake -- whichever is declared
        // first silently shadows the other at delivery time (Evidence
        // Identification matches the first entry whose pattern fits, see
        // server/delivery/evidenceIdentification.js), and nothing warns
        // the author their second rule can never fire. This catches only
        // EXACT duplicates, not general semantic overlap (e.g. one pattern
        // whose array-valued key is a superset of another's) -- detecting
        // that in general needs the pattern's array/membership semantics,
        // which is a fuzzier problem deliberately left for a future pass.
        const seenPatterns = new Set();
        obj.scoring.evidenceActivationMap.forEach((map, i) => {
          if (!map.responsePattern || typeof map.responsePattern !== "object") return;
          const key = JSON.stringify(map.responsePattern);
          if (seenPatterns.has(key)) {
            errors.push(
              `Activation rule ${i + 1} has the exact same responsePattern as an earlier rule; the earlier rule always wins and this one can never fire.`
            );
          }
          seenPatterns.add(key);
        });

        const maxRuleScore = obj.scoring.evidenceActivationMap.reduce(
          (acc, m) => Math.max(acc, typeof m.score === "number" ? m.score : 0),
          0
        );

        if (typeof obj.scoring.maxScore === "number" && maxRuleScore > obj.scoring.maxScore) {
          errors.push(
            `An activation rule awards ${maxRuleScore} points but scoring.maxScore is ${obj.scoring.maxScore}.`
          );
        }
      }

      if (typeof obj.evidenceModelVersion !== "number") {
        errors.push("A confirmed item must carry a numeric evidenceModelVersion.");
      }
    }

    /* ---------------------------------------------
      5️⃣ EVIDENCE CHAIN + PSYCHOMETRIC COMPATIBILITY
    --------------------------------------------- */

    if (db && obj.evidenceModelId) {

      const em = db.evidenceModels?.find(e => e.id === obj.evidenceModelId);

      if (!em) {
        errors.push(`Invalid evidenceModelId: ${obj.evidenceModelId}`);
      } else {

        if (obj.evidenceModelVersion !== undefined &&
            obj.evidenceModelVersion !== null &&
            obj.evidenceModelVersion !== em.versionNumber) {
          errors.push(
            "evidenceModelVersion is derived and disagrees with the referenced Evidence Model. Re-save through the API to recompute it."
          );
        }

        if (!allowDraftParents && !isLinkableEvidenceModel(em)) {
          errors.push(
            `Items can only reference confirmed, operational or suspended EvidenceModels (this one is '${em.status}').`
          );
        }

        const observable = em.observables?.find(o => o.id === obj.observationId);

        if (obj.observationId && !observable) {
          errors.push(
            `The Task Model declares observation '${obj.observationId}', but its Evidence Model has no observable with that id. The chain is broken upstream — fix it on the Evidence Model.`
          );
        }

        /* Compatibility, not equality. See the header note. */
        if (observable && obj.interaction?.type &&
            !isInteractionCompatible(observable.type, obj.interaction.type)) {
          errors.push(interactionCompatibilityMessage(observable.type, obj.interaction.type));
        }

        if (strict && observable &&
            interactionTypesForObservable(observable.type).length === 0) {
          errors.push(
            `Observables of type '${observable.type}' are rated or logged rather than answered on screen, so no item can capture them yet.`
          );
        }

        if (observable?.evidenceRule?.direction === "supports") {
          const negativeActivation = (obj.scoring?.evidenceActivationMap || []).some(
            m => m.activatesObservable === false
          );

          if (negativeActivation) {
            errors.push(
              "This observable's evidence rule is directional ('supports'), but the scoring map contains a rule that explicitly does not activate it — which reads as counter-evidence the rule does not permit."
            );
          }
        }

        const activeModel = em.statisticalModels?.find(sm => sm.active);

        if (activeModel) {

          const declaredType = obj.psychometrics?.statisticalModelType;

          if (declaredType && declaredType !== activeModel.type) {
            errors.push(
              `Item declares statistical model '${declaredType}' but its Evidence Model runs on '${activeModel.type}'.`
            );
          }

          const irt = obj.psychometrics?.irtParams;
          const hasIrt = !!irt && (typeof irt.a === "number" || typeof irt.b === "number");

          if (activeModel.type !== "irt" && hasIrt) {
            errors.push(
              `IRT parameters are present but the Evidence Model runs on '${activeModel.type}'. Clear them.`
            );
          }

          // D53b: dinaParams is the 'dina' analogue of irtParams just
          // above, so it gets the same two checks -- present on the wrong
          // family is an authoring mistake worth flagging, and (unlike
          // IRT's a/b, which only need to be numbers) a slip/guess pair
          // has real mathematical constraints a bare `typeof` check can't
          // see, so USABILITY is asked of the same predicate
          // attributeAccumulation.js scores against rather than re-checked
          // here as a looser one.
          const dina = obj.psychometrics?.dinaParams;
          const hasDina = !!dina && (typeof dina.slip === "number" || typeof dina.guess === "number");

          if (activeModel.type !== "dina" && hasDina) {
            errors.push(
              `DINA pilot parameters are present but the Evidence Model runs on '${activeModel.type}'. Clear them.`
            );
          }

          if (strict) {

            if (!declaredType) {
              errors.push("A confirmed item must declare its statisticalModelType.");
            }

            if (activeModel.type === "irt" && !hasIrt) {
              errors.push(
                "An IRT-scored item must carry at least discrimination (a) and difficulty (b) before it can be confirmed. Pilot values are fine; calibration replaces them."
              );
            }

            if (activeModel.type === "dina" && !dinaParametersAreUsable(dina)) {
              errors.push(
                "A DINA-scored item must carry usable pilot slip/guess parameters (slip and guess each in [0,1), with guess < 1 - slip) before it can be confirmed. Pilot values are fine; calibration replaces them."
              );
            }
          }
        } else if (strict) {
          errors.push(
            "The referenced Evidence Model has no active statistical model, so this item's scoring cannot be derived."
          );
        }
      }
    }

    /* ---------------------------------------------
      6️⃣ OPERATIONAL GOVERNANCE
    --------------------------------------------- */

    if (obj.status === "operational") {

      if (!String(obj.equivalenceGroupId || "").trim()) {
        errors.push(
          "An operational item must declare an equivalenceGroupId, so a replacement of equal difficulty can be swapped in when this one is retired or over-exposed."
        );
      }

      if (!obj.exposureControl?.maxUsageBeforeRetire) {
        errors.push(
          "An operational item must declare exposureControl.maxUsageBeforeRetire. Without a ceiling it is delivered indefinitely and never retires."
        );
      }
    }

    /* ---------------------------------------------
     7️⃣ LONGITUDINAL STRUCTURAL STABILITY GUARD
    --------------------------------------------- */

    if (db && obj.id) {

      const existing = db.items?.find(i => i.id === obj.id);

      if (existing) {

        if (existing.locked) {

          const structuralFields = [
            "taskModelId",
            "taskModelVersion",
            "observationId",
            "evidenceModelId",
          ];

          const structuralChanged = structuralFields.some(field =>
            JSON.stringify(existing[field]) !== JSON.stringify(obj[field])
          );

          if (structuralChanged) {
            errors.push("A confirmed item cannot change its structural bindings. Clone instead.");
          }
        }

        /* This guard used to sit OUTSIDE the `if (existing)` block, so a
           create (no existing record) dereferenced `undefined.status` and
           threw a TypeError out of the validator — a 500, not a 400, on
           every POST against a database where the id happened not to
           exist yet. Which is every POST. */
        if (existing.status === "archived" && obj.status === "archived") {
          errors.push("An archived item cannot be modified.");
        }

        /* Lifecycle progression.

           The previous guard compared indices in a flat status array and
           rejected anything that was not a single step forward. That is
           not the lifecycle this product has: server/utils/lifecycleMatrix.js
           declares reviewed -> draft (reviewer rejection),
           confirmed -> archived, operational -> archived and
           suspended -> operational, and the index comparison rejected all
           four. Reactivating a suspended item was impossible even though
           exposureControl carries a `reactivationCount` for exactly that,
           and a reviewer could not send an item back for rework.

           One matrix, one check. */
        const prevStatus = existing.status || "draft";
        const nextStatus = obj.status || prevStatus;

        if (!STATUS.includes(nextStatus)) {
          errors.push(`Invalid item lifecycle state '${nextStatus}'.`);
        } else if (!canTransition(prevStatus, nextStatus)) {
          errors.push(
            `Item cannot move from '${prevStatus}' to '${nextStatus}'. Allowed from '${prevStatus}': ${(TRANSITIONS[prevStatus] || []).join(", ") || "nothing (terminal state)"}.`
          );
        }
      }
    }
  }

  /* =====================================================
     STRICT ECD VALIDATION — COMPETENCIES (RESTORED)
  ===================================================== */

  if (collection === "competencies") {

    if (!obj.variableType) {
      errors.push("Competency must define variableType.");
    }

    const allowedTypes = ["binary", "ordinal", "continuous", "categorical"];
    if (obj.variableType && !allowedTypes.includes(obj.variableType)) {
      errors.push("variableType must be one of: binary, ordinal, continuous, categorical.");
    }

    // Structural COMPLETENESS of the state space / scale (as opposed to
    // basic shape/contradiction checks below) is only enforced strictly --
    // see the `strict` option above. Draft saves made while the wizard is
    // still on Step 4/5 skip these so the user can advance to the step
    // that actually lets them fill states/scale in.
    if (strict && obj.variableType === "binary") {
      if (!Array.isArray(obj.states) || obj.states.length !== 2) {
        errors.push("Binary competency must define exactly 2 states.");
      }
    }

    if (strict && obj.variableType === "ordinal") {
      if (!Array.isArray(obj.states) || obj.states.length < 2) {
        errors.push("Ordinal competency must define at least 2 ordered states.");
      } else {
        const missingOrder = obj.states.some(s => typeof s.order !== "number");
        if (missingOrder) errors.push("All ordinal states must define numeric 'order'.");

        const orders = obj.states.map(s => s.order);
        const uniqueOrders = new Set(orders);
        if (orders.length !== uniqueOrders.size) {
          errors.push("Ordinal state orders must be unique.");
        }
      }
    } else if (!strict && obj.variableType === "ordinal" && Array.isArray(obj.states) && obj.states.length > 0) {
      // Even in non-strict/draft mode, don't allow contradictory data: if
      // orders were partially entered, they still must be unique numbers.
      const missingOrder = obj.states.some(s => typeof s.order !== "number");
      if (!missingOrder) {
        const orders = obj.states.map(s => s.order);
        const uniqueOrders = new Set(orders);
        if (orders.length !== uniqueOrders.size) {
          errors.push("Ordinal state orders must be unique.");
        }
      }
    }

    if (strict && obj.variableType === "categorical") {
      if (!Array.isArray(obj.states) || obj.states.length < 2) {
        errors.push("Categorical competency must define at least 2 states.");
      }
    }

    if (obj.variableType === "continuous") {
      if (strict) {
        if (!obj.scale) {
          errors.push("Continuous competency must define scale.");
        } else {
          if (typeof obj.scale.min !== "number" || typeof obj.scale.max !== "number") {
            errors.push("Continuous scale must define numeric min and max.");
          }
          if (obj.scale.min >= obj.scale.max) {
            errors.push("Continuous scale min must be less than max.");
          }
        }
      } else if (
        obj.scale &&
        typeof obj.scale.min === "number" &&
        typeof obj.scale.max === "number" &&
        obj.scale.min >= obj.scale.max
      ) {
        // Partial data is fine in draft mode, but if both bounds were
        // entered they must still be internally consistent.
        errors.push("Continuous scale min must be less than max.");
      }

      if (obj.states && obj.states.length > 0) {
        errors.push("Continuous competency must not define discrete states.");
      }
    }

    if (Array.isArray(obj.relationships)) {
      const allowedRelations = ["part-of", "prerequisite", "correlates-with"];
      for (const r of obj.relationships) {
        if (!r.targetCompetencyId) errors.push("Relationship missing targetCompetencyId.");
        if (!r.type || !allowedRelations.includes(r.type)) {
          errors.push("Relationship type must be one of: part-of, prerequisite, correlates-with.");
        }
        if (r.targetCompetencyId === obj.id) {
          errors.push("Competency cannot reference itself in relationships.");
        }
        if (db && !db.competencies?.find(c => c.id === r.targetCompetencyId)) {
          errors.push(`Invalid relationship targetCompetencyId: ${r.targetCompetencyId}`);
        }
      }
    }

    if (db && obj.relationships?.length) {
      const prerequisiteEdges = {};
      db.competencies?.forEach(c => {
        prerequisiteEdges[c.id] = (c.relationships || [])
          .filter(r => r.type === "prerequisite")
          .map(r => r.targetCompetencyId);
      });

      prerequisiteEdges[obj.id] = (obj.relationships || [])
        .filter(r => r.type === "prerequisite")
        .map(r => r.targetCompetencyId);

      const visited = new Set();
      const stack = new Set();

      function hasCycle(node) {
        if (!prerequisiteEdges[node]) return false;
        if (stack.has(node)) return true;
        if (visited.has(node)) return false;
        visited.add(node);
        stack.add(node);
        for (const neighbor of prerequisiteEdges[node]) {
          if (hasCycle(neighbor)) return true;
        }
        stack.delete(node);
        return false;
      }

      if (hasCycle(obj.id)) {
        errors.push("Prerequisite relationships cannot form cycles.");
      }
    }

    if (db && obj.modelId) {
      const model = db.competencyModels?.find(m => m.id === obj.modelId);
      if (model?.measurementIntent === "unidimensional") {
        const siblings = db.competencies?.filter(
          c => c.modelId === obj.modelId && c.id !== obj.id
        );
        if (siblings?.length > 0) {
          errors.push("Unidimensional competency model cannot contain multiple independent competencies.");
        }
      }
    }
  }

    /* =====================================================
     STRICT ECD VALIDATION — TASK MODELS (RESTORED + FULL GOVERNANCE)
  ===================================================== */

  if (collection === "taskModels") {

    /* STRICTNESS -- read this before adding a rule here.

       The Task Model Wizard silently PUTs its draft on every Next once it
       has crossed step 1, exactly like the Competency and Evidence
       wizards. Every presence rule in this block used to run in full
       strict mode on those saves, so a draft leaving Step 2 (Evidence
       Binding) -- which legitimately has no observables, no task
       structure and no blueprint yet, because Steps 3-5 author them --
       came back as a 400 listing fields the author had not reached. The
       wizard was structurally guaranteed to fail its own auto-save.

       This is the same defect already fixed for competency models and
       evidence models; see the `strict` option at the top of this
       function. PRESENCE of a thing a later step authors is gated on
       `strict`. Referential integrity (a dangling evidenceModelId, an
       observation pointing at an unbound model) and value validity for
       values that ARE present are never gated. Confirmation runs strict,
       so nothing incomplete can be locked. */

    // Task must reference at least one evidence model
    if (strict && (!Array.isArray(obj.evidenceModelIds) || obj.evidenceModelIds.length === 0)) {
      errors.push("TaskModel must declare at least one evidenceModelId.");
    } else if (Array.isArray(obj.evidenceModelIds) && obj.evidenceModelIds.length > 0) {
      if (db) {
        for (const emId of obj.evidenceModelIds) {
          const em = db.evidenceModels?.find(e => e.id === emId);
          if (!em) {
            errors.push(`Invalid evidenceModelId '${emId}'.`);
          } else if (!allowDraftParents && !isLinkableEvidenceModel(em)) {
            errors.push(
              `EvidenceModel '${emId}' must be confirmed before linking to TaskModel (this one is '${em.status}').`
            );
          }
        }
      }

      /* The primary binding is where this TaskModel's construct comes
         from, now that it declares no competency of its own. Presence is
         a completeness rule (a draft mid-authoring may not have chosen
         one yet, so it relaxes under { strict: false }); a pointer that
         does NOT resolve into the binding is a referential error and is
         always rejected. */
      if (strict && !obj.primaryEvidenceModelId) {
        errors.push("TaskModel must nominate a primaryEvidenceModelId.");
      }

      if (
        obj.primaryEvidenceModelId &&
        !obj.evidenceModelIds.includes(obj.primaryEvidenceModelId)
      ) {
        errors.push(
          `primaryEvidenceModelId '${obj.primaryEvidenceModelId}' is not among the declared evidenceModelIds.`
        );
      }
    }

    if (strict && (!Array.isArray(obj.expectedObservations) || obj.expectedObservations.length === 0)) {
      errors.push("TaskModel must declare at least one expectedObservation.");
    } else if (Array.isArray(obj.expectedObservations) && obj.expectedObservations.length > 0) {

      let requiredCount = 0;
      let weightSum = 0;

      for (const eo of obj.expectedObservations) {

        if (!eo.observationId) {
          errors.push("expectedObservation missing observationId.");
        }

        if (!eo.evidenceModelId) {
          errors.push("expectedObservation missing evidenceModelId.");
        }

        if (typeof eo.required !== "boolean") {
          errors.push(`Observation '${eo.observationId}' must define required flag.`);
        }

        /* A weight of 0 is tolerated WHILE DRAFTING -- the author may be
           mid-way through reallocating -- but never at confirmation.

           The sum rule below does not catch it: three observables at
           1 / 0 / 0 total exactly 1.0 and sail through, leaving two
           observables the task declares it will elicit which contribute
           nothing to the inference. That is a contradiction, not a valid
           allocation, and it is what the client-side readiness check in
           taskModelConstants.js also now refuses. */
        if (typeof eo.weight !== "number" || Number.isNaN(eo.weight) || eo.weight < 0) {
          errors.push(`Observation '${eo.observationId}' must define a non-negative numeric weight.`);
        } else if (strict && eo.weight === 0) {
          errors.push(
            `Observation '${eo.observationId}' is targeted but carries zero weight; give it a share of the allocation or remove it.`
          );
        }

        if (eo.required) requiredCount++;
        weightSum += Number(eo.weight) || 0;

        if (obj.evidenceModelIds && !obj.evidenceModelIds.includes(eo.evidenceModelId)) {
          errors.push(
            `Observation '${eo.observationId}' references undeclared evidenceModelId '${eo.evidenceModelId}'.`
          );
        }
      }

      if (strict && requiredCount === 0) {
        errors.push("At least one expectedObservation must be required.");
      }

      if (strict && weightSum <= 0) {
        errors.push("Total observation weight must be > 0.");
      }

      if (strict && Math.abs(weightSum - 1) > 0.001) {
        errors.push(
          `Observable weights must sum to 1 (currently ${weightSum.toFixed(3)}).`
        );
      }
    }

    if (strict && !obj.taskStructure) {
      errors.push("TaskModel must define taskStructure.");
    } else if (obj.taskStructure) {

      const ts = obj.taskStructure;

      const allowedPresentation = [
        "interactive",
        "simulation",
        "performance",
        "constructed"
      ];

      const allowedResponse = [
        "selected",
        "constructed",
        "hybrid"
      ];

      const allowedStimulus = [
        "static",
        "parameterized",
        "generative"
      ];

      /* An unset value is "not authored yet" and only matters at
         confirmation; a SET value outside the enum is always wrong. */
      if (strict ? !allowedPresentation.includes(ts.presentationMode)
                 : Boolean(ts.presentationMode) && !allowedPresentation.includes(ts.presentationMode)) {
        errors.push("Invalid taskStructure.presentationMode.");
      }

      if (strict ? !allowedResponse.includes(ts.responseFormat)
                 : Boolean(ts.responseFormat) && !allowedResponse.includes(ts.responseFormat)) {
        errors.push("Invalid taskStructure.responseFormat.");
      }

      if (strict ? !allowedStimulus.includes(ts.stimulusPolicy)
                 : Boolean(ts.stimulusPolicy) && !allowedStimulus.includes(ts.stimulusPolicy)) {
        errors.push("Invalid taskStructure.stimulusPolicy.");
      }

      if (ts.administration && typeof ts.administration !== "object") {
        errors.push("taskStructure.administration must be object.");
      }

      if (ts.timingConstraint && typeof ts.timingConstraint !== "object") {
        errors.push("taskStructure.timingConstraint must be object.");
      }

      if (ts.resourceConstraints && typeof ts.resourceConstraints !== "object") {
        errors.push("taskStructure.resourceConstraints must be object.");
      }
    }

    if (strict && !obj.blueprintConstraints) {
      errors.push("TaskModel must define blueprintConstraints.");
    } else if (obj.blueprintConstraints) {

      const bc = obj.blueprintConstraints;

      if (bc.difficultyRange) {
        const hasBothBounds =
          typeof bc.difficultyRange.min === "number" &&
          typeof bc.difficultyRange.max === "number";

        if (strict && !hasBothBounds) {
          errors.push("difficultyRange must define numeric min and max.");
        }

        // An inverted range is wrong whether or not we are confirming.
        if (hasBothBounds && bc.difficultyRange.min >= bc.difficultyRange.max) {
          errors.push("difficultyRange.min must be less than max.");
        }
      }

      /* maxUses is optional -- an absent cap means unlimited. The old
         check fired on `{}`, which is what the wizard sends whenever the
         author leaves the field blank, so "exposurePolicy.maxUses must be
         numeric" was raised for a policy the author never opened. Only a
         PRESENT non-numeric value is an error now. */
      if (
        bc.exposurePolicy &&
        bc.exposurePolicy.maxUses !== undefined &&
        bc.exposurePolicy.maxUses !== null &&
        typeof bc.exposurePolicy.maxUses !== "number"
      ) {
        errors.push("exposurePolicy.maxUses must be numeric.");
      }

      /* The two item-contract whitelists. These are enforced against
         every Item further down this file (interaction.type and
         scoring.method); an empty or absent list means unconstrained. */
      if (
        bc.allowedInteractionTypes !== undefined &&
        !Array.isArray(bc.allowedInteractionTypes)
      ) {
        errors.push("blueprintConstraints.allowedInteractionTypes must be an array.");
      }

      if (
        bc.allowedScoringMethods !== undefined &&
        !Array.isArray(bc.allowedScoringMethods)
      ) {
        errors.push("blueprintConstraints.allowedScoringMethods must be an array.");
      }

      // Day 22 (vocabulary consolidation): same enum-validity gap as the
      // item-level cognitiveDemand check below -- bloomLevel/reasoningType
      // were bare 'string' with no allow-list check until now.
      if (bc.cognitiveDemand?.bloomLevel &&
          !BLOOM_LEVEL_VALUES.includes(bc.cognitiveDemand.bloomLevel)) {
        errors.push(
          `Unknown blueprintConstraints.cognitiveDemand.bloomLevel '${bc.cognitiveDemand.bloomLevel}'. Known levels: ${BLOOM_LEVEL_VALUES.join(", ")}.`
        );
      }

      if (bc.cognitiveDemand?.reasoningType &&
          !REASONING_TYPE_VALUES.includes(bc.cognitiveDemand.reasoningType)) {
        errors.push(
          `Unknown blueprintConstraints.cognitiveDemand.reasoningType '${bc.cognitiveDemand.reasoningType}'. Known types: ${REASONING_TYPE_VALUES.join(", ")}.`
        );
      }
    }

    /* ---------------------------------------------------
      COMPOSITION INTEGRITY
    --------------------------------------------------- */

    if (obj.taskCompositionType &&
        !["atomic", "composite"].includes(obj.taskCompositionType)) {
      errors.push("taskCompositionType must be 'atomic' or 'composite'.");
    }

    if (obj.taskCompositionType === "atomic" &&
        Array.isArray(obj.subTaskIds) &&
        obj.subTaskIds.length > 0) {
      errors.push("An atomic TaskModel cannot declare subTaskIds.");
    }

    if (Array.isArray(obj.subTaskIds) && obj.subTaskIds.includes(obj.id)) {
      errors.push("TaskModel cannot reference itself as a sub-task.");
    }

    /* ---------------------------------------------------
      TASK MODEL VERSION GOVERNANCE
    --------------------------------------------------- */

    if (!obj.status) {
      errors.push("TaskModel must define status.");
    }

    const allowedStatus = [
      "draft",
      "reviewed",
      "confirmed",
      "operational",
      "archived"
    ];

    if (obj.status && !allowedStatus.includes(obj.status)) {
      errors.push("Invalid TaskModel status.");
    }

    if (obj.status === "confirmed" && !obj.locked) {
      errors.push("Confirmed TaskModel must be locked.");
    }

    if (typeof obj.versionNumber !== "number" || obj.versionNumber < 1) {
      errors.push("TaskModel must define valid versionNumber.");
    }

    if (db && obj.id) {

      const existing = db.taskModels?.find(m => m.id === obj.id);

      if (existing) {

        /* Prevent version rollback */
        if (obj.versionNumber < existing.versionNumber) {
          errors.push("TaskModel versionNumber cannot decrease.");
        }

        /* Prevent structural mutation without version increment */
        /* Anything that changes what the model MEASURES or how it is
           built. primaryEvidenceModelId, taskCompositionType and
           subTaskIds were missing, so a locked model's construct pointer
           and its whole composite structure could be rewritten in place
           without a version bump. */
        const structuralFields = [
          "evidenceModelIds",
          "primaryEvidenceModelId",
          "expectedObservations",
          "taskStructure",
          "blueprintConstraints",
          "taskCompositionType",
          "subTaskIds"
        ];

        const structuralChanged = structuralFields.some(field =>
          JSON.stringify(existing[field]) !== JSON.stringify(obj[field])
        );

        if (
          existing.locked &&
          structuralChanged &&
          obj.versionNumber === existing.versionNumber
        ) {
          errors.push(
            "Structural changes require version increment via cloning."
          );
        }
      }
    }

    /* ---------------------------------------------------
      TASK MODEL LIFECYCLE ENFORCEMENT
    --------------------------------------------------- */

    const lifecycleOrder = [
      "draft",
      "reviewed",
      "confirmed",
      "operational",
      "archived"
    ];

    if (db && obj.id) {

      const existing = db.taskModels?.find(
        m => m.id === obj.id
      );

      if (existing) {

        const prevIndex = lifecycleOrder.indexOf(existing.status);
        const nextIndex = lifecycleOrder.indexOf(obj.status);

        if (nextIndex === -1) {
          errors.push("Invalid lifecycle state.");
        }

        if (nextIndex < prevIndex) {
          errors.push("Lifecycle regression not allowed.");
        }

        if (nextIndex - prevIndex > 1) {
          errors.push("Lifecycle skipping not allowed.");
        }

        /* Operational immutability.

           Same field list as the version-increment guard above -- the two
           had drifted apart, leaving primaryEvidenceModelId,
           taskCompositionType and subTaskIds mutable on a live model. */
        if (existing.status === "operational") {

          const structuralFields = [
            "evidenceModelIds",
            "primaryEvidenceModelId",
            "expectedObservations",
            "taskStructure",
            "blueprintConstraints",
            "taskCompositionType",
            "subTaskIds"
          ];

          const structuralChanged = structuralFields.some(field =>
            JSON.stringify(existing[field]) !== JSON.stringify(obj[field])
          );

          if (structuralChanged) {
            errors.push(
              "Operational TaskModel cannot be structurally modified. Clone instead."
            );
          }
        }

        /* Archived immutability */
        if (existing.status === "archived") {
          errors.push("Archived TaskModel cannot be modified.");
        }
      }
    }

    /* ---------------------------------------------------
      ADAPTIVE READINESS COHERENCE LAYER

      Cross-model compatibility: does this task's FORM actually suit the
      statistical model the bound evidence runs on?

      EVERY rule below reads a field authored in Step 3, 4 or 5 --
      taskStructure.responseFormat, taskStructure.stimulusPolicy, and the
      count and spread of expectedObservations. The whole layer used to
      run unconditionally, including on the draft autosave the wizard
      fires when leaving Step 2 (Evidence Binding). At that moment
      responseFormat is "" and expectedObservations is [], so binding an
      IRT-backed evidence model produced:

        "IRT/Rasch evidence requires selected or hybrid response format
         (TaskModel incompatible with irt)."

      ...for a field that is only authored two steps later, and which the
      author could not reach because Next was blocked by this very error.
      A circular deadlock: the wizard could not be completed at all for
      any IRT, CTT, Bayesian-network or threshold evidence model.

      This is a coherence judgement about a FINISHED design, so it belongs
      on the confirmation gate, not on every keystroke-driven autosave.
      Gated on `strict` like the rest of the completeness rules in this
      block -- see the strictness note at the top of the taskModels
      section. Step4TaskStructure surfaces the same constraints live, as
      advisories, so the author learns about them while choosing rather
      than at the moment they try to confirm.
    --------------------------------------------------- */

    if (strict && db && obj.evidenceModelIds?.length) {

      for (const emId of obj.evidenceModelIds) {

        const em = db.evidenceModels?.find(
          e => e.id === emId
        );

        if (!em) continue;

        const activeStatModel = em.statisticalModels?.find(
          sm => sm.active
        );

        if (!activeStatModel) continue;

        const smType = activeStatModel.type;
        const ts = obj.taskStructure || {};

        /* 1️⃣ IRT / RASCH REQUIRE STRUCTURED RESPONSE */
        if (["irt", "rasch"].includes(smType)) {

          if (!ts.responseFormat) {
            errors.push(
              `Task structure must declare a response format before confirming against ${smType} evidence ('${em.name || emId}').`
            );
          } else if (!["selected", "hybrid"].includes(ts.responseFormat)) {
            errors.push(
              `IRT/Rasch evidence requires selected or hybrid response format (TaskModel incompatible with ${smType}).`
            );
          }

          if (ts.stimulusPolicy === "static") {
            errors.push(
              "IRT-based adaptive tasks should not use fully static stimulusPolicy."
            );
          }
        }

        /* 2️⃣ BAYESIAN NETWORK REQUIRES MULTI-OBSERVABLE DESIGN */
        if (smType === "bayesian_network") {

          if ((obj.expectedObservations || []).length < 2) {
            errors.push(
              "Bayesian network evidence requires multiple expectedObservations."
            );
          }
        }

        /* 3️⃣ CLASSICAL TEST THEORY REQUIRES A MULTI-OBSERVABLE FORM
              Internal-consistency reliability -- the whole quality claim of
              a CTT score -- is undefined below two components. */
        if (smType === "ctt") {

          if ((obj.expectedObservations || []).length < 2) {
            errors.push(
              "Classical Test Theory evidence requires at least two expectedObservations; reliability cannot be estimated from one."
            );
          }
        }

        /* 4️⃣ THRESHOLD MODEL REQUIRES ORDERED WEIGHTS */
        if (smType === "threshold") {

          const weights = (obj.expectedObservations || [])
            .map(o => o.weight);

          // Below two observables the rule is not "weights don't vary", it
          // is "there is nothing to vary". Say that instead.
          if (weights.length < 2) {
            errors.push(
              "Threshold model requires at least two expectedObservations with differing weights."
            );
          } else if (new Set(weights).size < 2) {
            errors.push(
              "Threshold model requires varying observable weights."
            );
          }
        }

        /* 5️⃣ SUM MODEL REQUIRES UNIFORM WEIGHTS */
        if (smType === "sum") {

          const weights = (obj.expectedObservations || [])
            .map(o => o.weight);

          const uniqueWeights = new Set(weights);

          if (uniqueWeights.size > 1) {
            errors.push(
              "Sum model requires uniform observable weights."
            );
          }
        }
      }
    }
  }

  /* =====================================================
     PHASE 7 — STEP 1
     SESSION VERSION LOCK ENFORCEMENT
  ===================================================== */

  if (collection === "sessions") {

    /* Day 33 (Week 7): the persisted shape of an accumulated Student Model
       Variable posterior -- server/delivery/evidenceAccumulation.js's
       applyPosteriorsToSession() is the one producer, this is the one
       validator, and the "smvPosteriors[smvId].smvId === smvId" check
       below is the "one pointer, validated on both sides" invariant
       (Part 1.3) applied to a MAP KEY instead of a foreign-id field: the
       key and the stored copy of the id can't be allowed to disagree with
       each other.

       Deliberately a NEW field (studentModel.smvPosteriors), not a reuse
       of the pre-existing studentModel.irtTheta/bnPosteriors -- those
       belong to the legacy, still-live db.questions adaptive-selection
       path (see reportsRoutes.js, sessionRoutes.js) and are keyed and
       shaped for a different purpose (a single scalar theta; a flat
       node-id -> probability map for a Bayesian network's CPT nodes, with
       no per-entry provenance at all). Overloading either field with the
       new item-based accumulation's {estimate, precision, ...} per-SMV
       shape would silently conflate two unrelated concepts under one name
       -- exactly what the "one pointer" invariant exists to prevent.

       Runs unconditionally (not gated on status, unlike the provenance
       loop below) because a malformed posterior is a structural defect
       regardless of what stage the session is in, and posteriors
       accumulate continuously while a session is still in progress. */
    if (obj.studentModel?.smvPosteriors !== undefined) {

      const smvPosteriors = obj.studentModel.smvPosteriors;

      if (
        typeof smvPosteriors !== "object" ||
        smvPosteriors === null ||
        Array.isArray(smvPosteriors)
      ) {
        errors.push(
          "studentModel.smvPosteriors must be an object keyed by Student Model Variable id."
        );
      } else {
        for (const [smvId, posterior] of Object.entries(smvPosteriors)) {

          const prefix = `studentModel.smvPosteriors['${smvId}']`;

          if (!posterior || typeof posterior !== "object") {
            errors.push(`${prefix} must be an object.`);
            continue;
          }

          if (posterior.smvId !== smvId) {
            errors.push(`${prefix}.smvId ('${posterior.smvId}') must match its own key ('${smvId}').`);
          }

          for (const field of ["evidenceModelId", "modelFamily", "method"]) {
            if (typeof posterior[field] !== "string" || !posterior[field]) {
              errors.push(`${prefix}.${field} must be a non-empty string.`);
            }
          }

          // Day 38 (Week 8, pilot-vs-calibrated split, build reference
          // Part 0.2): `parameterSetId` is only meaningful for a
          // "calibrated" posterior -- a "pilot" one has no parameter set
          // to point at (its numbers live on the scoring item itself), and
          // a "not-applicable" one (CTT/sum/threshold) never had one to
          // begin with. Absent `parameterSource` defaults to "calibrated"
          // for a posterior persisted before this field existed, so the
          // requirement below is unchanged for every pre-Day-38 record.
          const parameterSource = posterior.parameterSource || "calibrated";

          if (!["calibrated", "pilot", "not-applicable"].includes(parameterSource)) {
            errors.push(`${prefix}.parameterSource ('${posterior.parameterSource}') must be one of: calibrated, pilot, not-applicable.`);
          }

          if (parameterSource === "calibrated") {
            if (typeof posterior.parameterSetId !== "string" || !posterior.parameterSetId) {
              errors.push(`${prefix}.parameterSetId must be a non-empty string for a 'calibrated' posterior.`);
            }
          } else if (posterior.parameterSetId != null) {
            errors.push(`${prefix}.parameterSetId must be absent for a '${parameterSource}' posterior (it has no calibrated parameter set to point at).`);
          }

          if (!Number.isFinite(posterior.estimate)) {
            errors.push(`${prefix}.estimate must be a finite number.`);
          }

          // Precision is the whole point of persisting a DISTRIBUTION and
          // not a bare point estimate -- see evidenceAccumulation.js's own
          // header. A negative or non-finite value here would be exactly
          // the "confidently wrong number" that module's entire design
          // exists to prevent from ever being produced in the first place;
          // this is the check that stops one from being written even if it
          // were.
          if (!(Number.isFinite(posterior.precision) && posterior.precision >= 0)) {
            errors.push(`${prefix}.precision must be a non-negative finite number.`);
          }

          if (!(Number.isFinite(posterior.responsesUsed) && posterior.responsesUsed >= 0)) {
            errors.push(`${prefix}.responsesUsed must be a non-negative number.`);
          }

          if (!(Number.isFinite(posterior.responsesExcluded) && posterior.responsesExcluded >= 0)) {
            errors.push(`${prefix}.responsesExcluded must be a non-negative number.`);
          }

          if (typeof posterior.updatedAt !== "string" || Number.isNaN(Date.parse(posterior.updatedAt))) {
            errors.push(`${prefix}.updatedAt must be an ISO date string.`);
          }
        }
      }
    }

    if (obj.stopped !== undefined) {
      const stopped = obj.stopped;
      if (!stopped || typeof stopped !== "object" || Array.isArray(stopped)) {
        errors.push("stopped must be an object.");
      } else {
        if (stopped.rule !== "maxItems" && stopped.rule !== "targetsMet") {
          errors.push("stopped.rule must be 'maxItems' or 'targetsMet'.");
        }
        if (typeof stopped.assemblyModelId !== "string" || !stopped.assemblyModelId) {
          errors.push("stopped.assemblyModelId must be a non-empty string.");
        }
        if (typeof stopped.reason !== "string" || !stopped.reason.trim()) {
          errors.push("stopped.reason must be a non-empty string.");
        }
        if (stopped.targets !== undefined && !Array.isArray(stopped.targets)) {
          errors.push("stopped.targets must be an array when present.");
        }
        if (stopped.stoppedAt !== undefined) {
          if (typeof stopped.stoppedAt !== "string" || Number.isNaN(Date.parse(stopped.stoppedAt))) {
            errors.push("stopped.stoppedAt must be an ISO date string when present.");
          }
        }
      }
    }

    if (db && [SESSION_STATUS.IN_PROGRESS, SESSION_STATUS.SUBMITTED, "reviewed"].includes(obj.status)) {

      // Day 30 (adversarial review finding): this loop used to re-check
      // EVERY historical response against CURRENT db state on every single
      // session write (a submit, a pause, a finish -- anything that calls
      // validateEntity("sessions", ...)). Provenance is meant to answer
      // "was this response consistent with the world at the moment it was
      // scored" -- a historical fact, checked once, at append time.
      // Re-validating it against a WORLD THAT HAS SINCE MOVED ON (an
      // Evidence Model recalibrated, an item's version bumped) meant a
      // single recalibration permanently 400'd every future submit on
      // every session that had already scored against that Evidence Model
      // -- including sessions using the completely unrelated legacy
      // db.questions path, since this loop iterated the whole array with
      // no distinction between item-based and legacy responses mixed into
      // the same session. Only the most-recently-appended response is
      // actually being asserted as valid by the write in progress; every
      // earlier one was already checked when IT was appended and does not
      // need re-litigating against a present that has moved past it.
      const responses = obj.responses || [];
      const mostRecent = responses.length ? [responses[responses.length - 1]] : [];

      for (const r of mostRecent) {

        // Day 28: this whole block -- evidenceModelId/parameterSetId/
        // version provenance -- only ever meant anything for item-based
        // responses (it reads `db.items`, `r.itemVersion`,
        // `r.taskModelVersion` right above). It was written with no caller
        // that ever produced an item-based response, and NO scoping
        // condition of its own, so it ran unconditionally for every
        // response including the pre-existing legacy db.questions shape --
        // which never had an `evidenceModelId` field at all. That silently
        // broke every /submit call once a session reached "in_progress",
        // for every session, with zero test coverage to catch it. Now
        // correctly scoped to `r.itemId` responses only, matching the
        // version checks it already sits beside.
        if (r.itemId) {

          const item = db.items?.find(i => i.id === r.itemId);

          if (item) {

            if (r.itemVersion !== item.versionNumber) {
              errors.push("Session item version mismatch.");
            }

            if (r.taskModelVersion !== item.taskModelVersion) {
              errors.push("Session taskModelVersion mismatch.");
            }
          }

          if (!r.evidenceModelId) {
            errors.push("Session response missing evidenceModelId.");
            continue;
          }

          const evidence = db.evidenceModels?.find(
            em => em.id === r.evidenceModelId
          );

          if (!evidence) {
            errors.push(`Invalid evidenceModelId in session: ${r.evidenceModelId}`);
            continue;
          }

          // Day 38 (Week 8, pilot-vs-calibrated split): `parameterSetId`
          // is only required, and only checked against the Evidence
          // Model's active calibrated set, for a "calibrated" response.
          // A response with no `parameterSource` at all predates this
          // field and is exactly the old calibrated-only shape, so it is
          // treated as "calibrated" for backward compatibility. A "pilot"
          // response must NOT carry a parameterSetId (its numbers live on
          // the item, not the Evidence Model), and a "not-applicable"
          // (CTT/sum/threshold) response never had one to check.
          const responseParameterSource = r.parameterSource || "calibrated";

          if (!["calibrated", "pilot", "not-applicable"].includes(responseParameterSource)) {
            errors.push(
              `Session response for evidence ${r.evidenceModelId} has invalid parameterSource '${r.parameterSource}'.`
            );
          } else if (responseParameterSource === "calibrated") {
            if (!r.parameterSetId) {
              errors.push(
                `Session response for evidence ${r.evidenceModelId} missing parameterSetId.`
              );
            } else {
              const sm = evidence.statisticalModels?.find(
                sm => sm.active
              );

              if (!sm || sm.activeParameterSetId !== r.parameterSetId) {
                errors.push(
                  `Session response parameterSetId mismatch for evidence ${r.evidenceModelId}.`
                );
              }
            }
          } else if (r.parameterSetId) {
            errors.push(
              `Session response for evidence ${r.evidenceModelId} is '${responseParameterSource}' but carries a parameterSetId; it should have none.`
            );
          }

          const competency = db.competencies?.find(
            c => c.id === evidence.competencyId
          );

          if (competency) {
            const model = db.competencyModels?.find(
              m => m.id === competency.modelId
            );

            if (
              model &&
              evidence.competencyModelVersion !== model.versionNumber
            ) {
              errors.push(
                `Session evidence ${r.evidenceModelId} is bound to outdated competency model version.`
              );
            }
          }

          if (r.evidenceModelVersion !== evidence.versionNumber) {
            errors.push(
              `Session evidenceModelVersion mismatch for evidence ${r.evidenceModelId}.`
            );
          }
        }
      }
    }
  }

  /* =====================================================
     FINAL GOVERNANCE CHECKS
  ===================================================== */

  // Ensure competency models enforce lifecycle integrity
  if (collection === "competencyModels") {
    if (!obj.measurementIntent) {
      errors.push("measurementIntent is required.");
    }
    if (!["unidimensional", "multidimensional"].includes(obj.measurementIntent)) {
      errors.push("Invalid measurementIntent.");
    }
    if (!obj.status) {
      errors.push("status is required.");
    }
    if (!STATUS.includes(obj.status)) {
      errors.push(`Invalid competency model status '${obj.status}'.`);
    }
    if (obj.status === "confirmed" && !obj.locked) {
      errors.push("Confirmed models must be locked.");
    }

    /* ---------------------------------------------------
       PHASE 6 — STEP 2
       CONFIRMED COMPETENCY MODEL IMMUTABILITY
    --------------------------------------------------- */

    if (db && obj.id) {

      const existing = db.competencyModels?.find(
        m => m.id === obj.id
      );

      if (
        existing &&
        existing.status === "confirmed" &&
        obj.status === "confirmed"
      ) {

        const versionUnchanged =
          obj.versionNumber === existing.versionNumber;

        const structuralChanged =
          obj.measurementIntent !== existing.measurementIntent ||
          obj.parentModelId !== existing.parentModelId ||
          JSON.stringify(obj.constructFramework || {}) !==
          JSON.stringify(existing.constructFramework || {});

        if (versionUnchanged && structuralChanged) {
          errors.push(
            "Confirmed competency model cannot change structural fields without version increment."
          );
        }

        if (obj.versionNumber < existing.versionNumber) {
          errors.push(
            "Competency model versionNumber cannot decrease."
          );
        }
      }
    }

    /* ---------------------------------------------------
       PHASE 6 — STEP 3
       CONTROLLED VERSION EVOLUTION GOVERNANCE
    --------------------------------------------------- */

    if (db && obj.id) {

      const existing = db.competencyModels?.find(
        m => m.id === obj.id
      );

      // If version increased
      if (
        existing &&
        typeof existing.versionNumber === "number" &&
        typeof obj.versionNumber === "number" &&
        obj.versionNumber > existing.versionNumber
      ) {

        // 1️⃣ Enforce parentModelId linkage to previous version
        if (!obj.parentModelId) {
          errors.push(
            "New competency model version must reference parentModelId (previous version)."
          );
        }

        // 2️⃣ Prevent skipping versions
        if (obj.versionNumber !== existing.versionNumber + 1) {
          errors.push(
            "Competency model versionNumber must increment sequentially by 1."
          );
        }

        // 3️⃣ Prevent mutation of historical evidence bindings
        const boundEvidence = db.evidenceModels?.filter(
          em =>
            em.status === "confirmed" &&
            em.competencyModelVersion === existing.versionNumber
        ) || [];

        if (boundEvidence.length > 0 && obj.status === "confirmed") {
          errors.push(
            "Cannot confirm new competency model version while evidence models are still bound to previous version. Create migrated evidence versions first."
          );
        }
      }
    }

    /* ---------------------------------------------------
       PHASE 6 — STEP 4
       EVIDENCE MODEL MIGRATION ENFORCEMENT
    --------------------------------------------------- */

    if (db && obj.id) {

      const existing = db.competencyModels?.find(
        m => m.id === obj.id
      );

      if (
        existing &&
        typeof existing.versionNumber === "number" &&
        typeof obj.versionNumber === "number" &&
        obj.versionNumber > existing.versionNumber
      ) {

        // All evidence models tied to old version
        const oldEvidence = db.evidenceModels?.filter(
          em =>
            em.status === "confirmed" &&
            em.competencyModelVersion === existing.versionNumber
        ) || [];

        for (const em of oldEvidence) {

          const migrated = db.evidenceModels?.some(
            newer =>
              newer.competencyId === em.competencyId &&
              newer.competencyModelVersion === obj.versionNumber
          );

          if (!migrated) {
            errors.push(
              `Evidence model for competency ${em.competencyId} must be migrated to version ${obj.versionNumber} before confirming new competency model.`
            );
          }
        }
      }
    }

    /* ---------------------------------------------------
       PHASE 6 — STEP 5
       HISTORICAL TRACE PROTECTION + SOFT DEPRECATION
    --------------------------------------------------- */

    if (db && obj.id) {

      const existing = db.competencyModels?.find(
        m => m.id === obj.id
      );

      if (existing) {

        // 1️⃣ Prevent deletion of confirmed historical versions
        if (
          existing.status === "confirmed" &&
          obj.status === "draft" &&
          obj.versionNumber <= existing.versionNumber
        ) {
          errors.push(
            "Confirmed competency model versions cannot be reverted to draft. Use new version for evolution."
          );
        }

        // 2️⃣ Prevent reassignment of evidence model version bindings retroactively
        const boundEvidence = db.evidenceModels?.filter(
          em => em.competencyModelVersion === existing.versionNumber
        ) || [];

        if (
          boundEvidence.length > 0 &&
          obj.versionNumber < existing.versionNumber
        ) {
          errors.push(
            "Cannot downgrade competency model version while evidence models are historically bound to it."
          );
        }

        // 3️⃣ Soft deprecation rule: old versions must remain locked
        if (
          existing.status === "confirmed" &&
          existing.versionNumber < (db.competencyModels?.reduce(
            (max, m) => Math.max(max, m.versionNumber || 0),
            0
          ) || 0) &&
          obj.locked === false
        ) {
          errors.push(
            "Historical competency model versions must remain locked (soft deprecation enforced)."
          );
        }
      }
    }

    /* ---------------------------------------------------
       PHASE 6 — STEP 6
       STUDENT MODEL VARIABLES (SMVs)
       Optional at every status (see the `smVariables` field comment
       above) -- these checks validate the SHAPE of entries that ARE
       present, they never require the array to be non-empty. This runs
       unconditionally (not gated by `strict`) because, unlike wizard
       step completeness, a malformed SMV that IS authored is wrong at
       every status, not just at confirm time.
    --------------------------------------------------- */

    if (obj.psychologicalPerspective !== undefined && obj.psychologicalPerspective !== null) {
      if (!PSYCHOLOGICAL_PERSPECTIVE_VALUES.includes(obj.psychologicalPerspective)) {
        errors.push(
          `Invalid psychologicalPerspective '${obj.psychologicalPerspective}'. Must be one of: ${PSYCHOLOGICAL_PERSPECTIVE_VALUES.join(", ")}.`
        );
      }
    }

    if (Array.isArray(obj.smVariables)) {
      const seenIds = new Set();

      obj.smVariables.forEach((smv, i) => {
        const tag = `smVariables[${i}]${smv?.id ? ` (${smv.id})` : ""}`;

        if (!smv || typeof smv !== "object") {
          errors.push(`${tag} must be an object.`);
          return;
        }

        if (!smv.id || !smv.label || !smv.type) {
          errors.push(`${tag} is missing a required field: id, label and type are all required.`);
        }

        if (smv.id) {
          if (seenIds.has(smv.id)) {
            errors.push(`Duplicate smVariables id '${smv.id}'.`);
          }
          seenIds.add(smv.id);
        }

        if (smv.type && !SM_VARIABLE_TYPE_VALUES.includes(smv.type)) {
          errors.push(
            `${tag} has invalid type '${smv.type}'. Must be one of: ${SM_VARIABLE_TYPE_VALUES.join(", ")}.`
          );
          // Type-dependent checks below all assume a known type.
          return;
        }

        const scale = smv.scale || {};

        if (smv.type === "continuous") {
          const { min, max } = scale;
          if (typeof min !== "number" || typeof max !== "number" || min >= max) {
            errors.push(`${tag} (continuous) requires scale.min < scale.max.`);
          }
        } else if (smv.type === "binary" || smv.type === "ordinal" || smv.type === "categorical") {
          const states = scale.states;
          if (!Array.isArray(states) || new Set(states).size !== states.length) {
            errors.push(`${tag} (${smv.type}) requires scale.states as an array of unique values.`);
          } else if (smv.type === "binary" && states.length !== 2) {
            errors.push(`${tag} (binary) requires exactly 2 scale.states.`);
          } else if (smv.type !== "binary" && states.length < 2) {
            errors.push(`${tag} (${smv.type}) requires at least 2 scale.states.`);
          }
        }

        const prior = smv.priorDistribution;
        if (!prior || typeof prior !== "object" || !prior.family) {
          errors.push(`${tag} requires a priorDistribution with a family.`);
        } else if (smv.type && !isPriorFamilyCompatible(smv.type, prior.family)) {
          errors.push(
            `${tag} (${smv.type}) has incompatible priorDistribution.family '${prior.family}'. Allowed: ${priorFamiliesForSmVariableType(smv.type).join(", ")}.`
          );
        } else if (!priorDistributionParamsAreValid(prior.family, prior.params)) {
          errors.push(`${tag} has invalid priorDistribution.params for family '${prior.family}'.`);
        }
      });
    }
  }

  /* =====================================================
     ASSEMBLY MODELS — Day 17 (structural), Day 21 (lifecycle)
     -----------------------------------------------------
     Structural + referential-integrity validation here. Promotion-
     readiness completeness (what must be true for THIS status change to
     be allowed, not just internally well-formed) lives in
     validateAssemblyModelLifecycle (server/utils/lifecycleValidation.js),
     the same separation of concerns taskModels/items already use. Full
     version-migration governance (the multi-step chain competencyModels
     has) is deliberately not built here -- out of scope for "legal
     transitions + a promotion validator."
  ===================================================== */

  if (collection === "assemblyModels") {

    if (!obj.name) errors.push("Assembly model name is required.");
    if (!obj.competencyModelId) errors.push("competencyModelId is required.");
    if (!obj.status) {
      errors.push("status is required.");
    } else if (!STATUS.includes(obj.status)) {
      errors.push(`Invalid assembly model status '${obj.status}'.`);
    }
    if (obj.status === "confirmed" && !obj.locked) {
      errors.push("Confirmed assembly models must be locked.");
    }

    const competencyModel = db && obj.competencyModelId
      ? db.competencyModels?.find(m => m.id === obj.competencyModelId)
      : undefined;

    if (db && obj.competencyModelId && !competencyModel) {
      errors.push(`Invalid competencyModelId: ${obj.competencyModelId}`);
    }

    const knownSmVariables = new Map(
      (competencyModel?.smVariables || []).map(smv => [smv.id, smv])
    );

    if (obj.targetsBySMV !== undefined && !Array.isArray(obj.targetsBySMV)) {
      errors.push("targetsBySMV should be array");
    } else if (Array.isArray(obj.targetsBySMV)) {
      const seenSmvIds = new Set();

      obj.targetsBySMV.forEach((target, i) => {
        const tag = `targetsBySMV[${i}]`;

        if (!target || typeof target !== "object" || !target.smvId) {
          errors.push(`${tag} requires an smvId.`);
          return;
        }

        if (seenSmvIds.has(target.smvId)) {
          errors.push(`${tag} duplicates target smvId '${target.smvId}'.`);
        }
        seenSmvIds.add(target.smvId);

        // Only checkable once the competency model is resolvable; a
        // dangling competencyModelId is already reported above and
        // would make every target look "unknown" for the wrong reason.
        if (competencyModel) {
          const smv = knownSmVariables.get(target.smvId);
          if (!smv) {
            errors.push(`${tag} names smvId '${target.smvId}', which does not exist on competency model '${obj.competencyModelId}'.`);
            return;
          }

          const hasSEM = typeof target.requiredSEM === "number";
          const hasAccuracy = typeof target.requiredClassificationAccuracy === "number";

          if (hasSEM === hasAccuracy) {
            errors.push(`${tag} must specify exactly one of requiredSEM or requiredClassificationAccuracy.`);
          } else if (smv.type === "continuous") {
            if (!hasSEM) {
              errors.push(`${tag} targets a continuous SMV ('${target.smvId}') and must specify requiredSEM, not requiredClassificationAccuracy.`);
            } else if (target.requiredSEM <= 0) {
              errors.push(`${tag} requiredSEM must be greater than 0.`);
            }
          } else {
            if (!hasAccuracy) {
              errors.push(`${tag} targets a ${smv.type} SMV ('${target.smvId}') and must specify requiredClassificationAccuracy, not requiredSEM.`);
            } else if (target.requiredClassificationAccuracy <= 0 || target.requiredClassificationAccuracy > 1) {
              errors.push(`${tag} requiredClassificationAccuracy must be in (0, 1].`);
            }
          }
        }
      });
    }

    if (obj.stoppingRules !== undefined && obj.stoppingRules !== null) {
      const sr = obj.stoppingRules;
      if (typeof sr !== "object" || Array.isArray(sr)) {
        errors.push("stoppingRules should be object");
      } else {
        const { maxItems, minItems, targetsMet } = sr;
        if (maxItems === undefined && minItems === undefined && targetsMet === undefined) {
          errors.push("stoppingRules must declare at least one of maxItems, minItems or targetsMet.");
        }
        if (maxItems !== undefined && (typeof maxItems !== "number" || maxItems <= 0)) {
          errors.push("stoppingRules.maxItems must be a positive number.");
        }
        if (minItems !== undefined && (typeof minItems !== "number" || minItems <= 0)) {
          errors.push("stoppingRules.minItems must be a positive number.");
        }
        if (
          typeof maxItems === "number" &&
          typeof minItems === "number" &&
          minItems > maxItems
        ) {
          errors.push("stoppingRules.minItems cannot exceed stoppingRules.maxItems.");
        }
        if (targetsMet !== undefined && typeof targetsMet !== "boolean") {
          errors.push("stoppingRules.targetsMet should be boolean");
        }
      }
    }

    if (!obj.selectionAlgorithm || typeof obj.selectionAlgorithm !== "object") {
      errors.push("selectionAlgorithm is required and must reference a policyId.");
    } else if (!obj.selectionAlgorithm.policyId) {
      errors.push("selectionAlgorithm.policyId is required.");
    } else if (db && !db.policies?.find(p => p.id === obj.selectionAlgorithm.policyId)) {
      errors.push(`Invalid selectionAlgorithm.policyId: ${obj.selectionAlgorithm.policyId}`);
    }
  }

  /* =====================================================
     Q-MATRIX MODELS — Day 18, Week 4 core schema
     -----------------------------------------------------
     Structural + referential-integrity validation only, mirroring
     assemblyModels' Day 17 scope. Every `attributeIds` entry must be a
     `binary`-type SMV -- a Q-matrix is defined over binary attributes by
     construction, not merely "usually". No all-zero-row / identifiability
     advisory checks yet; those are UI-facing (Q-matrix editor, W10).
  ===================================================== */

  if (collection === "qMatrixModels") {

    if (!obj.name) errors.push("Q-matrix name is required.");
    if (!obj.competencyModelId) errors.push("competencyModelId is required.");
    if (!obj.status) {
      errors.push("status is required.");
    } else if (!STATUS.includes(obj.status)) {
      errors.push(`Invalid Q-matrix status '${obj.status}'.`);
    }
    if (obj.status === "confirmed" && !obj.locked) {
      errors.push("Confirmed Q-matrix models must be locked.");
    }

    const competencyModel = db && obj.competencyModelId
      ? db.competencyModels?.find(m => m.id === obj.competencyModelId)
      : undefined;

    if (db && obj.competencyModelId && !competencyModel) {
      errors.push(`Invalid competencyModelId: ${obj.competencyModelId}`);
    }

    const knownSmVariables = new Map(
      (competencyModel?.smVariables || []).map(smv => [smv.id, smv])
    );

    const declaredAttributeIds = new Set();

    if (obj.attributeIds !== undefined && !Array.isArray(obj.attributeIds)) {
      errors.push("attributeIds should be array");
    } else if (Array.isArray(obj.attributeIds)) {
      obj.attributeIds.forEach((attrId, i) => {
        if (declaredAttributeIds.has(attrId)) {
          errors.push(`Duplicate attributeIds entry '${attrId}'.`);
        }
        declaredAttributeIds.add(attrId);

        // Only checkable once the competency model is resolvable; a
        // dangling competencyModelId is already reported above.
        if (competencyModel) {
          const smv = knownSmVariables.get(attrId);
          if (!smv) {
            errors.push(`attributeIds[${i}] names '${attrId}', which does not exist on competency model '${obj.competencyModelId}'.`);
          } else if (smv.type !== "binary") {
            errors.push(`attributeIds[${i}] ('${attrId}') is a '${smv.type}' Student Model Variable. Q-matrix attributes must be binary.`);
          }
        }
      });
    }

    if (obj.entries !== undefined && !Array.isArray(obj.entries)) {
      errors.push("entries should be array");
    } else if (Array.isArray(obj.entries)) {
      const seenPairs = new Set();

      obj.entries.forEach((entry, i) => {
        const tag = `entries[${i}]`;

        if (!entry || typeof entry !== "object" || !entry.itemId || !entry.attributeId) {
          errors.push(`${tag} requires both itemId and attributeId.`);
          return;
        }

        const pairKey = `${entry.itemId}::${entry.attributeId}`;
        if (seenPairs.has(pairKey)) {
          errors.push(`${tag} duplicates the (itemId, attributeId) pair for '${entry.itemId}' / '${entry.attributeId}'.`);
        }
        seenPairs.add(pairKey);

        if (!declaredAttributeIds.has(entry.attributeId)) {
          errors.push(`${tag} references attributeId '${entry.attributeId}', which is not declared in attributeIds.`);
        }

        if (db && !db.items?.find(it => it.id === entry.itemId)) {
          errors.push(`${tag} references unknown itemId '${entry.itemId}'.`);
        }

        if (entry.required !== undefined && typeof entry.required !== "boolean") {
          errors.push(`${tag}.required should be boolean`);
        }
      });
    }
  }

  /* =====================================================
     COMPOSITE LIBRARY — Day 19, Week 4 core schema
     -----------------------------------------------------
     Structural + referential-integrity validation only. The builder
     that actually compiles one of these from a Task Model is Day 24;
     this just gives it a real shape to write into.
  ===================================================== */

  if (collection === "compositeLibrary") {

    if (!obj.taskModelId) errors.push("taskModelId is required.");
    if (typeof obj.taskModelVersion !== "number") errors.push("taskModelVersion is required and must be a number.");
    if (!obj.compiledAt) errors.push("compiledAt is required.");

    const taskModel = db && obj.taskModelId
      ? db.taskModels?.find(tm => tm.id === obj.taskModelId)
      : undefined;

    if (db && obj.taskModelId && !taskModel) {
      errors.push(`Invalid taskModelId: ${obj.taskModelId}`);
    }

    if (obj.items !== undefined && !Array.isArray(obj.items)) {
      errors.push("items should be array");
    } else if (Array.isArray(obj.items)) {
      obj.items.forEach((entry, i) => {
        const tag = `items[${i}]`;

        if (!entry || typeof entry !== "object" || !entry.itemId) {
          errors.push(`${tag} requires an itemId.`);
          return;
        }

        if (db) {
          const item = db.items?.find(it => it.id === entry.itemId);
          if (!item) {
            errors.push(`${tag} references unknown itemId '${entry.itemId}'.`);
          } else if (item.taskModelId !== obj.taskModelId) {
            errors.push(`${tag} ('${entry.itemId}') belongs to taskModelId '${item.taskModelId}', not this library's '${obj.taskModelId}'.`);
          }
        }
      });
    }

    // At most one compiled package may be the ACTIVE one for a given
    // Task Model -- the same "exactly one active X" invariant
    // statisticalModels enforces above, so exactly one version is ever
    // being served at a time.
    if (obj.active && db && obj.taskModelId) {
      const otherActive = db.compositeLibrary?.find(
        cl => cl.id !== obj.id && cl.taskModelId === obj.taskModelId && cl.active
      );
      if (otherActive) {
        errors.push(`Task model '${obj.taskModelId}' already has an active composite library package ('${otherActive.id}').`);
      }
    }
  }

  /* =====================================================
     CALIBRATION JOBS — D62, W13
     Structural + referential checks. Lifecycle transitions live in
     validateCalibrationJobLifecycle; this block is the shape.
  ===================================================== */

  if (collection === "calibrationJobs") {
    if (!obj.kind) {
      errors.push("kind is required.");
    } else if (!CALIBRATION_JOB_KIND_VALUES.includes(obj.kind)) {
      errors.push(`Invalid calibration job kind '${obj.kind}'. Must be one of: ${CALIBRATION_JOB_KIND_VALUES.join(", ")}.`);
    }

    if (!obj.status) {
      errors.push("status is required.");
    } else if (!CALIBRATION_JOB_STATUS.includes(obj.status)) {
      errors.push(`Invalid calibration job status '${obj.status}'.`);
    }

    if (!obj.evidenceModelId) {
      errors.push("evidenceModelId is required.");
    } else if (db && !db.evidenceModels?.find((m) => m.id === obj.evidenceModelId)) {
      errors.push(`Invalid evidenceModelId: ${obj.evidenceModelId}`);
    }

    if (!obj.statisticalModelId) {
      errors.push("statisticalModelId is required.");
    }

    if (!obj.requestedAt) {
      errors.push("requestedAt is required.");
    }

    if (obj.request !== undefined && obj.request !== null) {
      if (typeof obj.request !== "object" || Array.isArray(obj.request)) {
        errors.push("request should be object");
      }
    } else {
      errors.push("request is required.");
    }

    if (obj.response !== undefined && obj.response !== null) {
      if (typeof obj.response !== "object" || Array.isArray(obj.response)) {
        errors.push("response should be object");
      }
    }

    if (obj.error !== undefined && obj.error !== null) {
      if (typeof obj.error !== "object" || Array.isArray(obj.error)) {
        errors.push("error should be object");
      }
    }

    if (typeof obj.attempts !== "number") {
      errors.push("attempts is required and must be a number.");
    }
    if (typeof obj.maxAttempts !== "number") {
      errors.push("maxAttempts is required and must be a number.");
    }
  }

  return { valid: errors.length === 0, errors };
}

