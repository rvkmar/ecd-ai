# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- D65: calibration console at `/admin/calibration` (also an Admin
  Control Center tab; district read-only at `/district/calibration`).
  Administrator can enqueue `{ fixture: "lsat7" }` bound to an existing
  IRT evidence / statistical model, poll while `queued`/`running`,
  inspect the request and R response (parameters, SEs, fit,
  `packageVersion`, `sampleSize`, `converged`, `error.stderr`), and
  ingest. Ingest of `converged: false` surfaces the 409 and does not
  pretend a parameter set was written. `useProcessCalibrationJob` is
  the operator hook for environments without
  `CALIBRATION_QUEUE_AUTORUN`. Students and teachers have no console
  route. Handoff: `claude/day65-calibration-console.md`.

- D64: LSAT7 (Bock & Lieberman 1970 / `mirt::LSAT7`, 1000×5) is a
  committed frequency-table fixture. `POST /api/calibrationJobs` accepts
  `{ fixture: "lsat7" }` and fills the ADR 0002 request. `npm test`
  always runs enqueue → process → ingest on that matrix with a labeled
  contract stub (not invented mirt estimates). CI job `lsat7-pipeline`
  starts `rvkmar/r-backend:latest` with the repo app bind-mount (same
  path as compose) and asserts a live `/calibrate/irt` run reaches
  `succeeded` + `converged: true` and writes
  `statisticalModels[].parameterSets[]` with `calibrationJobId`.
  Handoff: `claude/day64-lsat7-pipeline.md`.
  Live CI (`lsat7-pipeline`) is green against `mirt 1.47`. Along the
  way: plumber boxed `/health` `status` as `["healthy"]`; `TOL` is a
  top-level `mirt()` argument (not `technical`); do not muffle mirt
  warnings around the fit.

### Changed

- Compose `r-backend` pulls `rvkmar/r-backend:latest` (R packages already
  installed) and bind-mounts `./r-backend/app` so repo plumber routes win.
  The Posit/rocker from-scratch Dockerfile is a thin overlay only; do not
  `docker compose build r-backend` as the default path.

### Added

- D61–D63: the R psychometrics service is a private compose service again
  (`expose: 4000`, `R_BACKEND_URL=http://r-backend:4000`). `/health` reports
  exact running package versions. Calibration runs as a `calibrationJobs`
  queue (`queued → running → succeeded|failed`) with an ADR 0002 request/
  response envelope on both sides. Ingestion writes
  `statisticalModels[].parameterSets[]` and refuses `converged: false`.
  Handoff: `claude/day61-63-r-calibration-scaffold.md`.

### Fixed

- `/submit` no longer calls R for IRT theta (ADR 0001: R is never in a
  session path). The old `/api/calibrate/:id` sync path that posted to
  `r-backend:8000` and wrote `questions[].metadata` is 410.
- R `/health` and `/irt/calibrate` boot: `start.R` sources the programmatic
  router instead of `plumb()`-ing a file that called `$run()`; the CORS
  preroute that referenced unbound `res` is gone; `futures(drop=FALSE)` is
  gone.

- D60 adversarial review of selection/stopping. A draft or archived sibling
  Assembly Model for the same Competency Model used to make
  `resolveAssemblyProgress` omit every SMV (`candidates.length !== 1`), which
  silently disabled `targetsMet` on the unique confirmed/operational model —
  the normal revision case. Progress now prefers the unique governing AM, and
  Activity Selection passes the already-resolved model in so the two lookups
  cannot disagree. Two governing models still apply neither. Draft-only and
  ambiguous matches are now a `warnings` entry rather than a dropped string.
  `/submit` after a persisted stop is 409, so posteriors cannot drift from
  the frozen stop record. Findings: `claude/day60-adversarial-selection-stopping.md`.

### Added

- Session reports now carry the D57 attribute classification and the D58
  stop reason (D59). Learner feedback, the teacher report, the generic
  session report, the report header, the session-list badge, and the
  session-player header all show them. The player ending screen was D58;
  these surfaces were deliberately left out then.

- When a session meets an Assembly Model stopping rule, that decision is
  stored on the session and shown to the examinee (D58). `/next-task` already
  returned `{ stopped }`; the player treated any response without a taskId as
  "No more tasks available", so a met accuracy target looked like an empty
  form. The reason, the rule, and — for a diagnostic stop — each attribute's
  classification now stay on the session record and on the ending screen.
  Status is unchanged until the examinee finishes; a later `/next-task` does
  not re-open a session whose stop has already been written.

- Scoring a response now reads structural facts — the evidence-activation map,
  the evidence rule, the weights — from the active compiled item package for
  that task model, not by walking the live authoring graph on every submit
  (D49c). A missing, inactive, or stale package is refused rather than
  silently scored against whatever the authoring records happen to say today,
  which is the disagreement that would have produced a plausible wrong score.
  Calibrated parameters stay a live lookup: flipping the active parameter set
  still takes effect on the next score, with no rebuild. The snapshot-vs-live
  decision is `docs/adr/0003a-identification-reads-the-active-package.md`.
  Finding F4 is closed (the library has an activation caller, and delivery no
  longer re-walks the authoring graph for Identification). This does not claim
  a browser walk of adaptive selection (D56).

- Diagnostic sessions can now end on a measurement target rather than only on
  length (D57). A DINA / G-DINA attribute-mastery posterior is turned into a
  discrete mastery classification at a stated threshold, and reported with the
  probability that the classification is correct - so an Assembly Model's
  `requiredClassificationAccuracy` target is evaluated instead of merely
  displayed. It had been surfaced-but-unevaluated since it was introduced, and
  the Assembly Model wizard has been telling authors so on screen.
- A stopped session now says what it met. Previously every stopped-session
  record named `requiredSEM` alone, so a session ended by a diagnostic target
  reported `requiredSEM: undefined` and said nothing about the mastery decision
  that ended it. A continuous (SEM) stop is unchanged.
- `docs/adr/0004-mastery-classification-decision-rule.md` records the decision
  rule, why the expected accuracy is the probability of the class actually
  assigned rather than of the more probable one, and why the number reported
  per student is not the test's population classification-accuracy rate.

- Q-matrix editor (D51, partial): attributes×items grid for authoring DINA/G-DINA
  Q-matrices, scoped to a competency model's binary Student Model Variables, wired
  into the Admin page as a new "Q-Matrix" tab. See `claude/day51-w11-calibration-and-qmatrix-editor.md`
  for what shipped vs. what the spec called for.
- Q-matrix validity rules (D52, partial): client-side checks for all-zero rows
  (blocking), duplicate rows, weak identifiability, and low attribute-item
  coverage (all advisory), shown live in the editor grid.
- The Q-matrix grid is now fully keyboard-operable. Arrow keys move between
  cells, space toggles one, and a block of cells can be filled or cleared at
  once — by shift-clicking, or with shift+space for anyone not using a mouse.
  The grid is a single tab stop rather than one per cell, so crossing a large
  matrix no longer takes a press per checkbox.
- The Q-matrix grid now exposes its row and column headers to screen readers
  and announces each cell change, including how many cells a block selection
  affected.
- Each Q-matrix row now shows how many attributes it requires, so an item
  that requires none is readable as a plain "0" rather than only as a red
  row.
- Q-matrix confirmation now checks, on the server, that every item a bound
  diagnostic model will actually score has been given at least one attribute.
  An item that requires no attribute contributes nothing to a diagnosis, and
  the scoring engine already discards such responses — this catches it while
  the matrix is being authored instead.
- Diagnostic (DINA / G-DINA) models can now be authored on the Evidence
  Wizard (D53). Both families appear in the statistical-model picker for a
  binary competency and nowhere else, matching what confirmation actually
  accepts. The new configuration panel binds a Q-matrix and derives
  everything else from it read-only: the attribute list with each
  attribute's type and how many items require it, a note stating that
  mastery patterns are ordered graded-lexicographically and why that is not
  configurable, and — where the competency model declares a trait
  perspective — an advisory that a diagnostic model classifies rather than
  scales. The panel states plainly that slip and guess values are not
  authorable yet, rather than implying a control that does not exist.
- District users can now see the Q-matrices their sessions are scored against,
  read-only, as a "Q-Matrix" tab on the District Dashboard and at the
  spec-named route `/district/q-matrices`. A district user gets no authoring
  affordance anywhere in the surface — no create, no delete, the row action
  reads "View", and every field and grid cell is disabled — but the structure
  stays fully legible: headers, per-row attribute counts and validity
  findings all remain. The server has always refused non-admin writes here;
  this stops the UI offering a button the server would refuse.
- A `dina`-scored item can now be delivered and scored before its Evidence
  Model has any calibrated parameters. An author sets a pilot slip/guess
  pair on the item; a session response scored against it is tagged with
  where its numbers came from and keeps a permanent snapshot of the exact
  pilot values used, so a later calibration or a later edit to the item's
  own pilot values never silently changes what an already-scored response
  meant. `gdina` still has no pilot path — its calibrated parameters are a
  probability table, not a fixed pair, and authoring one is a separate,
  larger piece of work.
- Assembly Models — the layer that decides which items and how many a test
  actually assembles from — can now be authored end-to-end in the Admin UI
  at `/admin/assembly-models`: identity, per-attribute targets, stopping
  rules, and a selection algorithm bound to a policy, with a readiness
  review before confirming. The underlying schema, routes and validation
  already existed; this is the first UI to reach them.
- A test can now stop itself once it has measured enough. Where an Assembly
  Model is declared for the competency model a session is testing, its
  stopping rules now take effect: a ceiling on how many items are presented,
  a floor before any early stop, and — for targets expressed as a standard
  error — stopping once every target is met. A target expressed as a
  classification accuracy is still left unevaluated rather than guessed at,
  so it can never end a session early.
- Adaptive item selection now works from the measurement a session has
  actually produced. Choosing the next item reads the compiled item package
  for the task model together with the session's current ability estimate,
  and resolves item parameters live — so a recalibration takes effect
  immediately, and an item whose evidence model has never been calibrated
  can still be selected on its author-supplied pilot values. Previously
  selection consulted only the legacy question bank, which meant none of the
  evidence a session had gathered informed what it presented next.

### Changed

- Phase-2 `apiFetch` consolidation (D46): every remaining `/api` call in live
  `src/` code now goes through `apiFetch` or an existing React Query hook that
  uses it. Login is included -- `AuthProvider` calls `apiFetch` without a token,
  which is the client's documented pre-auth path. A repo guard in
  `src/test/repoGuards.test.js` fails if a raw `fetch("/api...")` is reintroduced.

- A classification-accuracy target is now evaluated only against an actual
  attribute-mastery posterior. A binary Student Model Variable carrying a
  classical (CTT / sum / threshold) model reports a weighted proportion of
  score - a number between 0 and 1 that looks exactly like a mastery
  probability and is not one - and that combination is authorable today, not a
  drift scenario. Such a target is left explicitly unevaluated with a reason
  naming the model, rather than classified as though the two scales were
  comparable.
- An attribute whose evidence is exactly balanced is now reported as
  `indeterminate` rather than counted as "has not mastered". A Student Model
  Variable with no declared prior starts at exactly 0.5, so this is a value the
  pipeline produces on purpose, not a floating-point accident.

- Q-matrix editor: the Competency Model picker now only lists models that
  declare at least one binary Student Model Variable, since a Q-matrix has
  nothing to bind to otherwise. Previously any competency model could be
  selected, including ones a Q-matrix could never actually be built from.
- Sessions built from legacy questions select exactly as they did before.
  Item-based sessions no longer consult the legacy question bank at all.

### Deprecated

- N/A

### Removed

- `src/api/authFetchInterceptor.js` and its `main.jsx` install. The Phase-1
  `window.fetch` bridge is gone now that every `/api` call site attaches
  Authorization through `apiFetch`.

### Fixed

- Q-matrix duplicate-row check corrected from blocking to advisory, matching
  the D52 spec.
- A Q-matrix used by a diagnostic (DINA/G-DINA) evidence model can no longer
  be deleted. The check that was meant to prevent this had been looking in
  the wrong place since it was written, so it never actually blocked
  anything, and deleting such a Q-matrix left the evidence model pointing at
  a record that no longer existed.
- A diagnostic (DINA/G-DINA) Evidence Model can no longer cite a draft or
  archived Q-matrix and reach `confirmed`. The structural check already
  required a Q-matrix's attributes to be binary; it now also requires the
  Q-matrix itself to be confirmed, operational or suspended, matching every
  other parent-lifecycle rule in the authoring chain.
- The nginx Docker image no longer picks up the host machine's own
  `node_modules`, `dist/` and `.git` when building — a missing
  `.dockerignore` meant the build could silently ship the wrong, host-native
  binaries (and hundreds of extra MB) instead of the ones just installed
  inside the container.
- The Assembly Model wizard no longer saves a draft on leaving its first two
  steps, before a selection algorithm has been chosen. Every save this
  wizard makes requires a selection algorithm to already be set, so the
  earlier auto-save attempt was always refused by the server with a
  confusing error; the first save now correctly waits until that step is
  complete.
- A confirmed Q-matrix can no longer be deleted at all. It defines what every
  attribute-mastery result ever scored against it means, so it is archived
  rather than destroyed — the same rule confirmed items already follow.
- Q-matrix editor: "Save for Review" no longer silently does nothing on a
  brand-new Q-matrix. It previously required two clicks to actually save
  the record for review, with no error shown on the first attempt.
- Q-matrix editor: an item added to the grid with no attributes checked can
  no longer be saved as a draft or sent for review. Previously it could be
  saved and would then silently disappear the next time the record was
  reopened, along with its own validation error.
- Bayesian-network item selection never actually ran. It tested every
  evidence model for a field that has never existed anywhere in the schema,
  so the test failed for all of them and the strategy fell through to simply
  presenting the next unanswered item — an outcome plausible enough that
  nothing ever looked wrong. It now selects the item expected to reveal most
  about the attributes the session is least certain of, using the diagnostic
  mastery estimates already being accumulated. A session carrying no
  diagnostic data still gets the next unanswered item, but now reports that
  it fell back rather than appearing to have chosen.
- A second error in that same unreachable code, corrected rather than
  carried forward: the expected-information calculation treated a correct
  and an incorrect answer as equally likely regardless of how likely either
  actually was, understating an item's value by more than half in some
  cases.

### Security

- An examinee can no longer retrieve teacher-report payloads (D59).
  `GET /api/reports/session/:id/teacher-report`, the class report, and the
  district report are gated with `authorizeRole(["admin", "district",
  "teacher"])`. `SessionReport` stops requesting the teacher payload when
  the signed-in role cannot view `teacherReports`. The dashboard role is
  taken from the token, not from `?role=`.

### Known gaps (carried forward, see progress ledger)

- The mastery cut for a diagnostic classification is fixed at 0.5 and cannot
  be set per Assembly Model or per attribute. 0.5 is the standard rule and the
  right default, but a programme wanting a stricter bar for a high-stakes
  attribute cannot express it yet.
- ~~A mastery classification was absent from learner/teacher report views~~
  closed D59 (player ending screen was D58; reports / header / list badge now).
- The expected classification accuracy reported for a student is the
  confidence in that student's own classification. It is deliberately not the
  test's overall classification-accuracy rate, which needs the whole
  population and is not computed anywhere yet. Averaging the per-student
  figures across a cohort will not produce it.
- The guard that stops unused code shipping can miss an unused export whose
  name is also used by another module — the two cover for each other. Found
  by experiment while adding a new module; not yet fixed.

- The Q-matrix's *advisory* rules (duplicate rows, weak identifiability,
  low coverage) have no server-side equivalent — by design, since they are
  advisory and were never meant to block. The one *blocking* rule is now
  enforced on both sides, with a test asserting the two agree.
- `/district/competencies`, `/district/tasks` and `/district/questions` are
  routed but have no inbound link anywhere in the app, so nothing but a typed
  URL reaches them. `/district/q-matrices` was given a dashboard tab as well
  as a route for exactly this reason; the other three are still unreachable.
- Diagnostic models still cannot score `gdina` on pilot parameters: its
  calibrated parameters are a probability table sized to each item's own
  required-attribute count, not a fixed pair, and authoring that table is
  its own piece of work. `dina` now has a pilot path (see Added, above).
- Creating an item through the API with its pilot DINA slip/guess values
  already set in the same request silently drops them — only a follow-up
  edit persists them. Not believed to be reachable through the Item Wizard
  itself, which sets this field on a later step's own save, but worth
  fixing at the source.
- Q-matrix item scoping uses the item's evidence-model chain rather than a
  "bound Task Model." **Resolved:** the original spec sentence was a layer
  confusion — in ECD the Task Model is the task *environment*, while which
  items belong together is the Assembly Model's role and the matrix itself
  belongs to the Evidence Model's measurement model. The existing scoping
  matches what the scoring engine already enforces. See
  `claude/day52c-qmatrix-item-row-premise.md`.
- A live browser walkthrough of the Q-matrix editor has now been run —
  see `claude/day52-w11-live-browser-walkthrough.md`.
- The Q-matrix editor stays a tab on the Admin page rather than a
  dedicated route — a deliberate decision, not an oversight; see
  `claude/day52b-qmatrix-route-decision.md`.
- There is no district-facing read-only Q-matrix view, though the UI
  specification calls for one. Newly recorded, not previously tracked.
- Remaining D51 debt: the grid is not virtualised above a stated row count.
- A session is not bound to a specific Assembly Model. The one governing a
  session is inferred from the competency model its tasks measure; where two
  confirmed Assembly Models match, none is applied rather than one being
  guessed at, so those sessions get no stopping rules at all. A draft or
  archived sibling no longer vetoes the unique governing model (D60).
- Dual-attribute diagnostic *stopping* will not fire on a one-attribute
  slice of a two-attribute Assembly Model. Dual-attribute *selection* still
  cannot rank an item whose required attributes have no persisted posterior
  yet; leftover items for already-measured attributes win until those are
  exhausted (D60 P1, held — using the SMV prior is a psychometric change).
- BayesianNetwork selection for a G-DINA evidence model cannot rank
  candidates (information gain is DINA slip/guess only) and falls back to
  first-unanswered with a warning.
- ~~Stop reason missing from learner/teacher reports~~ closed D59.
- Adaptive selection still picks the item whose difficulty sits closest to
  the current estimate rather than the one carrying most information at it.
  The latter is the better rule and is deliberately held back for the work
  that checks selection against a published benchmark.
- A session mixing item-based and legacy question-based tasks ranks only the
  item-based ones when selecting adaptively: the two carry ability estimates
  that are not on a common scale and must not be compared in one ranking.
- Adaptive selection has not yet been exercised in a live browser session;
  it is verified by tests only.

## [1.0.0] - 2026-09-10

### Added

- Initial project release with core features.
- Initial setup, configuration files, and documentation.
